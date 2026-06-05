import type { FastifyInstance } from 'fastify';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { z } from 'zod';
import { prisma } from '@arabic-platform/database';
import { config } from '../config';

const createSessionSchema = z.object({
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
}
