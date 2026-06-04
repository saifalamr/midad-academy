import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@arabic-platform/database';

const createCourseSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  ageGroup: z.string().min(1, 'Age group is required'),
  price: z.number().min(0, 'Price must be 0 or more'),
});

export async function courseRoutes(app: FastifyInstance) {
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
}
