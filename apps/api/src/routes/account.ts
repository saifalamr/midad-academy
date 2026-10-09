import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export async function accountRoutes(app: FastifyInstance) {
  app.patch('/profile', { preHandler: [app.authenticate] }, async (request) => {
    const { name } = z.object({ name: z.string().trim().min(2).max(100) }).parse(request.body);
    return {
      data: await prisma.user.update({
        where: { id: request.user.id },
        data: { name },
        select: { name: true, email: true, role: true },
      }),
    };
  });
  app.post('/parent-link-code', { preHandler: [app.authenticate] }, async (_request, reply) =>
    reply.status(403).send({ error: 'حساب الطالب وربطه بولي الأمر تديره الأكاديمية' })
  );
}
