import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/ready', async (_request, reply) => {
    try { await prisma.$queryRaw`SELECT 1`; return { status: 'ready' }; }
    catch { return reply.status(503).send({ status: 'unavailable' }); }
  });
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));
}
