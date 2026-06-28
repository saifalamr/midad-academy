import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const childEmailSchema = z.object({
  childEmail: z.string().email('Invalid email address'),
});

// Counts consecutive days ending today/yesterday that have at least one point event.
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
                    title: true,
                    lessons: {
                      select: { id: true, title: true, scheduledAt: true, status: true },
                      orderBy: { scheduledAt: 'desc' },
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

    const now = new Date();

    const children = parentProfile.children.map((child) => {
      const streak = computeStreak(child.pointEvents);

      const allLessons = child.enrollments.flatMap((e) =>
        e.course.lessons.map((l) => ({ ...l, courseTitle: e.course.title }))
      );

      const totalLessons = allLessons.length;
      const lessonsCompleted = allLessons.filter((l) => l.status === 'COMPLETED').length;

      // Per-course progress for the progress bars
      const courseProgress = child.enrollments.map((e) => ({
        courseTitle: e.course.title,
        total: e.course.lessons.length,
        completed: e.course.lessons.filter((l) => l.status === 'COMPLETED').length,
      }));

      // Last 8 past lessons across all enrolled courses
      const recentSessions = allLessons
        .filter((l) => new Date(l.scheduledAt) < now)
        .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
        .slice(0, 8)
        .map((l) => ({
          id: l.id,
          courseTitle: l.courseTitle,
          lessonTitle: l.title,
          scheduledAt: l.scheduledAt,
          attended: l.status === 'COMPLETED',
        }));

      return {
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
      };
    });

    return reply.send({ data: { children } });
  });

  // ── POST /api/parent/link-child ───────────────────────────────────────────
  // Links a registered student (by email) to the authenticated parent.
  app.post('/link-child', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'PARENT') {
      return reply.status(403).send({ error: 'Only parents can link children' });
    }

    const { childEmail } = childEmailSchema.parse(request.body);

    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId } });
    if (!parentProfile) {
      return reply.status(404).send({ error: 'Parent profile not found' });
    }

    const childUser = await prisma.user.findUnique({
      where: { email: childEmail },
      include: { studentProfile: true },
    });

    if (!childUser || childUser.role !== 'STUDENT' || !childUser.studentProfile) {
      return reply.status(404).send({ error: 'No student found with that email' });
    }

    if (childUser.studentProfile.parentId) {
      return reply.status(400).send({ error: 'This student is already linked to a parent' });
    }

    await prisma.studentProfile.update({
      where: { id: childUser.studentProfile.id },
      data: { parentId: parentProfile.id },
    });

    return reply.send({
      message: 'Child linked successfully',
      child: { name: childUser.name, email: childUser.email },
    });
  });

  // ── DELETE /api/parent/unlink-child ───────────────────────────────────────
  // Unlinks a child — only if they are currently linked to this parent.
  app.delete('/unlink-child', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'PARENT') {
      return reply.status(403).send({ error: 'Only parents can unlink children' });
    }

    const { childEmail } = childEmailSchema.parse(request.body);

    const parentProfile = await prisma.parentProfile.findUnique({ where: { userId } });
    if (!parentProfile) {
      return reply.status(404).send({ error: 'Parent profile not found' });
    }

    const childUser = await prisma.user.findUnique({
      where: { email: childEmail },
      include: { studentProfile: true },
    });

    // Only allow unlinking a child that belongs to THIS parent.
    if (
      !childUser ||
      !childUser.studentProfile ||
      childUser.studentProfile.parentId !== parentProfile.id
    ) {
      return reply.status(404).send({ error: 'No linked child found with that email' });
    }

    await prisma.studentProfile.update({
      where: { id: childUser.studentProfile.id },
      data: { parentId: null },
    });

    return reply.send({ message: 'Child unlinked' });
  });
}
