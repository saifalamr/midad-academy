import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { lockCourse } from '../lib/enrollment';

const planSchema = z.object({
  version: z.number().int().min(0),
  contentIds: z
    .array(z.string().min(1))
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'لا تكرر المادة في الحصة'),
});
const ordered = { orderBy: { order: 'asc' as const } };

// Registered under /api/admin, inheriting the ADMIN authentication hook.
export async function adminMaterialRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/sessions/:id/materials', async (request) => {
    const session = await prisma.classSession.findUnique({
      where: { id: request.params.id },
      include: { materials: ordered },
    });
    if (!session) throw httpError(404, 'الحصة غير موجودة');
    const library = await prisma.courseContent.findMany({
      where: { courseId: session.courseId, type: { in: ['PDF', 'VIDEO'] } },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, type: true, description: true },
    });
    return { data: { session, library } };
  });
  app.put<{ Params: { id: string } }>('/sessions/:id/materials', async (request) => {
    const body = planSchema.parse(request.body);
    const initial = await prisma.classSession.findUnique({
      where: { id: request.params.id },
      select: { courseId: true },
    });
    if (!initial) throw httpError(404, 'الحصة غير موجودة');
    const session = await prisma.$transaction(async (tx) => {
      // Shares the start/cancel/course-reassignment lock: no curriculum changes mid-class.
      await lockCourse(tx, initial.courseId);
      const current = await tx.classSession.findUniqueOrThrow({ where: { id: request.params.id } });
      if (current.status !== 'SCHEDULED')
        throw httpError(409, 'يمكن تعديل مواد الحصة قبل بدايتها فقط');
      if (current.materialsVersion !== body.version)
        throw httpError(409, 'الخطة تغيرت في صفحة أخرى. أعد تحميلها قبل الحفظ');
      const content = await tx.courseContent.findMany({
        where: {
          id: { in: body.contentIds },
          courseId: current.courseId,
          type: { in: ['PDF', 'VIDEO'] },
        },
      });
      if (content.length !== body.contentIds.length)
        throw httpError(400, 'اختر ملفات PDF أو فيديو من منهج هذه الدورة فقط');
      const byId = new Map(content.map((item) => [item.id, item]));
      await tx.sessionMaterial.deleteMany({ where: { sessionId: current.id } });
      await tx.sessionMaterial.createMany({
        data: body.contentIds.map((contentId, order) => {
          const item = byId.get(contentId)!;
          return {
            sessionId: current.id,
            contentId,
            order,
            title: item.title,
            type: item.type,
            contentUrl: item.contentUrl,
            description: item.description,
          };
        }),
      });
      return tx.classSession.update({
        where: { id: current.id },
        data: { materialsVersion: { increment: 1 } },
        include: { materials: ordered },
      });
    });
    return { data: session };
  });
}

// Reading a teaching plan never grants course/student/parent classroom permissions.
export async function teacherMaterialRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/:id/materials',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'TEACHER')
        return reply.status(403).send({ error: 'خطة الحصة للمعلم المسؤول فقط' });
      const session = await prisma.classSession.findFirst({
        where: { id: request.params.id, teacher: { userId: request.user.id } },
        include: { materials: ordered, course: { select: { title: true, timeZone: true } } },
      });
      if (!session) throw httpError(404, 'الحصة غير موجودة');
      return { data: session };
    }
  );
  app.get<{ Params: { courseId: string } }>(
    '/materials/live/:courseId',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'TEACHER')
        return reply.status(403).send({ error: 'خطة الحصة للمعلم المسؤول فقط' });
      const session = await prisma.classSession.findFirst({
        where: {
          courseId: request.params.courseId,
          status: 'LIVE',
          teacher: { userId: request.user.id },
        },
        include: { materials: ordered },
      });
      if (!session) throw httpError(404, 'لا توجد حصة مباشرة لك في هذه الدورة');
      return { data: session };
    }
  );
}
