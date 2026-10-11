import type { FastifyInstance } from 'fastify';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { httpError } from '../lib/access';
import { eligible } from './homework';
const audioTypes = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);
type AudioQuestion = { id: string; type: string; maxSeconds?: number };
const configured = () =>
  !!(config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET);
export async function homeworkAudioRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.post<{ Params: { sessionId: string; questionId: string } }>(
    '/:sessionId/:questionId',
    async (request, reply) => {
      if (request.user.role !== 'STUDENT') throw httpError(403, 'التسجيل من حساب الطالب فقط');
      const student = await prisma.studentProfile.findUniqueOrThrow({
        where: { userId: request.user.id },
      });
      const initial = await prisma.classSession.findUnique({
        where: { id: request.params.sessionId },
        include: { homework: true },
      });
      const question = (initial?.homework?.questions as AudioQuestion[] | undefined)?.find(
        (q) => q.id === request.params.questionId && q.type === 'AUDIO'
      );
      if (
        !initial ||
        initial.status !== 'COMPLETED' ||
        !question ||
        !(await eligible(prisma, student.id, initial))
      )
        throw httpError(403, 'هذا السؤال الصوتي غير متاح لك');
      if (
        await prisma.homeworkSubmission.findUnique({
          where: { sessionId_studentId: { sessionId: initial.id, studentId: student.id } },
        })
      )
        throw httpError(409, 'الواجب مسلّم؛ التسجيل محفوظ ولا يمكن تغييره');
      if (!configured()) throw httpError(503, 'التخزين الصوتي غير مهيأ. تواصل مع الأكاديمية');
      const file = await request.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
      if (!file || !audioTypes.has(file.mimetype.split(';')[0]))
        throw httpError(400, 'ارفع ملفًا صوتيًا MP3 أو M4A أو WAV أو WebM فقط');
      const buffer = await file.toBuffer();
      if (!buffer.length) throw httpError(400, 'التسجيل فارغ');
      const publicId = `midad-homework-audio/${randomUUID()}`;
      let result: UploadApiResponse;
      try {
        result = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              resource_type: 'video',
              type: 'authenticated',
              public_id: publicId,
              format: 'mp3',
              overwrite: false,
              timeout: 20_000,
            },
            (error, uploaded) =>
              error || !uploaded ? reject(error ?? new Error('Upload failed')) : resolve(uploaded)
          );
          stream.end(buffer);
        });
      } catch (err) {
        request.log.error({ err }, 'Audio storage failed');
        throw httpError(502, 'تعذر حفظ التسجيل؛ أعد المحاولة');
      }
      const discard = async (id: string) => {
        try {
          await cloudinary.uploader.destroy(id, {
            resource_type: 'video',
            type: 'authenticated',
            invalidate: true,
          });
        } catch (err) {
          request.log.error({ err }, 'Audio cleanup failed');
        }
      };
      if (
        !result.duration ||
        result.duration > (question.maxSeconds ?? 60) + 1 ||
        result.width ||
        result.height ||
        result.bytes > 5 * 1024 * 1024
      ) {
        await discard(publicId);
        throw httpError(
          400,
          `ارفع صوتًا فقط بطول لا يتجاوز ${question.maxSeconds ?? 60} ثانية وحجم حتى ٥ ميجابايت`
        );
      }
      try {
        const saved = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "sessionId" FROM "SessionHomework" WHERE "sessionId" = ${initial.id} FOR UPDATE`;
          const current = await tx.classSession.findUnique({
            where: { id: initial.id },
            include: { homework: true },
          });
          if (
            !current ||
            current.status !== 'COMPLETED' ||
            current.homework?.version !== initial.homework?.version ||
            !(await eligible(tx, student.id, current))
          )
            throw httpError(409, 'الحصة أو صلاحية الواجب تغيرت؛ حدّث الصفحة');
          if (
            await tx.homeworkSubmission.findUnique({
              where: { sessionId_studentId: { sessionId: initial.id, studentId: student.id } },
            })
          )
            throw httpError(409, 'سبق تسليم الواجب أثناء الرفع؛ إجاباتك محفوظة');
          const where = {
            sessionId_studentId_questionId: {
              sessionId: initial.id,
              studentId: student.id,
              questionId: question.id,
            },
          };
          const old = await tx.homeworkAudio.findUnique({ where });
          const data = {
            publicId,
            format: result.format,
            duration: result.duration,
            bytes: result.bytes,
          };
          const audio = await tx.homeworkAudio.upsert({
            where,
            create: { ...where.sessionId_studentId_questionId, ...data },
            update: { ...data, id: randomUUID() },
          });
          return { audio, old };
        });
        if (saved.old) await discard(saved.old.publicId);
        return reply
          .status(201)
          .send({ data: { id: saved.audio.id, duration: saved.audio.duration } });
      } catch (error) {
        await discard(publicId);
        throw error;
      }
    }
  );
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const audio = await prisma.homeworkAudio.findUnique({
      where: { id: request.params.id },
      include: { student: true, session: { include: { teacher: true } } },
    });
    if (!audio) throw httpError(404, 'التسجيل غير موجود');
    const actor = request.user;
    const submitted = await prisma.homeworkSubmission.findUnique({
      where: { sessionId_studentId: { sessionId: audio.sessionId, studentId: audio.studentId } },
    });
    const parent =
      actor.role === 'PARENT' && audio.student.parentId
        ? await prisma.parentProfile.findFirst({
            where: { id: audio.student.parentId, userId: actor.id },
          })
        : null;
    const permitted =
      actor.role === 'ADMIN' ||
      (actor.role === 'STUDENT' && actor.id === audio.student.userId) ||
      (!!submitted && actor.role === 'TEACHER' && actor.id === audio.session.teacher.userId) ||
      (!!submitted?.publishedAt && !!parent);
    if (!permitted) throw httpError(404, 'التسجيل غير موجود');
    if (!configured()) throw httpError(503, 'التخزين الصوتي غير مهيأ');
    reply.header('Cache-Control', 'private, no-store');
    return {
      data: {
        url: cloudinary.utils.private_download_url(audio.publicId, audio.format, {
          resource_type: 'video',
          type: 'authenticated',
          attachment: false,
          expires_at: Math.floor(Date.now() / 1000) + 120,
        }),
        duration: audio.duration,
      },
    };
  });
}
