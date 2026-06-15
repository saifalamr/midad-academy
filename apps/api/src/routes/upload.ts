import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export async function uploadRoutes(app: FastifyInstance) {
  // ── POST /api/upload ───────────────────────────────────────────────────────
  // Accepts a single multipart file (PDF or image), saves it to disk, and
  // returns a publicly-accessible URL. Only teachers may upload.
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { role } = request.user;
    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can upload files' });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return reply.status(400).send({ error: `Unsupported file type: ${file.mimetype}` });
    }

    const ext = path.extname(file.filename) || '';
    const filename = `${randomUUID()}${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    const destPath = path.join(uploadDir, filename);
    await fs.writeFile(destPath, await file.toBuffer());

    return reply.status(201).send({
      data: {
        url: `${config.API_URL}/uploads/${filename}`,
        name: file.filename,
      },
    });
  });
}
