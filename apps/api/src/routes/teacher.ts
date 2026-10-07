import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { awardQuiz } from '../lib/rewards';

const gradeAnswerSchema = z.object({
  pointsAwarded: z.number().int().min(0),
  feedback: z.string().optional(),
});

export async function teacherRoutes(app: FastifyInstance) {
  app.get('/students', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'TEACHER') return reply.status(403).send({ error: 'Only teachers can view enrolled students' });
    const enrollments = await prisma.enrollment.findMany({ where: { course: { teacher: { userId: request.user.id } }, status: 'ACTIVE' },
      select: { id: true, courseId: true, enrolledAt: true, course: { select: { title: true, _count: { select: { content: true } } } }, student: { select: {
        user: { select: { name: true, email: true } }, level: true, totalPoints: true,
        learningStates: { where: { completedAt: { not: null }, content: { course: { teacher: { userId: request.user.id } } } }, select: { content: { select: { courseId: true } }, updatedAt: true } },
      } } }, orderBy: { enrolledAt: 'desc' } });
    return { data: enrollments.map(e => {
      const completed = e.student.learningStates.filter(state => state.content.courseId === e.courseId);
      return { id: e.id, courseId: e.courseId, name: e.student.user.name, email: e.student.user.email, courseTitle: e.course.title,
        level: e.student.level, totalPoints: e.student.totalPoints, enrolledAt: e.enrolledAt,
        materialsTotal: e.course._count.content, materialsCompleted: completed.length };
    }) };

  });
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

    if (answer.question.questionType !== 'WRITTEN') return reply.status(400).send({ error: 'Only written answers can be manually graded' });
    const body = gradeAnswerSchema.parse(request.body);
    if (body.pointsAwarded > answer.question.points) {
      return reply.status(400).send({ error: `pointsAwarded cannot exceed question points (${answer.question.points})` });
    }

    const updatedResult = await prisma.$transaction(async (tx) => {
      // Serialize grading for an attempt so concurrent answers cannot leave stale totals.
      await tx.$queryRaw`SELECT id FROM "StudentQuizResult" WHERE id = ${answer.resultId} FOR UPDATE`;
    await tx.studentAnswer.update({
      where: { id: answerId },
      data: {
        status: 'GRADED',
        correct: body.pointsAwarded === answer.question.points,
        pointsAwarded: body.pointsAwarded,
        feedback: body.feedback,
      },
    });

    // Recompute the parent result once all answers for this attempt are graded.
    const allAnswers = await tx.studentAnswer.findMany({
      where: { resultId: answer.resultId },
      include: { question: true },
    });

    const stillPending = allAnswers.some((a) => a.status === 'PENDING');
    const totalPoints = allAnswers.reduce((sum, a) => sum + a.question.points, 0);
    const earnedPoints = allAnswers.reduce((sum, a) => sum + (a.id === answerId ? body.pointsAwarded : (a.pointsAwarded ?? 0)), 0);
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const quiz = answer.question.quiz;

    return await tx.studentQuizResult.update({
      where: { id: answer.resultId },
      data: {
        score,
        status: stillPending ? 'PENDING_REVIEW' : 'COMPLETE',
        passed: !stillPending && score >= quiz.passingScore,
      },
    });

    });

    await awardQuiz(updatedResult.id);

    return reply.send({ data: updatedResult });
  });
}
