import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { canAccessCourse } from '../lib/access';

const createContentSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().min(1, 'Description is required'),
  type: z.enum(['VIDEO', 'PDF', 'EXERCISE']),
  contentUrl: z
    .string()
    .url()
    .refine((url) => /^https?:\/\//.test(url), 'Use an HTTP or HTTPS URL'),
  duration: z.number().int().min(0, 'Duration must be 0 or more'),
});

export async function courseRoutes(app: FastifyInstance) {
  app.get('/catalog', async () => {
    const courses = await prisma.course.findMany({
      where: { month: { gte: new Date().toISOString().slice(0, 7) } },
      select: {
        id: true,
        title: true,
        description: true,
        month: true,
        timeZone: true,
        ageGroup: true,
        price: true,
        currency: true,
        maxStudents: true,
        teacher: { select: { user: { select: { name: true } } } },
        classSessions: {
          where: { status: 'SCHEDULED' },
          select: { scheduledAt: true, durationMinutes: true },
          orderBy: { scheduledAt: 'asc' },
          take: 3,
        },
        _count: {
          select: { enrollments: { where: { status: 'ACTIVE' } }, seatReservations: true },
        },
      },
      orderBy: { month: 'asc' },
      take: 100,
    });
    return {
      data: courses.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        month: c.month,
        timeZone: c.timeZone,
        ageGroup: c.ageGroup,
        price: c.price,
        currency: c.currency,
        teacherName: c.teacher.user.name,
        availableSeats: Math.max(
          0,
          c.maxStudents - c._count.enrollments - c._count.seatReservations
        ),
        sessions: c.classSessions,
      })),
    };
  });

  // ── GET /api/courses/browse ───────────────────────────────────────────────
  // Lists every course on the platform with its teacher's name — used by the
  // student-facing "Browse Courses" page. Any authenticated user can call it.
  app.get('/browse', { preHandler: [app.authenticate] }, async (request, reply) => {
    const courses = await prisma.course.findMany({
      where:
        request.user.role === 'STUDENT'
          ? { enrollments: { some: { status: 'ACTIVE', student: { userId: request.user.id } } } }
          : request.user.role === 'TEACHER'
            ? { teacher: { userId: request.user.id } }
            : {},
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        _count: {
          select: { enrollments: { where: { status: 'ACTIVE' } }, seatReservations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      data: courses.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        ageGroup: c.ageGroup,
        price: c.price,
        month: c.month,
        billingPeriod: c.billingPeriod,
        currency: c.currency,
        teacherName: c.teacher.user.name,
        studentCount: c._count.enrollments,
        maxStudents: c.maxStudents,
        availableSeats: Math.max(
          0,
          c.maxStudents - c._count.enrollments - c._count.seatReservations
        ),
      })),
    });
  });

  // ── GET /api/courses ──────────────────────────────────────────────────────
  // Returns the authenticated teacher's courses with enrollment counts and
  // the next 3 upcoming scheduled lessons per course.
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can access this endpoint' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const courses = await prisma.course.findMany({
      where: { teacherId: teacherProfile.id },
      include: {
        _count: {
          select: { enrollments: { where: { status: 'ACTIVE' } }, seatReservations: true },
        },
        lessons: {
          where: { scheduledAt: { gt: new Date() }, status: 'SCHEDULED' },
          orderBy: { scheduledAt: 'asc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: courses });
  });

  // ── POST /api/courses ─────────────────────────────────────────────────────
  // Creates a new course owned by the authenticated teacher.
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply
      .status(403)
      .send({ error: 'الدورات تنشئها إدارة الأكاديمية وتعيّن المعلم المسؤول عنها.' });
  });

  // ── GET /api/courses/:id/lessons ──────────────────────────────────────────
  // Returns all content items for a course, ordered for display.
  app.get<{ Params: { id: string } }>(
    '/:id/lessons',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id: courseId } = request.params;

      if (!(await canAccessCourse(request.user, courseId)))
        return reply.status(403).send({ error: 'Enroll in this course to access its lessons' });

      const content = await prisma.courseContent.findMany({
        where: { courseId },
        include: { quiz: { select: { id: true, title: true, passingScore: true } } },
        orderBy: { order: 'asc' },
      });

      return reply.send({ data: content });
    }
  );

  // ── POST /api/courses/:id/lessons ─────────────────────────────────────────
  // Adds a new content item to the course. Only the owning teacher may do this.
  app.post<{ Params: { id: string } }>(
    '/:id/lessons',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id: courseId } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can manage course content' });
      }

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return reply.status(404).send({ error: 'Course not found' });
      }

      const body = createContentSchema.parse(request.body);

      const lastItem = await prisma.courseContent.findFirst({
        where: { courseId },
        orderBy: { order: 'desc' },
      });

      const content = await prisma.courseContent.create({
        data: {
          courseId,
          title: body.title,
          description: body.description,
          type: body.type,
          contentUrl: body.contentUrl,
          duration: body.duration,
          order: (lastItem?.order ?? -1) + 1,
        },
      });

      return reply.status(201).send({ data: content });
    }
  );
}
