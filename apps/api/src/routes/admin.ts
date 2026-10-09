import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { availableSeat, lockCourse } from '../lib/enrollment';

const person = { name: z.string().trim().min(2).max(100), password: z.string().min(10).max(128) };
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'اختر شهر الدورة');
const courseSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(10).max(5000),
  teacherId: z.string().min(1),
  ageGroup: z.enum(['5–7', '8–10', '11–13', '14–15']),
  month,
  timeZone: z
    .string()
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'اختر منطقة زمنية صحيحة')
    .default('Europe/Istanbul'),
  price: z.number().min(0).max(100000),
  maxStudents: z.number().int().min(1).max(100),
});
const sessionSchema = z.object({
  title: z.string().trim().min(2).max(200),
  scheduledAt: z.coerce.date(),
  durationMinutes: z.number().int().min(5).max(240),
});
const userSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  whatsappPhone: true,
  role: true,
} as const;
function inMonth(date: Date, value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return (
    `${parts.find((p) => p.type === 'year')?.value}-${parts.find((p) => p.type === 'month')?.value}` ===
    value
  );
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    await app.authenticate(request, reply);
    if (reply.sent) return;
    if (request.user.role !== 'ADMIN')
      return reply.status(403).send({ error: 'هذه الصفحة لإدارة الأكاديمية فقط' });
  });
  app.get('/overview', async () => {
    const [teachers, parents, students, courses] = await Promise.all([
      prisma.teacherProfile.findMany({
        select: { id: true, user: { select: userSelect } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.parentProfile.findMany({
        select: { id: true, user: { select: userSelect }, _count: { select: { children: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.studentProfile.findMany({
        select: {
          id: true,
          age: true,
          user: { select: userSelect },
          parent: { select: { id: true, user: { select: userSelect } } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.course.findMany({
        include: {
          teacher: { select: { id: true, user: { select: userSelect } } },
          classSessions: { orderBy: { scheduledAt: 'asc' } },
          enrollments: {
            select: {
              id: true,
              status: true,
              studentId: true,
              student: { select: { user: { select: userSelect } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { data: { teachers, parents, students, courses } };
  });
  app.post('/teachers', async (request, reply) => {
    const body = z
      .object({ ...person, email: z.string().trim().toLowerCase().email() })
      .parse(request.body);
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        role: 'TEACHER',
        teacherProfile: { create: { bio: '', qualifications: [], hourlyRate: 0 } },
      },
      select: userSelect,
    });
    return reply.status(201).send({ data: user });
  });
  app.post('/students', async (request, reply) => {
    const body = z
      .object({
        ...person,
        parentId: z.string().min(1),
        age: z.number().int().min(5).max(15),
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(
            /^[a-z0-9][a-z0-9._-]{2,31}$/,
            'اسم المستخدم: 3–32 حرفًا إنجليزيًا أو رقمًا، ويُسمح بالنقطة والشرطة'
          ),
      })
      .parse(request.body);
    if (
      await prisma.user.findFirst({
        where: {
          OR: [{ username: body.username }, { email: `${body.username}@students.midad.test` }],
        },
        select: { id: true },
      })
    )
      throw httpError(409, 'اسم المستخدم مستخدم بالفعل');
    const passwordHash = await bcrypt.hash(body.password, 12);
    const student = await prisma.$transaction(async (tx) => {
      if (!(await tx.parentProfile.findUnique({ where: { id: body.parentId } })))
        throw httpError(404, 'ولي الأمر غير موجود');
      return tx.user.create({
        data: {
          name: body.name,
          username: body.username,
          email: `${body.username}@students.midad.test`,
          passwordHash,
          role: 'STUDENT',
          studentProfile: { create: { age: body.age, parentId: body.parentId } },
        },
        select: userSelect,
      });
    });
    return reply.status(201).send({ data: student });
  });
  app.patch<{ Params: { id: string } }>('/students/:id/parent', async (request) => {
    const { parentId } = z.object({ parentId: z.string().min(1) }).parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      if (!(await tx.parentProfile.findUnique({ where: { id: parentId } })))
        throw httpError(404, 'ولي الأمر غير موجود');
      if (!(await tx.studentProfile.findUnique({ where: { id: request.params.id } })))
        throw httpError(404, 'الطالب غير موجود');
      return tx.studentProfile.update({
        where: { id: request.params.id },
        data: { parentId, parentLinkHash: null, parentLinkExpiresAt: null },
        select: { id: true, parentId: true },
      });
    });
    return { data: result };
  });
  app.post('/courses', async (request, reply) => {
    const body = courseSchema.parse(request.body);
    if (!(await prisma.teacherProfile.findUnique({ where: { id: body.teacherId } })))
      throw httpError(404, 'اختر معلمًا موجودًا');
    const course = await prisma.course.create({
      data: { ...body, level: 'beginner', billingPeriod: 'MONTHLY' },
    });
    return reply.status(201).send({ data: course });
  });
  app.patch<{ Params: { id: string } }>('/courses/:id', async (request) => {
    const body = courseSchema.partial().parse(request.body);
    const course = await prisma.$transaction(async (tx) => {
      const current = await lockCourse(tx, request.params.id);
      if (await tx.classSession.count({ where: { courseId: current.id, status: 'LIVE' } }))
        throw httpError(409, 'أنهِ الحصة المباشرة قبل تعديل الدورة');
      if (
        body.teacherId &&
        !(await tx.teacherProfile.findUnique({ where: { id: body.teacherId } }))
      )
        throw httpError(404, 'المعلم غير موجود');
      if (
        body.maxStudents !== undefined &&
        body.maxStudents <
          (await tx.enrollment.count({ where: { courseId: current.id, status: 'ACTIVE' } }))
      )
        throw httpError(409, 'السعة أقل من عدد الطلاب المسجلين');
      if (
        body.month &&
        body.month !== current.month &&
        (await tx.classSession.count({ where: { courseId: current.id } }))
      )
        throw httpError(409, 'لا يمكن تغيير شهر دورة لها حصص. أنشئ دورة الشهر الجديد بدلًا منها.');
      if (
        ((body.month && body.month !== current.month) ||
          (body.timeZone && body.timeZone !== current.timeZone)) &&
        (await tx.classSession.count({ where: { courseId: current.id } }))
      )
        throw httpError(409, 'لا يمكن تغيير الشهر أو المنطقة الزمنية بعد إضافة المواعيد');
      if (body.teacherId && body.teacherId !== current.teacherId) {
        await tx.$queryRaw`SELECT id FROM "TeacherProfile" WHERE id = ${body.teacherId} FOR UPDATE`;
        const assigned = await tx.classSession.findMany({
          where: { courseId: current.id, status: 'SCHEDULED' },
        });
        const existing = await tx.classSession.findMany({
          where: {
            teacherId: body.teacherId,
            status: { in: ['SCHEDULED', 'LIVE'] },
            courseId: { not: current.id },
          },
        });
        if (
          assigned.some((a) =>
            existing.some(
              (b) =>
                a.scheduledAt.getTime() < b.scheduledAt.getTime() + b.durationMinutes * 60000 &&
                a.scheduledAt.getTime() + a.durationMinutes * 60000 > b.scheduledAt.getTime()
            )
          )
        )
          throw httpError(409, 'مواعيد الدورة تتعارض مع حصص المعلم الجديد');
      }
      if (
        body.maxStudents !== undefined &&
        body.maxStudents <
          (await tx.enrollment.count({ where: { courseId: current.id, status: 'ACTIVE' } })) +
            (await tx.seatReservation.count({ where: { courseId: current.id } }))
      )
        throw httpError(409, 'السعة أقل من المقاعد المسجلة والمحجوزة');
      const updated = await tx.course.update({ where: { id: current.id }, data: body });
      if (body.teacherId)
        await tx.classSession.updateMany({
          where: { courseId: current.id, status: 'SCHEDULED' },
          data: { teacherId: body.teacherId },
        });
      return updated;
    });
    return { data: course };
  });
  app.post<{ Params: { id: string } }>('/courses/:id/enrollments', async (request, reply) => {
    const { studentId } = z.object({ studentId: z.string().min(1) }).parse(request.body);
    const enrollment = await prisma.$transaction(async (tx) => {
      const course = await lockCourse(tx, request.params.id);
      const student = await tx.studentProfile.findUnique({ where: { id: studentId } });
      if (!student?.parentId) throw httpError(400, 'اربط الطالب بولي أمر قبل تسجيله في الدورة');
      const existing = await tx.enrollment.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId } },
      });
      if (existing?.status === 'ACTIVE') return existing;
      if (!(await availableSeat(tx, course.id, course.maxStudents)))
        throw httpError(409, 'اكتملت مقاعد الدورة');
      return tx.enrollment.upsert({
        where: { courseId_studentId: { courseId: course.id, studentId } },
        create: { courseId: course.id, studentId },
        update: { status: 'ACTIVE' },
      });
    });
    return reply.status(201).send({ data: enrollment });
  });
  app.delete<{ Params: { id: string; studentId: string } }>(
    '/courses/:id/enrollments/:studentId',
    async (request) => {
      await prisma.$transaction(async (tx) => {
        await lockCourse(tx, request.params.id);
        await tx.enrollment.updateMany({
          where: {
            courseId: request.params.id,
            studentId: request.params.studentId,
            status: 'ACTIVE',
          },
          data: { status: 'CANCELLED' },
        });
      });
      return { message: 'تم إلغاء تسجيل الطالب مع الاحتفاظ بسجله' };
    }
  );
  app.post<{ Params: { id: string } }>('/courses/:id/sessions', async (request, reply) => {
    const body = sessionSchema.parse(request.body);
    if (body.scheduledAt < new Date()) throw httpError(400, 'اختر موعدًا قادمًا');
    const session = await prisma.$transaction(async (tx) => {
      const course = await lockCourse(tx, request.params.id);
      if (course.month && !inMonth(body.scheduledAt, course.month, course.timeZone))
        throw httpError(400, 'الموعد يجب أن يكون داخل شهر الدورة بحسب منطقتها الزمنية');
      await tx.$queryRaw`SELECT id FROM "TeacherProfile" WHERE id = ${course.teacherId} FOR UPDATE`;
      const others = await tx.classSession.findMany({
        where: {
          teacherId: course.teacherId,
          status: { in: ['SCHEDULED', 'LIVE'] },
          scheduledAt: {
            gte: new Date(body.scheduledAt.getTime() - 4 * 3600000),
            lte: new Date(body.scheduledAt.getTime() + 4 * 3600000),
          },
        },
      });
      const end = body.scheduledAt.getTime() + body.durationMinutes * 60000;
      if (
        others.some(
          (s) =>
            s.scheduledAt.getTime() < end &&
            s.scheduledAt.getTime() + s.durationMinutes * 60000 > body.scheduledAt.getTime()
        )
      )
        throw httpError(409, 'المعلم لديه حصة تتعارض مع هذا الموعد');
      return tx.classSession.create({
        data: { ...body, courseId: course.id, teacherId: course.teacherId },
      });
    });
    return reply.status(201).send({ data: session });
  });
  app.patch<{ Params: { id: string } }>('/sessions/:id/cancel', async (request) => {
    const session = await prisma.classSession.findUnique({ where: { id: request.params.id } });
    if (!session) throw httpError(404, 'الحصة غير موجودة');
    await prisma.$transaction(async (tx) => {
      await lockCourse(tx, session.courseId);
      const changed = await tx.classSession.updateMany({
        where: { id: session.id, status: 'SCHEDULED' },
        data: { status: 'CANCELLED' },
      });
      if (!changed.count) throw httpError(409, 'يمكن إلغاء الحصص المجدولة فقط');
    });
    return { message: 'تم إلغاء الموعد' };
  });
}
