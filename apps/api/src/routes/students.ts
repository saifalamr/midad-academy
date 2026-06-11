import type { FastifyInstance } from 'fastify';
import { prisma } from '@arabic-platform/database';

export async function studentRoutes(app: FastifyInstance) {
  // ── GET /api/students/results ─────────────────────────────────────────────
  // Returns all quiz results for the authenticated student.
  app.get('/results', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can access this endpoint' });
    }

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const results = await prisma.studentQuizResult.findMany({
      where: { studentId: studentProfile.id },
      include: {
        quiz: { include: { content: { include: { course: true } } } },
        studentAnswers: { include: { question: true } },
      },
      orderBy: { completedAt: 'desc' },
    });

    return reply.send({
      data: results.map((r) => ({
        id: r.id,
        quizId: r.quizId,
        quizTitle: r.quiz.title,
        courseTitle: r.quiz.content.course.title,
        score: r.score,
        passed: r.passed,
        passingScore: r.quiz.passingScore,
        status: r.status,
        completedAt: r.completedAt,
        answers: r.studentAnswers.map((a) => ({
          questionId: a.questionId,
          text: a.question.text,
          questionType: a.question.questionType,
          answerText: a.answerText,
          status: a.status,
          correct: a.correct,
          points: a.question.points,
          pointsAwarded: a.pointsAwarded,
          feedback: a.feedback,
        })),
      })),
    });
  });
}
