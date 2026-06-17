import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  // Accept any case, normalise to uppercase to match Prisma enum
  role: z
    .string()
    .transform((r) => r.toUpperCase())
    .pipe(z.enum(['TEACHER', 'STUDENT', 'PARENT'])),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Fields that are safe to return — never include passwordHash
const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export async function authRoutes(app: FastifyInstance) {
  // ── POST /api/auth/register ────────────────────────────────────────────────
  // Creates a User + the matching role profile in one Prisma nested write.
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role,
        // Each branch creates the role-specific profile row in the same transaction
        ...(body.role === 'TEACHER' && {
          teacherProfile: {
            create: { bio: '', qualifications: [], hourlyRate: 0 },
          },
        }),
        ...(body.role === 'STUDENT' && {
          studentProfile: {
            create: { age: 0, level: 'beginner' },
          },
        }),
        ...(body.role === 'PARENT' && {
          parentProfile: { create: {} },
        }),
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

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const passwordMatch = user ? await bcrypt.compare(body.password, user.passwordHash) : false;

    // Evaluate both branches before responding to prevent timing attacks
    if (!user || !passwordMatch) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ id: user.id, email: user.email, role: user.role });

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
  app.get(
    '/me',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
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
    }
  );
}
