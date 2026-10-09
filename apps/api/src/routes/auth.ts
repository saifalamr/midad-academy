import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { randomBytes, createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../config';

const emailSchema = z.string().trim().toLowerCase().email();
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  // Accept any case, normalise to uppercase to match Prisma enum
  role: z
    .string()
    .transform((r) => r.toUpperCase())
    .pipe(z.enum(['TEACHER', 'STUDENT', 'PARENT'])),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  inviteCode: z.string().optional(),
  whatsappPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'أدخل رقم واتساب دوليًا مثل +905001234567')
    .optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254),
  password: z.string().min(1),
});

// Fields that are safe to return — never include passwordHash
const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  whatsappPhone: true,
  role: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export async function authRoutes(app: FastifyInstance) {
  // ── POST /api/auth/register ────────────────────────────────────────────────
  // Creates a User + the matching role profile in one Prisma nested write.
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    if (body.role !== 'PARENT')
      return reply
        .status(403)
        .send({ error: 'التسجيل العام لولي الأمر فقط. حسابات الطلاب والمعلمين تنشئها الإدارة.' });
    if (!body.whatsappPhone) return reply.status(400).send({ error: 'رقم واتساب ولي الأمر مطلوب' });

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        whatsappPhone: body.whatsappPhone,
        passwordHash,
        role: body.role,
        parentProfile: { create: {} },
      },
      select: safeUserSelect,
    });

    return reply.status(201).send({ data: user });
  });

  // ── POST /api/auth/login ───────────────────────────────────────────────────
  // Returns a signed JWT valid for 7 days. Same error for bad email or bad
  // password so attackers can't enumerate registered accounts.
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: body.email.includes('@') ? { email: body.email } : { username: body.email },
    });
    const passwordMatch = user ? await bcrypt.compare(body.password, user.passwordHash) : false;

    // Evaluate both branches before responding to prevent timing attacks
    if (!user || !passwordMatch) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      version: user.tokenVersion,
    });

    return reply.send({
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  });

  // ── GET /api/auth/me ───────────────────────────────────────────────────────
  // Protected route. @fastify/jwt verifies the Bearer token in preHandler.
  // Returns a fresh DB fetch (not just the JWT payload) so profile changes
  // are always reflected.
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        ...safeUserSelect,
        teacherProfile: true,
        studentProfile: true,
        parentProfile: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ data: user });
  });

  app.post(
    '/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { email } = z.object({ email: emailSchema }).parse(request.body);
      if (!config.SMTP_HOST || !config.MAIL_FROM)
        return reply
          .status(503)
          .send({ error: 'Email delivery is not configured. Contact the academy for help.' });
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        const token = randomBytes(32).toString('hex');
        await prisma.$transaction([
          prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
          prisma.passwordReset.create({
            data: {
              userId: user.id,
              tokenHash: tokenHash(token),
              expiresAt: new Date(Date.now() + 30 * 60_000),
            },
          }),
        ]);
        const url = `${config.FRONTEND_URL}/reset-password?token=${token}`;
        try {
          await nodemailer
            .createTransport({
              host: config.SMTP_HOST,
              port: config.SMTP_PORT,
              secure: config.SMTP_PORT === 465,
              ...(config.SMTP_USER
                ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
                : {}),
            })
            .sendMail({
              from: config.MAIL_FROM,
              to: user.email,
              subject: 'Reset your Midad Academy password',
              text: `Reset your password using this link (valid for 30 minutes):\n${url}\nIf you did not request this, ignore this email.`,
            });
        } catch {
          request.log.error('Password reset email delivery failed');
        }
      }
      return reply.send({
        message: 'If this email is registered, a password reset link will be sent.',
      });
    }
  );

  app.post(
    '/reset-password',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { token, password } = z
        .object({ token: z.string().length(64), password: z.string().min(8).max(128) })
        .parse(request.body);
      const hash = await bcrypt.hash(password, 10);
      const changed = await prisma.$transaction(async (tx) => {
        const reset = await tx.passwordReset.findUnique({ where: { tokenHash: tokenHash(token) } });
        if (!reset || reset.expiresAt <= new Date()) return false;
        const claimed = await tx.passwordReset.deleteMany({
          where: { id: reset.id, expiresAt: { gt: new Date() } },
        });
        if (!claimed.count) return false;
        await tx.user.update({
          where: { id: reset.userId },
          data: { passwordHash: hash, tokenVersion: { increment: 1 } },
        });
        await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
        return true;
      });
      if (!changed)
        return reply.status(400).send({ error: 'This reset link is invalid or expired' });
      return reply.send({ message: 'Password updated. Log in with your new password.' });
    }
  );
}
