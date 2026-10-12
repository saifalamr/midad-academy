import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { lockCourse } from '../lib/enrollment';
import { applySpeakingState, roomService, syncPresence } from '../lib/classroom-control';
export async function classroomModerationRoutes(app: FastifyInstance) {
  app.get<{ Params: { courseId: string }; Querystring: { roomName?: string } }>(
    '/microphones/:courseId',
    { preHandler: [app.authenticate] },
    async (request) => {
      if (request.user.role !== 'TEACHER') throw httpError(403, 'تحكم المايك للمعلم المسؤول فقط');
      const session = await prisma.classSession.findFirst({
        where: {
          courseId: request.params.courseId,
          status: 'LIVE',
          teacher: { userId: request.user.id },
        },
        include: {
          speakingPermissions: true,
          course: {
            include: {
              enrollments: {
                where: { status: 'ACTIVE', student: { user: { role: 'STUDENT' } } },
                include: { student: { include: { user: { select: { id: true, name: true } } } } },
              },
            },
          },
        },
      });
      if (
        !session?.liveKitRoomId ||
        (request.query.roomName && request.query.roomName !== session.liveKitRoomId)
      )
        throw httpError(409, 'الحصة المباشرة تغيرت أو انتهت');
      let connected: Awaited<
        ReturnType<ReturnType<typeof roomService>['listParticipants']>
      > | null = null;
      try {
        connected = await roomService().listParticipants(session.liveKitRoomId);
      } catch {
        request.log.warn('Microphone provider status unavailable');
      }
      return {
        data: {
          sessionId: session.id,
          version: session.microphoneVersion,
          providerAvailable: !!connected,
          students: session.course.enrollments.map((e) => {
            const allowed = session.speakingPermissions.some((p) => p.userId === e.student.userId);
            const participant = connected?.find((p) => p.identity === e.student.userId);
            const canPublishAudio =
              !!participant?.permission?.canPublish &&
              (!participant.permission.canPublishSources.length ||
                participant.permission.canPublishSources.includes(2));
            return {
              userId: e.student.user.id,
              name: e.student.user.name,
              allowed,
              connected: connected ? !!participant : null,
              applied: participant
                ? !!participant.permission &&
                  canPublishAudio === allowed &&
                  (allowed ||
                    !participant.tracks?.some((t) => [2, 4].includes(t.source) && !t.muted))
                : null,
            };
          }),
        },
      };
    }
  );
  app.put<{ Params: { courseId: string } }>(
    '/microphones/:courseId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'TEACHER') throw httpError(403, 'تحكم المايك للمعلم المسؤول فقط');
      const body = z
        .object({
          sessionId: z.string().min(1),
          version: z.number().int().min(0),
          userId: z.string().min(1).optional(),
          allowed: z.boolean(),
        })
        .refine((b) => b.userId || !b.allowed, 'السماح يكون لطالب محدد')
        .parse(request.body);
      await prisma.$transaction(async (tx) => {
        await lockCourse(tx, request.params.courseId);
        const session = await tx.classSession.findFirst({
          where: {
            id: body.sessionId,
            courseId: request.params.courseId,
            status: 'LIVE',
            teacher: { userId: request.user.id },
          },
        });
        if (!session) throw httpError(409, 'الحصة انتهت أو لا تخصك');
        if (session.microphoneVersion !== body.version)
          throw httpError(409, 'تغيرت الأذونات في نافذة أخرى. حدّث القائمة');
        if (
          body.userId &&
          !(await tx.enrollment.findFirst({
            where: {
              courseId: session.courseId,
              status: 'ACTIVE',
              student: { userId: body.userId, user: { role: 'STUDENT' } },
            },
          }))
        )
          throw httpError(404, 'الطالب ليس مسجلًا في هذه الدورة');
        if (body.allowed)
          await tx.sessionSpeakingPermission.upsert({
            where: { sessionId_userId: { sessionId: session.id, userId: body.userId! } },
            create: { sessionId: session.id, userId: body.userId! },
            update: {},
          });
        else
          await tx.sessionSpeakingPermission.deleteMany({
            where: { sessionId: session.id, ...(body.userId ? { userId: body.userId } : {}) },
          });
        await tx.classSession.update({
          where: { id: session.id },
          data: { microphoneVersion: { increment: 1 } },
        });
      });
      try {
        const applied = await applySpeakingState(
          request.params.courseId,
          body.sessionId,
          body.userId
        );
        if (applied.microphoneVersion !== body.version + 1)
          throw httpError(409, 'تغيرت الأذونات أثناء التنفيذ؛ عُرضت آخر حالة. راجع القائمة.');
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 502)
          return reply.status(502).send({
            error:
              'حُفظ الإذن، لكن تعذر تأكيد تطبيقه على المكالمة. أعد المحاولة؛ لا تعتبر الكتم مؤكّدًا بعد.',
          });
        throw error;
      }
      return { message: body.allowed ? 'سُمح للطالب بتشغيل المايك بنفسه' : 'تم قفل المايك' };
    }
  );
  app.post<{ Params: { courseId: string } }>(
    '/presence/:courseId',
    { preHandler: [app.authenticate] },
    async (request) => {
      if (!['TEACHER', 'STUDENT'].includes(request.user.role))
        throw httpError(403, 'تأكيد الحضور للمعلم والطالب فقط');
      const { roomName } = z.object({ roomName: z.string().min(1) }).parse(request.body);
      const session = await prisma.classSession.findFirst({
        where: { courseId: request.params.courseId, status: 'LIVE', liveKitRoomId: roomName },
      });
      if (!session) throw httpError(409, 'الحصة غير مباشرة');
      const participants = await roomService().listParticipants(roomName);
      if (!participants.some((p) => p.identity === request.user.id && p.sid))
        throw httpError(409, 'لم يتأكد اتصالك بالمكالمة بعد');
      if (
        request.user.role === 'TEACHER' &&
        !(await prisma.teacherProfile.findFirst({
          where: { id: session.teacherId, userId: request.user.id },
        }))
      )
        throw httpError(403, 'الحصة لا تخص هذا المعلم');
      if (
        request.user.role === 'STUDENT' &&
        !(await prisma.enrollment.findFirst({
          where: {
            courseId: session.courseId,
            status: 'ACTIVE',
            student: { userId: request.user.id },
          },
        }))
      )
        throw httpError(403, 'الطالب غير مسجل في هذه الدورة');
      await syncPresence(
        session,
        participants,
        new Date(),
        request.user.role === 'STUDENT' ? request.user.id : undefined
      );
      if (request.user.role === 'STUDENT')
        await applySpeakingState(session.courseId, session.id, request.user.id);
      return { received: true };
    }
  );
}
