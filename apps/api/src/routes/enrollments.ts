import type { FastifyInstance } from 'fastify';
import { RoomServiceClient } from 'livekit-server-sdk';
import { prisma } from '../lib/prisma';
import { config } from '../config';

// LiveKit's RoomServiceClient needs an HTTP(S) URL, not WSS.
function toHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export async function enrollmentRoutes(app: FastifyInstance) {
  // ── POST /api/enrollments ─────────────────────────────────────────────────
  // Enrolls the authenticated student in a course.
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply
      .status(403)
      .send({
        error: 'تسجيل الطلاب في الدورات يتم بواسطة إدارة الأكاديمية بعد التواصل مع ولي الأمر.',
      });
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
      where: { studentId: studentProfile.id, status: 'ACTIVE' },
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
          config.LIVEKIT_API_SECRET
        );
        const rooms = await roomService.listRooms();
        liveRoomNames = new Set(rooms.map((r) => r.name));
      } catch {
        // LiveKit unreachable — fall back to showing no live sessions rather
        // than failing the whole dashboard.
      }
    }

    const liveSessions = await prisma.classSession.findMany({
      where: { courseId: { in: enrollments.map((e) => e.courseId) }, status: 'LIVE' },
      select: { courseId: true, liveKitRoomId: true },
    });
    const liveCourses = new Set(
      liveSessions
        .filter((s) => s.liveKitRoomId && liveRoomNames.has(s.liveKitRoomId))
        .map((s) => s.courseId)
    );
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
        isLive: liveCourses.has(e.course.id),
      })),
    });
  });
}
