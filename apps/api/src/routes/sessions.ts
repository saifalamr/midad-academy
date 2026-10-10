import type { FastifyInstance } from 'fastify';
import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { canAccessCourse, canObserveCourse, canReadClassroom, httpError } from '../lib/access';
import { lockCourse } from '../lib/enrollment';
import { completeClassroom } from '../lib/classroom';
import { setDrawingPermission } from '../ws-server';

const createSessionSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
});

const joinSessionSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
});

// LiveKit's RoomServiceClient needs an HTTP(S) URL, not WSS.
function toHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export async function sessionRoutes(app: FastifyInstance) {
  // ── POST /api/sessions/create ─────────────────────────────────────────────
  // Creates (or reuses) a LiveKit room and returns a signed participant token.
  // The caller's identity, display name, and role come from the verified JWT —
  // the frontend never needs to send those.
  app.post('/create', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { roomName } = createSessionSchema.parse(request.body);
    if (role !== 'TEACHER' || !(await canAccessCourse(request.user, roomName)))
      return reply.status(403).send({ error: 'Only the course teacher can start this classroom' });
    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
      return reply.status(503).send({ error: 'Live classroom service is not configured' });
    const live = await prisma.classSession.findFirst({
      where: { courseId: roomName, status: 'LIVE' },
    });
    if (!live)
      return reply
        .status(409)
        .send({ error: 'Start a scheduled session from your dashboard first' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Ensure the room exists on LiveKit Cloud (idempotent — safe to call again
    // if the room is already live).
    const roomService = new RoomServiceClient(
      toHttpUrl(config.LIVEKIT_URL),
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET
    );
    const existing = await roomService.listRooms([live.liveKitRoomId ?? `class-${live.id}`]);
    if (!existing.length)
      return reply
        .status(409)
        .send({ error: 'This class has ended; start a new scheduled session' });

    // Mint a participant token. Role metadata is read by the classroom UI to
    // decide which video feed goes in the large "teacher" slot.
    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: '15m',
      name: user.name,
      metadata: JSON.stringify({ role: role.toLowerCase() }),
    });
    at.addGrant({
      roomJoin: true,
      room: live.liveKitRoomId ?? `class-${live.id}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    return reply.send({ data: { token, roomName, livekitUrl: config.LIVEKIT_URL } });
  });

  // ── POST /api/sessions/join ───────────────────────────────────────────────
  // Lets an enrolled student join a class that's already live. Unlike
  // /create, this never creates the room — a missing room means the teacher
  // hasn't started the session yet, so we tell the student to wait.
  app.post('/join', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can use this endpoint' });
    }

    const { roomName } = joinSessionSchema.parse(request.body);

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    // Course rooms are named after the course id (see /create + the teacher
    // dashboard's "Start Class" button) — confirm the student is enrolled.
    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId: roomName, studentId: studentProfile.id } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      return reply.status(403).send({ error: 'You are not enrolled in this course' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
      return reply.status(503).send({ error: 'Live classroom service is not configured' });
    const roomService = new RoomServiceClient(
      toHttpUrl(config.LIVEKIT_URL),
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET
    );
    const live = await prisma.classSession.findFirst({
      where: { courseId: roomName, status: 'LIVE' },
    });
    if (!live?.liveKitRoomId) return reply.status(409).send({ error: 'This class is not live' });
    const rooms = await roomService.listRooms([live.liveKitRoomId]);
    if (rooms.length === 0) {
      return reply
        .status(409)
        .send({ error: 'This class is not live yet — please wait for your teacher to start it' });
    }

    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: '15m',
      name: user.name,
      metadata: JSON.stringify({ role: role.toLowerCase() }),
    });
    at.addGrant({
      roomJoin: true,
      room: live.liveKitRoomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    return reply.send({ data: { token, roomName, livekitUrl: config.LIVEKIT_URL } });
  });

  app.post('/observe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { roomName } = joinSessionSchema.parse(request.body);
    if (!(await canObserveCourse(request.user, roomName)))
      return reply.status(403).send({ error: 'Only parents of enrolled children can observe this classroom' });
    const live = await prisma.classSession.findFirst({ where: { courseId: roomName, status: 'LIVE' } });
    if (!live?.liveKitRoomId) return reply.status(409).send({ error: 'This class is not live' });
    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
      return reply.status(503).send({ error: 'Live classroom service is not configured' });
    const service = new RoomServiceClient(toHttpUrl(config.LIVEKIT_URL), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
    if (!(await service.listRooms([live.liveKitRoomId])).length)
      return reply.status(409).send({ error: 'This class has ended' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id }, select: { name: true } });
    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: request.user.id, name: user.name, ttl: '15m', metadata: JSON.stringify({ role: 'parent' }),
    });
    at.addGrant({ roomJoin: true, room: live.liveKitRoomId, canSubscribe: true,
      canPublish: false, canPublishData: false, canUpdateOwnMetadata: false });
    return { data: { token: await at.toJwt(), roomName, livekitUrl: config.LIVEKIT_URL } };
  });

  // ── POST /api/sessions/schedule ───────────────────────────────────────────
  // A teacher schedules a class session for one of their courses.
  app.post('/schedule', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.status(403).send({ error: 'مواعيد الحصص تحددها إدارة الأكاديمية.' });
  });

  // ── GET /api/sessions/upcoming ────────────────────────────────────────────
  // Teachers see their own upcoming sessions; students see upcoming sessions
  // for courses they're enrolled in.
  app.get('/upcoming', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role === 'PARENT') {
      const sessions = await prisma.classSession.findMany({
        where: { status: 'LIVE', course: { enrollments: { some: { status: 'ACTIVE', student: { parent: { userId } } } } } },
        select: { id: true, courseId: true, title: true, scheduledAt: true, status: true,
          course: { select: { title: true } }, teacher: { select: { user: { select: { name: true } } } } },
        orderBy: { scheduledAt: 'asc' },
      });
      return { data: sessions.map(({ teacher, ...session }) => ({ ...session, teacherName: teacher.user.name })) };
    }

    if (role === 'TEACHER') {
      const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
      if (!teacherProfile) {
        return reply.status(404).send({ error: 'Teacher profile not found' });
      }

      const sessions = await prisma.classSession.findMany({
        where: {
          teacherId: teacherProfile.id,
          OR: [
            { status: 'LIVE' },
            { status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
          ],
        },
        include: { course: { select: { id: true, title: true } } },
        orderBy: { scheduledAt: 'asc' },
      });

      return reply.send({ data: sessions });
    }

    if (role === 'STUDENT') {
      const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
      if (!studentProfile) {
        return reply.status(404).send({ error: 'Student profile not found' });
      }

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: studentProfile.id, status: 'ACTIVE' },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);

      const sessions = await prisma.classSession.findMany({
        where: {
          courseId: { in: courseIds },
          OR: [
            { status: 'LIVE' },
            { status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
          ],
        },
        include: {
          course: { select: { id: true, title: true } },
          teacher: { include: { user: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: 'asc' },
      });

      return reply.send({
        data: sessions.map((s) => ({
          ...s,
          teacherName: s.teacher.user.name,
          teacher: undefined,
        })),
      });
    }

    return reply.status(403).send({ error: 'Not authorized to view sessions' });
  });

  // ── PATCH /api/sessions/:id/cancel ────────────────────────────────────────
  // The owning teacher cancels a scheduled class session.
  app.patch<{ Params: { id: string } }>(
    '/:id/cancel',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      return reply.status(403).send({ error: 'إلغاء المواعيد من صلاحيات إدارة الأكاديمية.' });
    }
  );

  // ── PATCH /api/sessions/:id/start ─────────────────────────────────────────
  // The owning teacher starts a scheduled class session — marks it LIVE and
  // records the LiveKit room (named after the course id, per the classroom
  // join convention).
  app.patch<{ Params: { id: string } }>(
    '/:id/start',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id: userId, role } = request.user;
      const { id: sessionId } = request.params;

      if (role !== 'TEACHER') {
        return reply.status(403).send({ error: 'Only teachers can start sessions' });
      }

      const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
      if (!teacherProfile) {
        return reply.status(404).send({ error: 'Teacher profile not found' });
      }

      const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
      if (!session || session.teacherId !== teacherProfile.id) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
        return reply.status(503).send({ error: 'Live classroom service is not configured' });
      const service = new RoomServiceClient(
        toHttpUrl(config.LIVEKIT_URL),
        config.LIVEKIT_API_KEY,
        config.LIVEKIT_API_SECRET
      );
      // Starts, ends and provider completion share the same course lock. Re-entering
      // a LIVE session must never recreate an expired room with an old room name.
      const updated = await prisma.$transaction(
        async (tx) => {
          const course = await lockCourse(tx, session.courseId);
          const current = await tx.classSession.findUniqueOrThrow({ where: { id: sessionId } });
          if (!['SCHEDULED', 'LIVE'].includes(current.status))
            throw httpError(409, 'This session cannot be started');
          if (
            await tx.classSession.findFirst({
              where: { courseId: session.courseId, status: 'LIVE', id: { not: sessionId } },
            })
          )
            throw httpError(409, 'End the current live session first');
          if (current.status === 'LIVE') {
            const existing = current.liveKitRoomId
              ? await service.listRooms([current.liveKitRoomId])
              : [];
            if (!existing.length)
              throw httpError(
                409,
                'This class has ended; end it in the dashboard and schedule a new session'
              );
            return current;
          }
          const liveKitRoomId = `class-${current.id}`;
          await service.createRoom({
            name: liveKitRoomId,
            emptyTimeout: 600,
            maxParticipants: course.maxStudents * 2 + 1,
          });
          return tx.classSession.update({
            where: { id: sessionId },
            data: { status: 'LIVE', liveKitRoomId },
          });
        },
        { timeout: 20_000, maxWait: 20_000 }
      );

      return reply.send({ data: updated });
    }
  );
  app.post('/end', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { roomName } = createSessionSchema.parse(request.body);
    if (request.user.role !== 'TEACHER' || !(await canAccessCourse(request.user, roomName)))
      return reply.status(403).send({ error: 'Only the course teacher can end this class' });
    const service =
      config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET
        ? new RoomServiceClient(
            toHttpUrl(config.LIVEKIT_URL),
            config.LIVEKIT_API_KEY,
            config.LIVEKIT_API_SECRET
          )
        : null;
    await prisma.$transaction(
      async (tx) => {
        await lockCourse(tx, roomName);
        const sessions = await tx.classSession.findMany({
          where: { courseId: roomName, status: 'LIVE' },
        });
        for (const session of sessions) {
          if (
            service &&
            session.liveKitRoomId &&
            (await service.listRooms([session.liveKitRoomId])).length
          )
            await service.deleteRoom(session.liveKitRoomId);
        }
        await completeClassroom(
          tx,
          roomName,
          sessions.map((s) => s.id)
        );
      },
      { timeout: 20_000, maxWait: 20_000 }
    );
    return { message: 'Class ended' };
  });
  app.post('/drawing-permission', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { roomName, studentId, canDraw } = z
      .object({ roomName: z.string(), studentId: z.string(), canDraw: z.boolean() })
      .parse(request.body);
    if (request.user.role !== 'TEACHER' || !(await canAccessCourse(request.user, roomName)))
      return reply.status(403).send({ error: 'Only the course teacher can manage drawing access' });
    if (!(await canAccessCourse({ id: studentId, role: 'STUDENT' }, roomName)))
      return reply.status(404).send({ error: 'Student not enrolled' });
    await prisma.$transaction(async (tx) => {
      await lockCourse(tx, roomName);
      if (canDraw)
        await tx.drawingPermission.upsert({
          where: { courseId_userId: { courseId: roomName, userId: studentId } },
          create: { courseId: roomName, userId: studentId },
          update: {},
        });
      else
        await tx.drawingPermission.deleteMany({ where: { courseId: roomName, userId: studentId } });
      setDrawingPermission(roomName, studentId, canDraw);
    });
    return { message: 'Drawing permission updated' };
  });
  app.get<{ Params: { courseId: string } }>(
    '/state/:courseId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId } = request.params;
      if (!(await canReadClassroom(request.user, courseId)))
        return reply.status(403).send({ error: 'Course access required' });
      const state = await prisma.classroomState.findUnique({ where: { courseId } });
      const grants = await prisma.drawingPermission.findMany({
        where: { courseId },
        select: { userId: true },
      });
      return {
        data: {
          sharedDoc: state?.sharedDoc ?? null,
          pdfPage: state?.pdfPage ?? 1,
          revision: state?.revision ?? 0,
          canDraw:
            request.user.role === 'TEACHER' || (request.user.role === 'STUDENT' && grants.some((g) => g.userId === request.user.id)),
          permittedStudents: request.user.role === 'TEACHER' ? grants.map((g) => g.userId) : [],
        },
      };
    }
  );
  app.patch<{ Params: { courseId: string } }>(
    '/state/:courseId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { courseId } = request.params;
      if (request.user.role !== 'TEACHER' || !(await canAccessCourse(request.user, courseId)))
        return reply
          .status(403)
          .send({ error: 'Only the course teacher can change shared material' });
      const doc = z
        .object({
          url: z.string().max(2000),
          name: z.string().min(1).max(200),
          docType: z.enum(['pdf', 'image', 'youtube', 'video', 'html']),
          htmlContent: z.string().max(32000).optional(),
        })
        .superRefine((v, ctx) => {
          if (v.docType !== 'html') {
            try {
              if (!['http:', 'https:'].includes(new URL(v.url).protocol)) throw new Error();
            } catch {
              ctx.addIssue({ code: 'custom', path: ['url'], message: 'Use an HTTP or HTTPS URL' });
            }
          }
          if (v.docType === 'html' && !v.htmlContent?.trim())
            ctx.addIssue({
              code: 'custom',
              path: ['htmlContent'],
              message: 'Lesson HTML is required',
            });
        });
      const body = z
        .object({
          sharedDoc: doc.nullable().optional(),
          pdfPage: z.number().int().min(1).max(5000).optional(),
        })
        .parse(request.body);
      const data = {
        ...(body.sharedDoc !== undefined
          ? { sharedDoc: body.sharedDoc === null ? Prisma.DbNull : body.sharedDoc }
          : {}),
        ...(body.pdfPage !== undefined ? { pdfPage: body.pdfPage } : {}),
        revision: { increment: 1 },
      };
      const state = await prisma.classroomState.upsert({
        where: { courseId },
        create: {
          courseId,
          sharedDoc: body.sharedDoc ?? Prisma.DbNull,
          pdfPage: body.pdfPage ?? 1,
        },
        update: data,
      });
      const live = await prisma.classSession.findFirst({ where: { courseId, status: 'LIVE' } });
      if (live?.liveKitRoomId && config.LIVEKIT_URL) {
        try {
          await new RoomServiceClient(
            toHttpUrl(config.LIVEKIT_URL),
            config.LIVEKIT_API_KEY,
            config.LIVEKIT_API_SECRET
          ).updateRoomMetadata(live.liveKitRoomId, JSON.stringify({ revision: state.revision }));
        } catch (error) {
          request.log.warn({ error }, 'Classroom state saved; room notification unavailable');
        }
      }
      return { data: state };
    }
  );
  await app.register(async (webhooks) => {
    webhooks.addContentTypeParser(
      'application/webhook+json',
      { parseAs: 'string' },
      (_req, body, done) => done(null, body)
    );
    webhooks.post('/webhook', { config: { rateLimit: false } }, async (request, reply) => {
      if (!config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
        return reply.status(503).send({ error: 'LiveKit webhook is not configured' });
      let event;
      try {
        event = await new WebhookReceiver(
          config.LIVEKIT_API_KEY,
          config.LIVEKIT_API_SECRET
        ).receive(request.body as string, request.headers.authorization);
      } catch {
        return reply.status(401).send({ error: 'Invalid webhook signature' });
      }
      const roomName = event.room?.name;
      if (!roomName) return { received: true };
      if (event.event === 'participant_joined' && event.participant?.identity) {
        const student = await prisma.studentProfile.findUnique({
          where: { userId: event.participant.identity },
        });
        const session = await prisma.classSession.findFirst({
          where: { liveKitRoomId: roomName, status: 'LIVE' },
        });
        if (
          student &&
          session &&
          (await canAccessCourse({ id: student.userId, role: 'STUDENT' }, session.courseId))
        ) {
          await prisma.$transaction(async (tx) => {
            await tx.sessionAttendance.upsert({
              where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
              create: { sessionId: session.id, studentId: student.id },
              update: {},
            });
            const award = await tx.pointTransaction.createMany({
              data: {
                studentId: student.id,
                points: 10,
                event: 'Class attendance',
                eventKey: `attendance:${session.id}:${student.id}`,
              },
              skipDuplicates: true,
            });
            if (award.count)
              await tx.studentProfile.update({
                where: { id: student.id },
                data: { totalPoints: { increment: 10 } },
              });
          });
        }
      }
      if (event.event === 'room_finished') {
        const session = await prisma.classSession.findFirst({
          where: { liveKitRoomId: roomName, status: 'LIVE' },
        });
        if (session)
          await prisma.$transaction(async (tx) => {
            await lockCourse(tx, session.courseId);
            await completeClassroom(tx, session.courseId, [session.id]);
          });
      }
      return { received: true };
    });
  });
}
