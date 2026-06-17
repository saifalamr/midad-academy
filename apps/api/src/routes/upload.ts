import type { FastifyInstance } from 'fastify';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { config } from '../config';

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

// Streams a buffer to Cloudinary and resolves with the upload response.
// resource_type: 'auto' lets Cloudinary handle both images and PDFs (raw).
function uploadToCloudinary(buffer: Buffer): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'auto', folder: 'arabic-platform' },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
          return;
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

export async function uploadRoutes(app: FastifyInstance) {
  // ── POST /api/upload ───────────────────────────────────────────────────────
  // Accepts a single multipart file (PDF or image), uploads it to Cloudinary,
  // and returns its secure URL. Only teachers may upload.
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { role } = request.user;
    if (role !== 'TEACHER') {
      return reply.status(403).send({ error: 'Only teachers can upload files' });
    }

    if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
      request.log.error('Cloudinary credentials are not configured');
      return reply.status(500).send({ error: 'File storage is not configured' });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return reply.status(400).send({ error: `Unsupported file type: ${file.mimetype}` });
    }

    let result: UploadApiResponse;
    try {
      result = await uploadToCloudinary(await file.toBuffer());
    } catch (err) {
      request.log.error({ err }, 'Cloudinary upload failed');
      return reply.status(502).send({ error: 'Failed to upload file' });
    }

    return reply.status(201).send({
      data: {
        url: result.secure_url,
        name: file.filename,
      },
    });
  });
}
