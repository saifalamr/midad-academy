import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config, validateConfig } from './config';
import { prisma } from './lib/prisma';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { courseRoutes } from './routes/courses';
import { lessonRoutes } from './routes/lessons';
import { learningRoutes } from './routes/learning';
import { contentRoutes } from './routes/content';
import { quizRoutes } from './routes/quiz';
import { studentRoutes } from './routes/students';
import { teacherRoutes } from './routes/teacher';
import { uploadRoutes } from './routes/upload';
import { enrollmentRoutes } from './routes/enrollments';
import { parentRoutes } from './routes/parent';
import { paymentRoutes } from './routes/payments';
import { sessionRoutes } from './routes/sessions';
import { accountRoutes } from './routes/account';
import { startWhiteboardWebSocketServer } from './ws-server';
import { rateLimitKey } from './lib/rate-limit';

export async function buildApp() {
  validateConfig();
  const app = Fastify({ logger: config.NODE_ENV !== 'test', bodyLimit: 1024 * 1024 });
  // ── Security middleware ──────────────────────────────────────────────────
  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, callback) => {
      const allowed = config.CORS_ORIGIN;
      // No origin header → same-origin / non-browser clients (curl, health checks).
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    preflight: true,
    strictPreflight: false,
    // Return 200 (not the default 204) for OPTIONS preflight so legacy/strict
    // browser stacks (some Edge/Safari/SmartTV builds) don't choke on it.
    optionsSuccessStatus: 200,
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute', keyGenerator: request => rateLimitKey(request, token => app.jwt.verify<{ id: string }>(token)) });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

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
        return void reply.status(401).send({ error: 'Unauthorized — invalid or missing token' });
      }
      // A database outage is a server error, not a reason to invalidate a valid login.
      const user = await prisma.user.findUnique({ where: { id: request.user.id } });
      if (!user || user.role !== request.user.role || user.tokenVersion !== (request.user.version ?? 0)) {
        return void reply.status(401).send({ error: 'Your session has expired. Please log in again.' });
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
    const failure = error as { statusCode?: number; message?: string; code?: string };
    if (failure.code === 'P2002') return void reply.status(409).send({ error: 'This record already exists' });
    const statusCode = failure.statusCode ?? 500;
    reply.status(statusCode).send({ error: statusCode >= 500 ? 'An unexpected server error occurred' : failure.message ?? 'Invalid request' });
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(accountRoutes, { prefix: '/api/account' });
  await app.register(courseRoutes, { prefix: '/api/courses' });
  await app.register(lessonRoutes, { prefix: '/api/lessons' });
  await app.register(learningRoutes, { prefix: '/api/learning' });
  await app.register(contentRoutes, { prefix: '/api/content' });
  await app.register(quizRoutes, { prefix: '/api/quiz' });
  await app.register(studentRoutes, { prefix: '/api/students' });
  await app.register(teacherRoutes, { prefix: '/api/teacher' });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  await app.register(enrollmentRoutes, { prefix: '/api/enrollments' });
  await app.register(parentRoutes, { prefix: '/api/parent' });
  await app.register(sessionRoutes, { prefix: '/api/sessions' });
  await app.register(paymentRoutes, { prefix: '/api/payments' });

  return app;
}

async function bootstrap() {
  const app = await buildApp();
  await app.listen({ port: config.PORT, host: config.HOST });
  const whiteboard = startWhiteboardWebSocketServer(app.server, app);
  const shutdown = async () => { await whiteboard.close(); await app.close(); await prisma.$disconnect(); };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}

if (require.main === module) bootstrap().catch((err) => { console.error(err.message); process.exit(1); });
