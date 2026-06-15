import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ZodError } from 'zod';
import { config } from './config';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { courseRoutes } from './routes/courses';
import { lessonRoutes } from './routes/lessons';
import { contentRoutes } from './routes/content';
import { quizRoutes } from './routes/quiz';
import { studentRoutes } from './routes/students';
import { teacherRoutes } from './routes/teacher';
import { uploadRoutes } from './routes/upload';
import { enrollmentRoutes } from './routes/enrollments';
import { parentRoutes } from './routes/parent';
import { paymentRoutes } from './routes/payments';
import { sessionRoutes } from './routes/sessions';
import { startWhiteboardWebSocketServer } from './ws-server';

const app = Fastify({ logger: config.NODE_ENV !== 'test' });

async function bootstrap() {
  // ── Security middleware ──────────────────────────────────────────────────
  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  const uploadDir = path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
  });

  // ── JWT ─────────────────────────────────────────────────────────────────
  // Registered at root level so app.authenticate is visible to all routes.
  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  // Reusable preHandler — attach to any route that needs authentication.
  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized — invalid or missing token' });
      }
    }
  );

  // ── Global error handler ────────────────────────────────────────────────
  // Turns Zod validation failures into 400 responses with field-level detail.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Validation failed',
        issues: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    app.log.error(error);
    reply.send(error);
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(courseRoutes, { prefix: '/api/courses' });
  await app.register(lessonRoutes, { prefix: '/api/lessons' });
  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(quizRoutes, { prefix: '/api/quiz' });
  await app.register(studentRoutes, { prefix: '/api/students' });
  await app.register(teacherRoutes, { prefix: '/api/teacher' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(enrollmentRoutes, { prefix: '/api/enrollments' });
  await app.register(parentRoutes, { prefix: '/api/parent' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`API running on http://localhost:${config.PORT}`);

  // Separate raw WebSocket server (not Fastify) — the whiteboard's Yjs CRDT
  // sync speaks a small binary protocol that doesn't fit into REST routing.
  startWhiteboardWebSocketServer(config.WHITEBOARD_WS_PORT);
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
