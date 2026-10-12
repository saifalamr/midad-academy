import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';

// Temporary preview-only maintenance, explicitly requested without a backup.
export async function previewResetRoutes(app: FastifyInstance) {
  const key = process.env.PREVIEW_RESET_KEY;
  if (
    !key ||
    key.length < 48 ||
    process.env.RENDER_SERVICE_ID !== 'srv-db3m9ad9fdbs73ed597g' ||
    process.env.API_URL !== 'https://midad-preview-api.onrender.com' ||
    !process.env.DATABASE_URL?.includes('/midad_preview')
  )
    return;
  let consumed = false;
  app.post('/execute', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') throw httpError(403, 'Administration only');
    const supplied = request.headers['x-preview-reset-key'];
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(key) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(key))
    )
      throw httpError(403, 'Maintenance key required');
    if (consumed) throw httpError(410, 'Maintenance completed');
    if ((request.body as { confirm?: string })?.confirm !== 'CLEAR_PREVIEW_KEEP_ADMINS_NO_BACKUP')
      throw httpError(400, 'Explicit reset scope required');
    const tables = Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name).sort();
    const quoted = (name: string) => '"' + name.replace(/"/g, '""') + '"';
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `LOCK TABLE ${tables.map(quoted).join(', ')} IN ACCESS EXCLUSIVE MODE`
        );
        if (!(await tx.user.count({ where: { role: 'ADMIN', id: request.user.id } })))
          throw httpError(409, 'Administrator missing');
        if (await tx.classSession.count({ where: { status: 'LIVE' } }))
          throw httpError(409, 'End active classes first');
        await tx.$executeRawUnsafe(
          `TRUNCATE TABLE ${tables
            .filter((t) => t !== 'User' && t !== 'Badge')
            .map(quoted)
            .join(', ')}`
        );
        await tx.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
        await tx.user.updateMany({
          where: { role: 'ADMIN' },
          data: { tokenVersion: { increment: 1 } },
        });
        return {
          admins: await tx.user.count({ where: { role: 'ADMIN' } }),
          users: await tx.user.count(),
          courses: await tx.course.count(),
          sessions: await tx.classSession.count(),
          students: await tx.studentProfile.count(),
          teachers: await tx.teacherProfile.count(),
          parents: await tx.parentProfile.count(),
        };
      },
      { timeout: 60000 }
    );
    consumed = true;
    reply.header('Cache-Control', 'no-store');
    return { data: result };
  });
}
