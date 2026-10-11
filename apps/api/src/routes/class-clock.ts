import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { canReadClassroom, httpError } from '../lib/access';
import { lockCourse } from '../lib/enrollment';

function phases(duration: number, saved: number[]) {
  if (saved.length === 4) return saved;
  const review = Math.max(1, Math.floor(duration / 5));
  const interaction = review;
  const homework = Math.max(1, Math.floor(duration / 10));
  return [review, duration - review - interaction - homework, interaction, homework];
}
export async function classClockRoutes(app: FastifyInstance) {
  const dto = (s: {
    id: string;
    startedAt: Date | null;
    durationMinutes: number;
    phaseMinutes: number[];
    clockVersion: number;
  }) => ({
    sessionId: s.id,
    startedAt: s.startedAt,
    minutes: phases(s.durationMinutes, s.phaseMinutes),
    durationMinutes: s.durationMinutes,
    version: s.clockVersion,
    serverNow: new Date(),
  });
  app.get<{ Params: { courseId: string } }>(
    '/clock/:courseId',
    { preHandler: [app.authenticate] },
    async (request) => {
      if (!(await canReadClassroom(request.user, request.params.courseId)))
        throw httpError(403, 'لا يمكنك الاطلاع على هذه الحصة');
      const session = await prisma.classSession.findFirst({
        where: { courseId: request.params.courseId, status: 'LIVE' },
      });
      if (!session) throw httpError(404, 'لا توجد حصة مباشرة');
      return { data: dto(session) };
    }
  );
  app.put<{ Params: { courseId: string } }>(
    '/clock/:courseId',
    { preHandler: [app.authenticate] },
    async (request) => {
      if (request.user.role !== 'TEACHER')
        throw httpError(403, 'تعديل تقسيم الحصة للمعلم المسؤول فقط');
      const body = z
        .object({
          version: z.number().int().min(0),
          minutes: z.array(z.number().int().min(1).max(240)).length(4),
        })
        .parse(request.body);
      const session = await prisma.$transaction(async (tx) => {
        await lockCourse(tx, request.params.courseId);
        const s = await tx.classSession.findFirst({
          where: {
            courseId: request.params.courseId,
            status: 'LIVE',
            teacher: { userId: request.user.id },
          },
        });
        if (!s) throw httpError(404, 'لا توجد حصة مباشرة لك');
        if (s.clockVersion !== body.version)
          throw httpError(409, 'التقسيم تغير في صفحة أخرى. حدّث الصفحة');
        if (body.minutes.reduce((a, b) => a + b, 0) !== s.durationMinutes)
          throw httpError(400, `مجموع المراحل يجب أن يساوي مدة الحصة: ${s.durationMinutes} دقيقة`);
        return tx.classSession.update({
          where: { id: s.id },
          data: { phaseMinutes: body.minutes, clockVersion: { increment: 1 } },
        });
      });
      return { data: dto(session) };
    }
  );
}
