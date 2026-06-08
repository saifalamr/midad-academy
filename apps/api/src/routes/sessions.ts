import type { FastifyInstance } from 'fastify';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { z } from 'zod';
import { prisma } from '@arabic-platform/database';
import { config } from '../config';

const createSessionSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
});

const joinSessionSchema = z.object({
  roomName: z.string().min(1, 'Room name is required'),
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
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 600,   // auto-close after 10 min empty
      maxParticipants: 30,
    });

    // Mint a participant token. Role metadata is read by the classroom UI to
    // decide which video feed goes in the large "teacher" slot.
    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: userId,
      name: user.name,
      metadata: JSON.stringify({ role: role.toLowerCase() }),
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
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
    if (!enrollment) {
      return reply.status(403).send({ error: 'You are not enrolled in this course' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const roomService = new RoomServiceClient(
      toHttpUrl(config.LIVEKIT_URL),
      config.LIVEKIT_API_KEY,
      config.LIVEKIT_API_SECRET,
    );
    const rooms = await roomService.listRooms([roomName]);
    if (rooms.length === 0) {
      return reply.status(409).send({ error: 'This class is not live yet — please wait for your teacher to start it' });
    }

    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: userId,
      name: user.name,
      metadata: JSON.stringify({ role: role.toLowerCase() }),
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    const token = await at.toJwt();

    return reply.send({ data: { token, roomName, livekitUrl: config.LIVEKIT_URL } });
  });
}
