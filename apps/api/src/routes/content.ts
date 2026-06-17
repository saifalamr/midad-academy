import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createQuizSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  passingScore: z.number().int().min(0).max(100).optional(),
});

export async function contentRoutes(app: FastifyInstance) {
  // ── POST /api/content/:id/quiz ────────────────────────────────────────────
  // Creates a quiz for a content item. Only the owning teacher may do this.
  app.post<{ Params: { id: string } }>('/:id/quiz', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: courseContentId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can create quizzes' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const content = await prisma.courseContent.findUnique({
      where: { id: courseContentId },
      include: { course: true },
    });
    if (!content || content.course.teacherId !== teacherProfile.id) {
      return reply.status(404).send({ error: 'Content item not found' });
    }

    const body = createQuizSchema.parse(request.body);

    try {
      const quiz = await prisma.quiz.create({
        data: {
          courseContentId,
          title: body.title,
          ...(body.passingScore !== undefined ? { passingScore: body.passingScore } : {}),
        },
        include: { questions: true },
      });
      return reply.status(201).send({ data: quiz });
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return reply.status(409).send({ error: 'This content item already has a quiz' });
      }
      throw err;
    }
  });
}
