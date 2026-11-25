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
  'video/mp4',
  'video/webm',
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
      }
    );
    stream.end(buffer);
  });
}

export async function uploadRoutes(app: FastifyInstance) {
  // ── POST /api/upload ───────────────────────────────────────────────────────
  // Course files enter the admin library before assignment to a scheduled class.
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { role } = request.user;
    if (role !== 'ADMIN') {
      return reply.status(403).send({ error: 'رفع ملفات المنهج متاح لإدارة الأكاديمية فقط' });
    }

    if (
      !config.CLOUDINARY_CLOUD_NAME ||
      !config.CLOUDINARY_API_KEY ||
      !config.CLOUDINARY_API_SECRET
    ) {
      request.log.error('Cloudinary credentials are not configured');
      return reply.status(503).send({ error: 'خدمة حفظ الملفات غير متاحة الآن' });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'اختر ملفًا للرفع' });
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return reply.status(400).send({ error: 'اختر ملف PDF أو صورة أو فيديو MP4 أو WebM' });
    }

    let result: UploadApiResponse;
    try {
      result = await uploadToCloudinary(await file.toBuffer());
    } catch (err) {
      request.log.error({ err }, 'Cloudinary upload failed');
      return reply.status(502).send({ error: 'تعذر رفع الملف الآن؛ أعد المحاولة' });
    }

    return reply.status(201).send({
      data: {
        url: result.secure_url,
        name: file.filename,
      },
    });
  });
}
