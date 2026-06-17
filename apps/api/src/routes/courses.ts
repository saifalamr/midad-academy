import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const createCourseSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  ageGroup: z.string().min(1, 'Age group is required'),
  price: z.number().min(0, 'Price must be 0 or more'),
});

const createContentSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().min(1, 'Description is required'),
  type: z.enum(['VIDEO', 'PDF', 'EXERCISE']),
  contentUrl: z.string().min(1, 'Content URL is required'),
  duration: z.number().int().min(0, 'Duration must be 0 or more'),
});

export async function courseRoutes(app: FastifyInstance) {
  // ── GET /api/courses/browse ───────────────────────────────────────────────
  // Lists every course on the platform with its teacher's name — used by the
  // student-facing "Browse Courses" page. Any authenticated user can call it.
  app.get('/browse', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const courses = await prisma.course.findMany({
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        _count: { select: { enrollments: true } },
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
        currency: c.currency,
        teacherName: c.teacher.user.name,
        studentCount: c._count.enrollments,
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
        _count: { select: { enrollments: true } },
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
    const { id: userId, role } = request.user;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can create courses' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const body = createCourseSchema.parse(request.body);

    const course = await prisma.course.create({
      data: {
        title: body.title,
        description: body.description,
        ageGroup: body.ageGroup,
        price: body.price,
        teacherId: teacherProfile.id,
        level: 'beginner',
      },
      include: {
        _count: { select: { enrollments: true } },
        lessons: true,
      },
    });

    return reply.status(201).send({ data: course });
  });

  // ── GET /api/courses/:id/lessons ──────────────────────────────────────────
  // Returns all content items for a course, ordered for display.
  app.get<{ Params: { id: string } }>('/:id/lessons', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: courseId } = request.params;

    const content = await prisma.courseContent.findMany({
      where: { courseId },
      include: { quiz: { select: { id: true, title: true, passingScore: true } } },
      orderBy: { order: 'asc' },
    });

    return reply.send({ data: content });
  });

  // ── POST /api/courses/:id/lessons ─────────────────────────────────────────
  // Adds a new content item to the course. Only the owning teacher may do this.
  app.post<{ Params: { id: string } }>('/:id/lessons', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: courseId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can manage course content' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.teacherId !== teacherProfile.id) {
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
  });
}
