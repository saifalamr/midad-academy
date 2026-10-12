import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';

// Temporary, explicitly authorized preview maintenance. Removed after the reset.
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
  let exportedHash: string | undefined;
  const tables = Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name).sort();
  const quoted = (name: string) => '"' + name.replace(/"/g, '""') + '"';
  const lock = `LOCK TABLE ${tables.map(quoted).join(', ')} IN ACCESS EXCLUSIVE MODE`;
  async function snapshot(tx: Prisma.TransactionClient) {
    const data: Record<string, unknown[]> = {};
    for (const table of tables) {
      const rows = await tx.$queryRawUnsafe<{ row: unknown }[]>(
        `SELECT to_jsonb(t) AS row FROM ${quoted(table)} t ORDER BY to_jsonb(t)::text`
      );
      data[table] = rows.map((r) => r.row);
    }
    return data;
  }
  const hash = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    if (request.user.role !== 'ADMIN') throw httpError(403, 'Administration only');
    const supplied = request.headers['x-preview-reset-key'];
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(key) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(key))
    )
      throw httpError(403, 'Maintenance key required');
    if (consumed) throw httpError(410, 'Maintenance completed');
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/backup', async () => {
    const data = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(lock);
        if (await tx.classSession.count({ where: { status: 'LIVE' } }))
          throw httpError(409, 'An active class must end before resetting');
        return snapshot(tx);
      },
      { timeout: 60000 }
    );
    exportedHash = hash(data);
    return { sha256: exportedHash, exportedAt: new Date().toISOString(), tables: data };
  });
  app.post('/execute', async (request) => {
    const body = request.body as { backupSha256?: string; confirm?: string };
    if (
      !exportedHash ||
      body?.backupSha256 !== exportedHash ||
      body?.confirm !== 'CLEAR_PREVIEW_KEEP_ADMINS'
    )
      throw httpError(400, 'A saved backup is required');
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(lock);
        const data = await snapshot(tx);
        if (hash(data) !== exportedHash)
          throw httpError(409, 'Data changed; create another backup');
        if (!(await tx.user.count({ where: { role: 'ADMIN', id: request.user.id } })))
          throw httpError(409, 'Administrator missing');
        const emptied = tables.filter((t) => t !== 'User' && t !== 'Badge');
        // All referencing tables are included; deliberately omit CASCADE to reject unexpected dependencies.
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${emptied.map(quoted).join(', ')}`);
        await tx.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
        await tx.user.updateMany({
          where: { role: 'ADMIN' },
          data: { tokenVersion: { increment: 1 } },
        });
        return {
          users: await tx.user.count(),
          admins: await tx.user.count({ where: { role: 'ADMIN' } }),
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
    return { data: result };
  });
}
