import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const updateContentSchema = z.object({
  order: z.number().int().min(0, 'Order must be 0 or more'),
});

export async function lessonRoutes(app: FastifyInstance) {
  // ── PATCH /api/lessons/:id ────────────────────────────────────────────────
  // Updates a content item's display order. Only the owning teacher may do this.
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can manage course content' });
      }

      const content = await prisma.courseContent.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!content) {
        return reply.status(404).send({ error: 'Lesson not found' });
      }

      const body = updateContentSchema.parse(request.body);

      const updated = await prisma.courseContent.update({
        where: { id },
        data: { order: body.order },
      });

      return reply.send({ data: updated });
    }
  );

  // ── DELETE /api/lessons/:id ────────────────────────────────────────────────
  // Deletes a content item. Only the owning teacher may do this.
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      const { id } = request.params;

      if (role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Only administrators can manage course content' });
      }

      const content = await prisma.courseContent.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!content) {
        return reply.status(404).send({ error: 'Lesson not found' });
      }

      await prisma.courseContent.delete({ where: { id } });

      return reply.send({ data: { id } });
    }
  );
}
