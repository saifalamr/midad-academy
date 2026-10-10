import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';

const reportBody = z.object({
  performance: z.enum(['NOT_ASSESSED', 'EXCELLENT', 'GOOD', 'NEEDS_SUPPORT']),
  participationCount: z.number().int().min(0).max(200),
  homework: z.enum(['NOT_ASSIGNED', 'COMPLETED', 'PARTIAL', 'NOT_DONE']),
  note: z.string().trim().max(3000),
  version: z.number().int().min(0),
  publish: z.boolean(),
});

export async function sessionReportRoutes(app: FastifyInstance) {
  app.get('/reports', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'TEACHER')
      return reply.status(403).send({ error: 'Teacher access required' });
    const sessions = await prisma.classSession.findMany({
      where: { status: 'COMPLETED', teacher: { userId: request.user.id } },
      include: {
        course: {
          select: {
            title: true,
            timeZone: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              select: { studentId: true, enrolledAt: true },
            },
          },
        },
        attendance: { select: { studentId: true } },
        reports: { select: { studentId: true, publishedAt: true } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });
    return {
      data: sessions.map((s) => {
        const students = new Set([
          ...s.course.enrollments
            .filter((e) => e.enrolledAt <= s.scheduledAt)
            .map((e) => e.studentId),
          ...s.attendance.map((a) => a.studentId),
          ...s.reports.map((r) => r.studentId),
        ]);
        const published = s.reports.filter((r) => r.publishedAt).length;
        return {
          id: s.id,
          courseId: s.courseId,
          title: s.title,
          courseTitle: s.course.title,
          timeZone: s.course.timeZone,
          scheduledAt: s.scheduledAt,
          total: students.size,
          published,
          pending: students.size - published,
        };
      }),
    };
  });

  app.get<{ Params: { sessionId: string } }>(
    '/reports/:sessionId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'TEACHER')
        return reply.status(403).send({ error: 'Teacher access required' });
      const session = await prisma.classSession.findFirst({
        where: {
          id: request.params.sessionId,
          teacher: { userId: request.user.id },
          status: 'COMPLETED',
        },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          courseId: true,
          course: { select: { title: true, timeZone: true } },
        },
      });
      if (!session) return reply.status(404).send({ error: 'Completed session not found' });
      const students = await prisma.studentProfile.findMany({
        where: {
          OR: [
            {
              enrollments: {
                some: {
                  courseId: session.courseId,
                  status: 'ACTIVE',
                  enrolledAt: { lte: session.scheduledAt },
                },
              },
            },
            { attendance: { some: { sessionId: session.id } } },
            { sessionReports: { some: { sessionId: session.id } } },
          ],
        },
        select: {
          id: true,
          user: { select: { name: true } },
          attendance: { where: { sessionId: session.id }, select: { id: true } },
          sessionReports: { where: { sessionId: session.id } },
        },
        orderBy: { user: { name: 'asc' } },
      });
      return {
        data: {
          ...session,
          students: students.map((s) => ({
            id: s.id,
            name: s.user.name,
            attended: !!s.attendance.length,
            report: s.sessionReports[0] ?? null,
          })),
        },
      };
    }
  );

  app.put<{ Params: { sessionId: string; studentId: string } }>(
    '/reports/:sessionId/:studentId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'TEACHER')
        return reply.status(403).send({ error: 'Teacher access required' });
      const body = reportBody.parse(request.body);
      const { sessionId, studentId } = request.params;
      const report = await prisma.$transaction(async (tx) => {
        // Serialize first saves and publication for the same session; versions reject stale tabs.
        await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`;
        const session = await tx.classSession.findFirst({
          where: { id: sessionId, teacher: { userId: request.user.id }, status: 'COMPLETED' },
        });
        if (!session) throw httpError(404, 'الحصة المكتملة غير متاحة لهذا المعلم.');
        const attendance = await tx.sessionAttendance.findUnique({
          where: { sessionId_studentId: { sessionId, studentId } },
        });
        const existing = await tx.sessionReport.findUnique({
          where: { sessionId_studentId: { sessionId, studentId } },
        });
        const enrollment = await tx.enrollment.findFirst({
          where: {
            courseId: session.courseId,
            studentId,
            status: 'ACTIVE',
            enrolledAt: { lte: session.scheduledAt },
          },
        });
        if (!enrollment && !attendance && !existing)
          throw httpError(404, 'الطالب ليس ضمن طلاب هذه الحصة.');
        if (existing?.publishedAt) throw httpError(409, 'التقرير معتمد بالفعل. حدّث الصفحة لعرضه.');
        if (body.version !== (existing?.version ?? 0))
          throw httpError(409, 'تغيرت المسودة في نافذة أخرى. حدّث الصفحة قبل الحفظ.');
        if (body.publish && body.note.length < 3)
          throw httpError(400, 'اكتب ملاحظة واضحة لولي الأمر قبل الاعتماد.');
        if (!attendance && (body.participationCount !== 0 || body.performance !== 'NOT_ASSESSED'))
          throw httpError(400, 'الطالب الغائب لا يُقيّم في الحصة ولا تُسجل له مشاركات.');
        const data = {
          performance: body.performance,
          participationCount: body.participationCount,
          homework: body.homework,
          note: body.note,
          publishedAt: body.publish ? new Date() : null,
        };
        return tx.sessionReport.upsert({
          where: { sessionId_studentId: { sessionId, studentId } },
          create: { sessionId, studentId, ...data },
          update: { ...data, version: { increment: 1 } },
        });
      });
      return { data: report };
    }
  );
}
