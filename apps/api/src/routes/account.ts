import type { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export async function accountRoutes(app: FastifyInstance) {
  app.patch('/profile', { preHandler: [app.authenticate] }, async (request) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(request.body);
    return { data: await prisma.user.update({ where: { id: request.user.id }, data: { name }, select: { name: true, email: true, role: true } }) };
  });
  app.post('/parent-link-code', { preHandler: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (request.user.role !== 'STUDENT') return reply.status(403).send({ error: 'Only students can generate a linking code' });
    const linkCode = randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await prisma.studentProfile.update({ where: { userId: request.user.id },
      data: { parentLinkHash: createHash('sha256').update(linkCode).digest('hex'), parentLinkExpiresAt: expiresAt } });
    return { data: { linkCode, expiresAt } };
  });
}
