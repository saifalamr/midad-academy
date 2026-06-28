import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

// Counts consecutive days ending today/yesterday that have at least one point
// event. Copied from parent.ts so the student's own dashboard computes streaks
// the same way the parent overview does.
function computeStreak(events: { createdAt: Date }[]): number {
  if (events.length === 0) return 0;

  const uniqueDays = [
    ...new Set(events.map((e) => e.createdAt.toISOString().split('T')[0])),
  ].sort().reverse();

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

  if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const diff = Math.round(
      (new Date(uniqueDays[i - 1]).getTime() - new Date(uniqueDays[i]).getTime()) / 86_400_000
    );
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

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

  // ── GET /api/students/me ──────────────────────────────────────────────────
  // Returns the authenticated student's own progress: XP, level, streak,
  // per-course lesson progress, quiz history and recent session attendance.
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can access this endpoint' });
    }

    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        // Last 90 point events for streak calculation
        pointEvents: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 90,
        },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                lessons: {
                  select: { id: true, title: true, scheduledAt: true, status: true },
                  orderBy: { scheduledAt: 'desc' },
                },
              },
            },
          },
        },
        quizResults: {
          include: { quiz: { select: { title: true } } },
          orderBy: { completedAt: 'desc' },
        },
      },
    });

    if (!profile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const now = new Date();
    const streak = computeStreak(profile.pointEvents);

    const allLessons = profile.enrollments.flatMap((e) =>
      e.course.lessons.map((l) => ({ ...l, courseTitle: e.course.title }))
    );

    const totalLessons = allLessons.length;
    const lessonsCompleted = allLessons.filter((l) => l.status === 'COMPLETED').length;

    const courseProgress = profile.enrollments.map((e) => ({
      courseId: e.course.id,
      title: e.course.title,
      total: e.course.lessons.length,
      completed: e.course.lessons.filter((l) => l.status === 'COMPLETED').length,
    }));

    const quizResults = profile.quizResults.map((r) => ({
      quizTitle: r.quiz.title,
      score: r.score,
      passed: r.passed,
      createdAt: r.completedAt,
    }));

    // Last 8 past lessons across all enrolled courses (most recent first)
    const recentSessions = allLessons
      .filter((l) => new Date(l.scheduledAt) < now)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
      .slice(0, 8)
      .map((l) => ({
        title: l.title,
        scheduledAt: l.scheduledAt,
        attended: l.status === 'COMPLETED',
      }));

    return reply.send({
      data: {
        totalPoints: profile.totalPoints,
        level: profile.level,
        streak,
        lessonsCompleted,
        totalLessons,
        courseProgress,
        quizResults,
        recentSessions,
      },
    });
  });
}
