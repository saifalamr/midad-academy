import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const gradeAnswerSchema = z.object({
  pointsAwarded: z.number().int().min(0),
  feedback: z.string().optional(),
});

export async function teacherRoutes(app: FastifyInstance) {
  // ── GET /api/teacher/pending-reviews ──────────────────────────────────────
  // Lists all written answers awaiting grading across the teacher's courses.
  app.get('/pending-reviews', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can access this endpoint' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const pending = await prisma.studentAnswer.findMany({
      where: {
        status: 'PENDING',
        question: { quiz: { content: { course: { teacherId: teacherProfile.id } } } },
      },
      include: {
        question: { include: { quiz: { include: { content: { include: { course: true } } } } } },
        result: { include: { student: { include: { user: true } } } },
      },
      orderBy: { id: 'asc' },
    });

    return reply.send({
      data: pending.map((a) => ({
        id: a.id,
        resultId: a.resultId,
        studentName: a.result.student.user.name,
        courseTitle: a.question.quiz.content.course.title,
        quizTitle: a.question.quiz.title,
        questionText: a.question.text,
        answerText: a.answerText,
        points: a.question.points,
        completedAt: a.result.completedAt,
      })),
    });
  });

  // ── PATCH /api/teacher/answers/:id/grade ──────────────────────────────────
  // Grades a pending written answer and recomputes the parent quiz result.
  app.patch<{ Params: { id: string } }>('/answers/:id/grade', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: answerId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can grade answers' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const answer = await prisma.studentAnswer.findUnique({
      where: { id: answerId },
      include: {
        question: { include: { quiz: { include: { content: { include: { course: true } } } } } },
        result: { include: { studentAnswers: true } },
      },
    });
    if (!answer || answer.question.quiz.content.course.teacherId !== teacherProfile.id) {
      return reply.status(404).send({ error: 'Answer not found' });
    }

    const body = gradeAnswerSchema.parse(request.body);
    if (body.pointsAwarded > answer.question.points) {
      return reply.status(400).send({ error: `pointsAwarded cannot exceed question points (${answer.question.points})` });
    }

    await prisma.studentAnswer.update({
      where: { id: answerId },
      data: {
        status: 'GRADED',
        correct: body.pointsAwarded === answer.question.points,
        pointsAwarded: body.pointsAwarded,
        feedback: body.feedback,
      },
    });

    // Recompute the parent result once all answers for this attempt are graded.
    const allAnswers = await prisma.studentAnswer.findMany({
      where: { resultId: answer.resultId },
      include: { question: true },
    });

    const stillPending = allAnswers.some((a) => a.status === 'PENDING');
    const totalPoints = allAnswers.reduce((sum, a) => sum + a.question.points, 0);
    const earnedPoints = allAnswers.reduce((sum, a) => sum + (a.id === answerId ? body.pointsAwarded : (a.pointsAwarded ?? 0)), 0);
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const quiz = answer.question.quiz;

    const updatedResult = await prisma.studentQuizResult.update({
      where: { id: answer.resultId },
      data: {
        score,
        status: stillPending ? 'PENDING_REVIEW' : 'COMPLETE',
        passed: !stillPending && score >= quiz.passingScore,
      },
    });

    return reply.send({ data: updatedResult });
  });
}
