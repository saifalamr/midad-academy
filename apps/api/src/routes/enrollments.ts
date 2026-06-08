import type { FastifyInstance } from 'fastify';
import { RoomServiceClient } from 'livekit-server-sdk';
import { z } from 'zod';
import { prisma } from '@arabic-platform/database';
import { config } from '../config';

const createEnrollmentSchema = z.object({
  courseId: z.string().min(1, 'Course id is required'),
});

// LiveKit's RoomServiceClient needs an HTTP(S) URL, not WSS.
function toHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export async function enrollmentRoutes(app: FastifyInstance) {
  // ── POST /api/enrollments ─────────────────────────────────────────────────
  // Enrolls the authenticated student in a course.
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can enroll in courses' });
    }

    const { courseId } = createEnrollmentSchema.parse(request.body);

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return reply.status(404).send({ error: 'Course not found' });
    }

    try {
      const enrollment = await prisma.enrollment.create({
        data: { courseId, studentId: studentProfile.id },
      });
      return reply.status(201).send({ data: enrollment });
    } catch (err) {
      // Prisma's unique-constraint violation code — thrown by the
      // @@unique([courseId, studentId]) guard on the Enrollment model.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return reply.status(409).send({ error: 'You are already enrolled in this course' });
      }
      throw err;
    }
  });

  // ── GET /api/enrollments ──────────────────────────────────────────────────
  // Returns the authenticated student's enrolled courses, flagging which ones
  // currently have a live class (an active LiveKit room) to join.
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can access this endpoint' });
    }

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: studentProfile.id },
      include: {
        course: {
          include: { teacher: { include: { user: { select: { name: true } } } } },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    // A course's room name is its course id (see teacher "Start Class" flow) —
    // ask LiveKit which rooms are currently active so we know which courses
    // can show a "Join Class" button right now.
    let liveRoomNames = new Set<string>();
    if (enrollments.length > 0) {
      try {
        const roomService = new RoomServiceClient(
          toHttpUrl(config.LIVEKIT_URL),
          config.LIVEKIT_API_KEY,
          config.LIVEKIT_API_SECRET,
        );
        const rooms = await roomService.listRooms();
        liveRoomNames = new Set(rooms.map((r) => r.name));
      } catch {
        // LiveKit unreachable — fall back to showing no live sessions rather
        // than failing the whole dashboard.
      }
    }

    return reply.send({
      data: enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        course: {
          id: e.course.id,
          title: e.course.title,
          ageGroup: e.course.ageGroup,
          price: e.course.price,
          currency: e.course.currency,
          teacherName: e.course.teacher.user.name,
        },
        isLive: liveRoomNames.has(e.course.id),
      })),
    });
  });
}
