import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
export async function bootstrapAdmin(db: PrismaClient) {
  if (!process.env.PREVIEW_ADMIN_BOOTSTRAP) return;
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.RENDER_SERVICE_ID !== 'srv-db3m9ad9fdbs73ed597g' ||
    url.hostname !== 'dpg-db3m90l9fdbs73ed4ct0-a' ||
    url.pathname !== '/midad_preview'
  )
    throw new Error('Admin bootstrap is restricted to the authorized preview');
  const body = z
    .object({
      email: z.string().email(),
      name: z.string().min(2),
      hash: z.string().regex(/^\$2[aby]\$\d{2}\$.{53}$/),
    })
    .parse(JSON.parse(process.env.PREVIEW_ADMIN_BOOTSTRAP));
  const existing = await db.user.findUnique({ where: { email: body.email } });
  if (existing) {
    if (existing.role !== 'ADMIN')
      throw new Error('Admin bootstrap account conflicts with an existing role');
    return;
  }
  await db.user.create({
    data: { email: body.email, name: body.name, passwordHash: body.hash, role: 'ADMIN' },
  });
  console.log('Preview academy administrator prepared.');
}
