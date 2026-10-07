import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { canAccessCourse } from '../lib/access';

const stateSchema = z.object({ completed: z.boolean().optional(), note: z.string().max(5000).optional() }).strict()
  .refine(body => body.completed !== undefined || body.note !== undefined, 'Provide completion or a note');

export async function learningRoutes(app: FastifyInstance) {
  app.get<{ Params: { courseId: string } }>('/courses/:courseId', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'STUDENT') return reply.status(403).send({ error: 'Only students can access private learning notes' });
    if (!await canAccessCourse(request.user, request.params.courseId)) return reply.status(403).send({ error: 'An active enrollment is required' });
    const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: request.user.id } });
    const states = await prisma.learningState.findMany({ where: { studentId: student.id, content: { courseId: request.params.courseId } }, select: { contentId: true, completedAt: true, note: true, updatedAt: true } });
    return { data: states };
  });

  app.patch<{ Params: { contentId: string } }>('/lessons/:contentId', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'STUDENT') return reply.status(403).send({ error: 'Only students can update their learning state' });
    const body = stateSchema.parse(request.body);
    const content = await prisma.courseContent.findUnique({ where: { id: request.params.contentId }, select: { courseId: true } });
    if (!content || !await canAccessCourse(request.user, content.courseId)) return reply.status(403).send({ error: 'An active enrollment is required' });
    const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: request.user.id } });
    const state = await prisma.learningState.upsert({
      where: { studentId_contentId: { studentId: student.id, contentId: request.params.contentId } },
      create: { studentId: student.id, contentId: request.params.contentId, note: body.note ?? '', completedAt: body.completed ? new Date() : null },
      update: { ...(body.note !== undefined ? { note: body.note } : {}), ...(body.completed !== undefined ? { completedAt: body.completed ? new Date() : null } : {}) },
      select: { contentId: true, completedAt: true, note: true, updatedAt: true },
    });
    return { data: state };
  });
}
