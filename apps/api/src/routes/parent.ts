import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { studentProgress } from '../lib/progress';

// Counts consecutive days ending today/yesterday that have at least one point event.
function computeStreak(events: { createdAt: Date }[]): number {
  if (events.length === 0) return 0;

  const uniqueDays = [...new Set(events.map((e) => e.createdAt.toISOString().split('T')[0]))]
    .sort()
    .reverse();

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

export async function parentRoutes(app: FastifyInstance) {
  // ── GET /api/parent/overview ──────────────────────────────────────────────
  // Returns each child's profile, XP, streak, per-course progress, and recent
  // session attendance for the authenticated parent.
  app.get('/overview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'PARENT') {
      return reply.status(403).send({ error: 'Only parents can access this endpoint' });
    }

    const parentProfile = await prisma.parentProfile.findUnique({
      where: { userId },
      include: {
        children: {
          include: {
            user: { select: { name: true, email: true } },
            quizResults: {
              include: { quiz: { select: { id: true, title: true } } },
              orderBy: { completedAt: 'desc' },
              take: 20,
            },
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
                    month: true,
                    timeZone: true,
                    teacher: { select: { user: { select: { name: true } } } },
                    classSessions: {
                      where: {
                        OR: [
                          { status: 'LIVE' },
                          { status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
                        ],
                      },
                      select: {
                        id: true,
                        title: true,
                        scheduledAt: true,
                        durationMinutes: true,
                        status: true,
                      },
                      orderBy: { scheduledAt: 'asc' },
                      take: 3,
                    },
                    content: {
                      where: { quiz: { isNot: null } },
                      orderBy: [{ order: 'asc' }, { id: 'asc' }],
                      select: {
                        id: true,
                        title: true,
                        quiz: { select: { id: true, title: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!parentProfile) {
      return reply.status(404).send({ error: 'Parent profile not found' });
    }

    const children = await Promise.all(
      parentProfile.children.map(async (child) => {
        const streak = computeStreak(child.pointEvents);

        const { totalLessons, lessonsCompleted, courseProgress, recentSessions, materialProgress } =
          await studentProgress(child.id);

        const attempts = await prisma.studentQuizResult.findMany({
          where: {
            studentId: child.id,
            quiz: { content: { courseId: { in: child.enrollments.map((e) => e.courseId) } } },
          },
          select: { quizId: true, score: true, status: true, completedAt: true },
          orderBy: { completedAt: 'desc' },
        });
        const latest = new Map<string, (typeof attempts)[number]>();
        for (const attempt of attempts)
          if (!latest.has(attempt.quizId)) latest.set(attempt.quizId, attempt);
        const reports = await prisma.sessionReport.findMany({
          where: { studentId: child.id, publishedAt: { not: null } },
          select: { id: true, performance: true, participationCount: true, homework: true, note: true, publishedAt: true,
            session: { select: { title: true, scheduledAt: true, course: { select: { title: true, timeZone: true } }, teacher: { select: { user: { select: { name: true } } } }, attendance: { where: { studentId: child.id }, select: { id: true } } } } },
          orderBy: { publishedAt: 'desc' }, take: 20,
        });
        return {
          reports: reports.map(({ session, ...report }) => ({ ...report, sessionTitle: session.title, scheduledAt: session.scheduledAt, courseTitle: session.course.title, timeZone: session.course.timeZone, teacherName: session.teacher.user.name, attended: !!session.attendance.length })),
          courses: child.enrollments.map(({ course }) => ({
            id: course.id,
            title: course.title,
            month: course.month,
            timeZone: course.timeZone,
            teacherName: course.teacher.user.name,
            upcomingSessions: course.classSessions,
            exercises: course.content.map((item) => {
              const attempt = item.quiz ? latest.get(item.quiz.id) : undefined;
              return {
                id: item.id,
                title: item.quiz?.title ?? item.title,
                status: attempt?.status ?? 'NOT_SUBMITTED',
                score: attempt?.status === 'COMPLETE' ? attempt.score : null,
                submittedAt: attempt?.completedAt ?? null,
              };
            }),
          })),
          id: child.id,
          name: child.user.name,
          email: child.user.email,
          level: child.level,
          totalPoints: child.totalPoints,
          streak,
          lessonsCompleted,
          totalLessons,
          courseProgress,
          recentSessions,
          materialProgress,
          quizResults: child.quizResults.map((r) => ({
            id: r.id,
            quizTitle: r.quizTitleSnapshot ?? r.quiz.title,
            score: r.score,
            passed: r.passed,
            status: r.status,
            completedAt: r.completedAt,
          })),
        };
      })
    );

    return reply.send({ data: { children } });
  });

  app.post('/link-child', { preHandler: [app.authenticate] }, async (_request, reply) =>
    reply.status(403).send({ error: 'ربط الأبناء يتم بواسطة إدارة الأكاديمية' })
  );
  app.delete('/unlink-child', { preHandler: [app.authenticate] }, async (_request, reply) =>
    reply.status(403).send({ error: 'تعديل ربط الأبناء يتم بواسطة إدارة الأكاديمية' })
  );
}
