import type { FastifyInstance } from 'fastify';
import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { canAccessCourse } from '../lib/access';
import { setDrawingPermission } from '../ws-server';

const createSessionSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
});

const joinSessionSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
});

const scheduleSessionSchema = z.object({
  courseId: z.string().min(1, 'Course id is required'),
  title: z.string().min(2, 'Title must be at least 2 characters'),
  description: z.string().optional(),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
});

// LiveKit's RoomServiceClient needs an HTTP(S) URL, not WSS.
function toHttpUrl(wsUrl: string) {
  return wsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export async function sessionRoutes(app: FastifyInstance) {
  // ── POST /api/sessions/create ─────────────────────────────────────────────
  // Creates (or reuses) a LiveKit room and returns a signed participant token.
  // The caller's identity, display name, and role come from the verified JWT —
  // the frontend never needs to send those.
  app.post('/create', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { roomName } = createSessionSchema.parse(request.body);
    if (role !== 'TEACHER' || !await canAccessCourse(request.user, roomName)) return reply.status(403).send({ error: 'Only the course teacher can start this classroom' });
    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) return reply.status(503).send({ error: 'Live classroom service is not configured' });
    const live = await prisma.classSession.findFirst({ where: { courseId: roomName, status: 'LIVE' } });
    if (!live) return reply.status(409).send({ error: 'Start a scheduled session from your dashboard first' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    // Ensure the room exists on LiveKit Cloud (idempotent — safe to call again
    // if the room is already live).
    const roomService = new RoomServiceClient(
      toHttpUrl(config.LIVEKIT_URL),
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    );
    const existing = await roomService.listRooms([live.liveKitRoomId ?? `class-${live.id}`]);
    if (!existing.length) return reply.status(409).send({ error: 'This class has ended; start a new scheduled session' });

    // Mint a participant token. Role metadata is read by the classroom UI to
    // decide which video feed goes in the large "teacher" slot.
    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: userId, ttl: '15m',
      name: user.name,
      metadata: JSON.stringify({ role: role.toLowerCase() }),
    });
    at.addGrant({
      roomJoin: true,
      room: live.liveKitRoomId ?? `class-${live.id}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    return reply.send({ data: { token, roomName, livekitUrl: config.LIVEKIT_URL } });
  });

  // ── POST /api/sessions/join ───────────────────────────────────────────────
  // Lets an enrolled student join a class that's already live. Unlike
  // /create, this never creates the room — a missing room means the teacher
  // hasn't started the session yet, so we tell the student to wait.
  app.post('/join', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can use this endpoint' });
    }

    const { roomName } = joinSessionSchema.parse(request.body);

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    // Course rooms are named after the course id (see /create + the teacher
    // dashboard's "Start Class" button) — confirm the student is enrolled.
    const enrollment = await prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId: roomName, studentId: studentProfile.id } },
    });
    if (!enrollment || enrollment.status !== 'ACTIVE') {
      return reply.status(403).send({ error: 'You are not enrolled in this course' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) return reply.status(503).send({ error: 'Live classroom service is not configured' });
    const roomService = new RoomServiceClient(
      toHttpUrl(config.LIVEKIT_URL),
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    );
    const live = await prisma.classSession.findFirst({ where: { courseId: roomName, status: 'LIVE' } });
    if (!live?.liveKitRoomId) return reply.status(409).send({ error: 'This class is not live' });
    const rooms = await roomService.listRooms([live.liveKitRoomId]);
    if (rooms.length === 0) {
      return reply.status(409).send({ error: 'This class is not live yet — please wait for your teacher to start it' });
    }

    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: userId, ttl: '15m',
      name: user.name,
      metadata: JSON.stringify({ role: role.toLowerCase() }),
    });
    at.addGrant({
      roomJoin: true,
      room: live.liveKitRoomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    return reply.send({ data: { token, roomName, livekitUrl: config.LIVEKIT_URL } });
  });

  // ── POST /api/sessions/schedule ───────────────────────────────────────────
  // A teacher schedules a class session for one of their courses.
  app.post('/schedule', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can schedule classes' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const body = scheduleSessionSchema.parse(request.body);

    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course || course.teacherId !== teacherProfile.id) {
      return reply.status(404).send({ error: 'Course not found' });
    }

    const session = await prisma.classSession.create({
      data: {
        courseId: body.courseId,
        teacherId: teacherProfile.id,
        title: body.title,
        description: body.description,
        scheduledAt: body.scheduledAt,
        durationMinutes: body.durationMinutes ?? 60,
      },
    });

    return reply.status(201).send({ data: session });
  });

  // ── GET /api/sessions/upcoming ────────────────────────────────────────────
  // Teachers see their own upcoming sessions; students see upcoming sessions
  // for courses they're enrolled in.
  app.get('/upcoming', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role === 'TEACHER') {
      const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
      if (!teacherProfile) {
        return reply.status(404).send({ error: 'Teacher profile not found' });
      }

      const sessions = await prisma.classSession.findMany({
        where: {
          teacherId: teacherProfile.id,
          OR: [{ status: 'LIVE' }, { status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }],
        },
        include: { course: { select: { id: true, title: true } } },
        orderBy: { scheduledAt: 'asc' },
      });

      return reply.send({ data: sessions });
    }

    if (role === 'STUDENT') {
      const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
      if (!studentProfile) {
        return reply.status(404).send({ error: 'Student profile not found' });
      }

      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: studentProfile.id, status: 'ACTIVE' },
        select: { courseId: true },
      });
      const courseIds = enrollments.map((e) => e.courseId);

      const sessions = await prisma.classSession.findMany({
        where: {
          courseId: { in: courseIds },
          OR: [{ status: 'LIVE' }, { status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } }],
        },
        include: {
          course: { select: { id: true, title: true } },
          teacher: { include: { user: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: 'asc' },
      });

      return reply.send({
        data: sessions.map((s) => ({
          ...s,
          teacherName: s.teacher.user.name,
          teacher: undefined,
        })),
      });
    }

    return reply.status(403).send({ error: 'Not authorized to view sessions' });
  });

  // ── PATCH /api/sessions/:id/cancel ────────────────────────────────────────
  // The owning teacher cancels a scheduled class session.
  app.patch<{ Params: { id: string } }>('/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: sessionId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can cancel sessions' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
    if (!session || session.teacherId !== teacherProfile.id) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    if (session.status !== 'SCHEDULED') return reply.status(409).send({ error: 'Only scheduled sessions can be cancelled' });
    const updated = await prisma.classSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED' },
    });

    return reply.send({ data: updated });
  });

  // ── PATCH /api/sessions/:id/start ─────────────────────────────────────────
  // The owning teacher starts a scheduled class session — marks it LIVE and
  // records the LiveKit room (named after the course id, per the classroom
  // join convention).
  app.patch<{ Params: { id: string } }>('/:id/start', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;
    const { id: sessionId } = request.params;

    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can start sessions' });
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId } });
    if (!teacherProfile) {
      return reply.status(404).send({ error: 'Teacher profile not found' });
    }

    const session = await prisma.classSession.findUnique({ where: { id: sessionId } });
    if (!session || session.teacherId !== teacherProfile.id) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    if (session.status !== 'SCHEDULED' && session.status !== 'LIVE') return reply.status(409).send({ error: 'This session cannot be started' });
    const otherLive = await prisma.classSession.findFirst({ where: { courseId: session.courseId, status: 'LIVE', id: { not: sessionId } } });
    if (otherLive) return reply.status(409).send({ error: 'End the current live session first' });
    if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) return reply.status(503).send({ error: 'Live classroom service is not configured' });
    const liveKitRoomId = `class-${session.id}`;
    const service = new RoomServiceClient(toHttpUrl(config.LIVEKIT_URL), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
    await service.createRoom({ name: liveKitRoomId, emptyTimeout: 600, maxParticipants: 30 });
    // Serialize starts for this course so two scheduled sessions cannot become live together.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Course" WHERE id = ${session.courseId} FOR UPDATE`;
      const current = await tx.classSession.findUniqueOrThrow({ where: { id: sessionId } });
      if (!['SCHEDULED', 'LIVE'].includes(current.status) || await tx.classSession.findFirst({ where: { courseId: session.courseId, status: 'LIVE', id: { not: sessionId } } })) return null;
      return tx.classSession.update({ where: { id: sessionId }, data: { status: 'LIVE', liveKitRoomId } });
    });
    if (!updated) { await service.deleteRoom(liveKitRoomId); return reply.status(409).send({ error: 'This course already has a live class or the session was cancelled' }); }

    return reply.send({ data: updated });
  });
  app.post('/end', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { roomName } = createSessionSchema.parse(request.body);
    if (request.user.role !== 'TEACHER' || !await canAccessCourse(request.user, roomName)) return reply.status(403).send({ error: 'Only the course teacher can end this class' });
    const sessions = await prisma.classSession.findMany({ where: { courseId: roomName, status: 'LIVE' } });
    if (config.LIVEKIT_URL) {
      const service = new RoomServiceClient(toHttpUrl(config.LIVEKIT_URL), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
      for (const session of sessions) {
        if (!session.liveKitRoomId) continue;
        const rooms = await service.listRooms([session.liveKitRoomId]);
        if (rooms.length) await service.deleteRoom(session.liveKitRoomId);
      }
    }
    await prisma.classSession.updateMany({ where: { id: { in: sessions.map(s => s.id) }, status: 'LIVE' }, data: { status: 'COMPLETED' } });
    const grants = await prisma.drawingPermission.findMany({ where: { courseId: roomName } });
    await prisma.drawingPermission.deleteMany({ where: { courseId: roomName } });
    grants.forEach(g => setDrawingPermission(roomName, g.userId, false));
    return { message: 'Class ended' };
  });
  app.post('/drawing-permission', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { roomName, studentId, canDraw } = z.object({ roomName: z.string(), studentId: z.string(), canDraw: z.boolean() }).parse(request.body);
    if (request.user.role !== 'TEACHER' || !await canAccessCourse(request.user, roomName)) return reply.status(403).send({ error: 'Only the course teacher can manage drawing access' });
    if (!await canAccessCourse({ id: studentId, role: 'STUDENT' }, roomName)) return reply.status(404).send({ error: 'Student not enrolled' });
    if (canDraw) await prisma.drawingPermission.upsert({ where: { courseId_userId: { courseId: roomName, userId: studentId } }, create: { courseId: roomName, userId: studentId }, update: {} });
    else await prisma.drawingPermission.deleteMany({ where: { courseId: roomName, userId: studentId } });
    setDrawingPermission(roomName, studentId, canDraw);
    return { message: 'Drawing permission updated' };
  });
  app.get<{ Params: { courseId: string } }>('/state/:courseId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { courseId } = request.params;
    if (!await canAccessCourse(request.user, courseId)) return reply.status(403).send({ error: 'Course access required' });
    const state = await prisma.classroomState.findUnique({ where: { courseId } });
    const grants = await prisma.drawingPermission.findMany({ where: { courseId }, select: { userId: true } });
    return { data: { sharedDoc: state?.sharedDoc ?? null, pdfPage: state?.pdfPage ?? 1, revision: state?.revision ?? 0,
      canDraw: request.user.role === 'TEACHER' || grants.some(g => g.userId === request.user.id),
      permittedStudents: request.user.role === 'TEACHER' ? grants.map(g => g.userId) : [] } };
  });
  app.patch<{ Params: { courseId: string } }>('/state/:courseId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { courseId } = request.params;
    if (request.user.role !== 'TEACHER' || !await canAccessCourse(request.user, courseId)) return reply.status(403).send({ error: 'Only the course teacher can change shared material' });
    const doc = z.object({ url: z.string().max(2000), name: z.string().min(1).max(200), docType: z.enum(['pdf','image','youtube','video','html']), htmlContent: z.string().max(32000).optional() }).superRefine((v, ctx) => {
      if (v.docType !== 'html') { try { if (!['http:', 'https:'].includes(new URL(v.url).protocol)) throw new Error(); } catch { ctx.addIssue({ code: 'custom', path: ['url'], message: 'Use an HTTP or HTTPS URL' }); } }
      if (v.docType === 'html' && !v.htmlContent?.trim()) ctx.addIssue({ code: 'custom', path: ['htmlContent'], message: 'Lesson HTML is required' });
    });
    const body = z.object({ sharedDoc: doc.nullable().optional(), pdfPage: z.number().int().min(1).max(5000).optional() }).parse(request.body);
    const data = { ...(body.sharedDoc !== undefined ? { sharedDoc: body.sharedDoc === null ? Prisma.DbNull : body.sharedDoc } : {}), ...(body.pdfPage !== undefined ? { pdfPage: body.pdfPage } : {}), revision: { increment: 1 } };
    const state = await prisma.classroomState.upsert({ where: { courseId }, create: { courseId, sharedDoc: body.sharedDoc ?? Prisma.DbNull, pdfPage: body.pdfPage ?? 1 }, update: data });
    const live = await prisma.classSession.findFirst({ where: { courseId, status: 'LIVE' } });
    if (live?.liveKitRoomId && config.LIVEKIT_URL) {
      try { await new RoomServiceClient(toHttpUrl(config.LIVEKIT_URL), config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).updateRoomMetadata(live.liveKitRoomId, JSON.stringify({ revision: state.revision })); }
      catch (error) { request.log.warn({ error }, 'Classroom state saved; room notification unavailable'); }
    }
    return { data: state };
  });
  await app.register(async (webhooks) => {
    webhooks.addContentTypeParser('application/webhook+json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    webhooks.post('/webhook', { config: { rateLimit: false } }, async (request, reply) => {
      if (!config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET) return reply.status(503).send({ error: 'LiveKit webhook is not configured' });
      let event;
      try { event = await new WebhookReceiver(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).receive(request.body as string, request.headers.authorization); }
      catch { return reply.status(401).send({ error: 'Invalid webhook signature' }); }
      const roomName = event.room?.name;
      if (!roomName) return { received: true };
      if (event.event === 'participant_joined' && event.participant?.identity) {
        const student = await prisma.studentProfile.findUnique({ where: { userId: event.participant.identity } });
        const session = await prisma.classSession.findFirst({ where: { liveKitRoomId: roomName, status: 'LIVE' } });
        if (student && session && await canAccessCourse({ id: student.userId, role: 'STUDENT' }, session.courseId)) {
          await prisma.$transaction(async (tx) => {
            await tx.sessionAttendance.upsert({ where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
              create: { sessionId: session.id, studentId: student.id }, update: {} });
            const award = await tx.pointTransaction.createMany({ data: { studentId: student.id, points: 10, event: 'Class attendance', eventKey: `attendance:${session.id}:${student.id}` }, skipDuplicates: true });
            if (award.count) await tx.studentProfile.update({ where: { id: student.id }, data: { totalPoints: { increment: 10 } } });
          });
        }
      }
      if (event.event === 'room_finished') await prisma.classSession.updateMany({ where: { courseId: roomName, status: 'LIVE' }, data: { status: 'COMPLETED' } });
      return { received: true };
    });
  });

}
