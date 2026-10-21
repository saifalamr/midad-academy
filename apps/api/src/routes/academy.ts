import { queueFamilyNotification } from '../lib/notifications';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { lockCourse, availableSeat } from '../lib/enrollment';
import {
  parentFor,
  childFor,
  requireAdmin,
  audit,
  notice,
  courseHasEnded,
} from '../lib/academy-operations';
import { academySessionRoutes } from './academy-sessions';
const text = z.string().trim().max(3000);
const applicationInclude = {
  course: {
    select: { id: true, title: true, month: true, price: true, timeZone: true, ageGroup: true },
  },
  student: {
    select: {
      id: true,
      parentId: true,
      age: true,
      user: { select: { name: true, username: true } },
    },
  },
  parent: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.CourseApplicationInclude;
export async function academyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  await academySessionRoutes(app);
  app.get('/courses', async (request) => ({
    data: await prisma.course.findMany({
      where:
        request.user.role === 'ADMIN'
          ? {}
          : request.user.role === 'TEACHER'
            ? { teacher: { userId: request.user.id } }
            : {
                enrollments: {
                  some: {
                    student:
                      request.user.role === 'PARENT'
                        ? { parent: { userId: request.user.id } }
                        : { userId: request.user.id },
                  },
                },
              },
      select: {
        id: true,
        title: true,
        month: true,
        timeZone: true,
        ageGroup: true,
        price: true,
        currency: true,
        enrollments: {
          where:
            request.user.role === 'PARENT'
              ? { student: { parent: { userId: request.user.id } } }
              : request.user.role === 'STUDENT'
                ? { student: { userId: request.user.id } }
                : {},
          select: {
            studentId: true,
            status: true,
            student: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { month: 'desc' },
      take: 100,
    }),
  }));
  app.get('/policy', async (request) => {
    const policy = await prisma.academyPolicy.findUnique({ where: { id: 'academy' } });
    return { data: request.user.role === 'ADMIN' || policy?.published ? policy : null };
  });
  app.put('/policy', async (request) => {
    requireAdmin(request.user);
    const body = z
      .object({
        content: z.string().trim().min(10).max(12000),
        published: z.boolean(),
        version: z.number().int().min(0),
      })
      .parse(request.body);
    return {
      data: await prisma.$transaction(async (tx) => {
        // Serialize first creation too; all policy writes use this fixed advisory lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261020)`;
        const current = await tx.academyPolicy.findUnique({ where: { id: 'academy' } });
        if ((current?.version ?? 0) !== body.version)
          throw httpError(409, 'تغيرت السياسات؛ حدّث الصفحة');
        const policy = await tx.academyPolicy.upsert({
          where: { id: 'academy' },
          create: { content: body.content, published: body.published },
          update: { content: body.content, published: body.published, version: { increment: 1 } },
        });
        await audit(tx, request.user.id, 'POLICY_UPDATED', 'academy', {
          version: policy.version,
          published: policy.published,
        });
        return policy;
      }),
    };
  });
  app.get('/children', async (request) => {
    const parent = await parentFor(request.user);
    return {
      data: await prisma.studentProfile.findMany({
        where: { parentId: parent.id },
        select: {
          id: true,
          age: true,
          level: true,
          user: { select: { name: true, username: true } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
    };
  });
  app.post('/children', async (request, reply) => {
    const parent = await parentFor(request.user);
    const body = z
      .object({ name: z.string().trim().min(2).max(100), age: z.number().int().min(5).max(15) })
      .parse(request.body);
    const username = `midad-${randomBytes(6).toString('hex')}`;
    // No predictable shared password. Parent explicitly sets login credentials later.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const child = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ParentProfile" WHERE id = ${parent.id} FOR UPDATE`;
      if ((await tx.studentProfile.count({ where: { parentId: parent.id } })) >= 20)
        throw httpError(400, 'تواصل مع الإدارة لإضافة المزيد من الأبناء');
      const user = await tx.user.create({
        data: {
          name: body.name,
          username,
          email: `${username}@students.midad.test`,
          role: 'STUDENT',
          passwordHash,
          studentProfile: { create: { age: body.age, parentId: parent.id } },
        },
        select: { studentProfile: { select: { id: true } } },
      });
      await audit(tx, request.user.id, 'CHILD_CREATED', user.studentProfile!.id, {
        name: body.name,
        age: body.age,
      });
      return user.studentProfile;
    });
    return reply.status(201).send({ data: child });
  });
  app.post<{ Params: { id: string } }>('/children/:id/password', async (request) => {
    const child = await childFor(request.user, request.params.id);
    const { password } = z.object({ password: z.string().min(10).max(128) }).parse(request.body);
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${child.id} FOR UPDATE`;
      const current = await tx.studentProfile.findUniqueOrThrow({ where: { id: child.id } });
      if (current.parentId !== child.parentId) throw httpError(409, 'تغير ربط الطالب؛ حدّث الصفحة');
      await tx.user.update({
        where: { id: child.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.passwordReset.deleteMany({ where: { userId: child.userId } });
      await audit(tx, request.user.id, 'CHILD_PASSWORD_RESET', child.id);
    });
    return {
      data: { username: child.user.username },
      message: 'حُفظت كلمة المرور وأُغلقت جلسات الطفل السابقة',
    };
  });
  app.post('/applications', async (request, reply) => {
    const parent = await parentFor(request.user);
    const body = z
      .object({
        studentId: z.string().min(1),
        courseId: z.string().min(1),
        kind: z.enum(['NEW', 'RENEWAL']).default('NEW'),
        preferredTime: text.default(''),
        levelNotes: text.default(''),
        needsAssessment: z.boolean().default(false),
      })
      .parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      const course = await lockCourse(tx, body.courseId);
      if (courseHasEnded(course)) throw httpError(409, 'انتهى شهر الدورة؛ اختر دورة قادمة');
      const child = await tx.studentProfile.findFirst({
        where: { id: body.studentId, parentId: parent.id },
      });
      if (!child) throw httpError(404, 'اختر طفلًا من حسابك');
      const enrollment = await tx.enrollment.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: child.id } },
      });
      if (enrollment?.status === 'ACTIVE')
        throw httpError(409, 'الطفل مسجل بالفعل؛ للتجديد اختر دورة الشهر القادم');
      const prior = await tx.courseApplication.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: child.id } },
      });
      if (prior) {
        if (prior.parentId !== parent.id) throw httpError(409, 'يوجد طلب سابق؛ تواصل مع الإدارة');
        return prior;
      }
      const hasSeat = await availableSeat(tx, course.id, course.maxStudents);
      const application = await tx.courseApplication.create({
        data: {
          ...body,
          parentId: parent.id,
          status: hasSeat ? 'PENDING' : 'WAITLIST',
          quotedAmount: course.price,
          currency: course.currency,
        },
      });
      await audit(tx, request.user.id, 'APPLICATION_CREATED', application.id, {
        courseId: course.id,
        studentId: child.id,
        status: application.status,
      });
      await notice(
        tx,
        request.user.id,
        hasSeat ? 'وصل طلب التسجيل' : 'أضيف طلبك لقائمة الانتظار',
        `طلب ${course.title} محفوظ. التسجيل لا يتأكد إلا بعد اعتماد الإدارة. لا تدفع قبل تأكيد المقعد.`
      );
      return application;
    });
    return reply.status(201).send({ data: result });
  });
  app.get('/applications', async (request) => {
    if (request.user.role === 'ADMIN')
      return {
        data: await prisma.courseApplication.findMany({
          include: applicationInclude,
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      };
    const parent = await parentFor(request.user);
    return {
      data: await prisma.courseApplication.findMany({
        where: { parentId: parent.id, student: { parentId: parent.id } },
        include: applicationInclude,
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });
  app.patch<{ Params: { id: string } }>('/applications/:id', async (request) => {
    const body = z
      .object({
        version: z.number().int().positive(),
        action: z.enum(['APPROVE', 'REJECT', 'CANCEL', 'WAITLIST', 'PAYMENT']),
        response: text.default(''),
        paymentStatus: z.enum(['PAID', 'WAIVED', 'REFUNDED']).optional(),
        paymentReference: z.string().trim().max(200).default(''),
      })
      .parse(request.body);
    const found = await prisma.courseApplication.findUnique({ where: { id: request.params.id } });
    if (!found) throw httpError(404, 'الطلب غير موجود');
    const isAdmin = request.user.role === 'ADMIN';
    if (!isAdmin) {
      const parent = await parentFor(request.user);
      if (found.parentId !== parent.id) throw httpError(404, 'الطلب غير موجود');
      if (body.action !== 'CANCEL') throw httpError(403, 'اعتماد الطلب من الإدارة فقط');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const course = await lockCourse(tx, found.courseId);
      const current = await tx.courseApplication.findUniqueOrThrow({
        where: { id: found.id },
        include: { student: { select: { parentId: true } }, parent: { select: { userId: true } } },
      });
      if (current.student.parentId !== current.parentId)
        throw httpError(409, 'تغير ولي أمر الطالب؛ راجع الإدارة');
      if (current.version !== body.version)
        throw httpError(409, 'تغير الطلب. حدّث الصفحة قبل المتابعة');
      const open = ['PENDING', 'WAITLIST'].includes(current.status);
      const data: Prisma.CourseApplicationUpdateInput = {
        version: { increment: 1 },
        response: body.response,
      };
      if (body.action === 'PAYMENT') {
        if (!isAdmin || current.status !== 'APPROVED' || !body.paymentStatus)
          throw httpError(409, 'تسجيل الدفع أو الاسترجاع متاح للتسجيل المعتمد فقط');
        if (body.paymentStatus === 'REFUNDED' && current.paymentStatus !== 'PAID')
          throw httpError(409, 'لا يوجد دفع مسجل لاسترجاعه');
        if (body.paymentStatus === 'PAID' && current.paymentStatus === 'PAID')
          throw httpError(409, 'الدفع مسجل بالفعل');
        if (body.paymentStatus === 'WAIVED' && ['PAID', 'REFUNDED'].includes(current.paymentStatus))
          throw httpError(409, 'لا تستبدل سجل دفع بإعفاء؛ سجّل الاسترجاع الفعلي أولًا');
        if (!body.paymentReference) throw httpError(400, 'اكتب مرجع العملية أو سبب الإعفاء');
        data.paymentStatus = body.paymentStatus;
        data.paymentReference = body.paymentReference;
        data.paidAt = body.paymentStatus === 'PAID' ? new Date() : current.paidAt;
      } else {
        if (!open) throw httpError(409, 'الطلب مغلق؛ استخدم طلب انسحاب أو استرجاع للتسجيل المعتمد');
        if (body.action === 'APPROVE') {
          if (courseHasEnded(course)) throw httpError(409, 'انتهت الدورة');
          const existing = await tx.enrollment.findUnique({
            where: { courseId_studentId: { courseId: course.id, studentId: current.studentId } },
          });
          if (
            existing?.status !== 'ACTIVE' &&
            !(await availableSeat(tx, course.id, course.maxStudents))
          )
            throw httpError(409, 'اكتملت المقاعد. يبقى الطلب في الانتظار');
          if (
            current.quotedAmount > 0 &&
            (!['PAID', 'WAIVED'].includes(body.paymentStatus ?? '') || !body.paymentReference)
          )
            throw httpError(400, 'أكد الدفع الفعلي بمرجع أو سجّل سبب إعفاء معتمد');
          const enrollment = await tx.enrollment.upsert({
            where: { courseId_studentId: { courseId: course.id, studentId: current.studentId } },
            create: { courseId: course.id, studentId: current.studentId },
            update: {
              status: 'ACTIVE',
              ...(existing?.status !== 'ACTIVE' ? { enrolledAt: new Date() } : {}),
            },
          });
          await queueFamilyNotification(tx, 'ENROLLMENT', enrollment.id, current.studentId);
          data.status = 'APPROVED';
          data.paymentStatus = current.quotedAmount === 0 ? 'WAIVED' : body.paymentStatus;
          data.paymentReference = body.paymentReference;
          data.paidAt =
            current.quotedAmount > 0 && body.paymentStatus === 'PAID' ? new Date() : null;
        } else
          data.status =
            body.action === 'REJECT'
              ? 'REJECTED'
              : body.action === 'WAITLIST'
                ? 'WAITLIST'
                : 'CANCELLED';
      }
      const result = await tx.courseApplication.update({ where: { id: current.id }, data });
      await audit(tx, request.user.id, `APPLICATION_${body.action}`, current.id, {
        status: result.status,
        paymentStatus: result.paymentStatus,
        amount: current.quotedAmount,
        currency: current.currency,
        reference: body.paymentReference,
        response: body.response,
      });
      await notice(
        tx,
        current.parent.userId,
        `تحديث تسجيل ${course.title}`,
        `${result.status === 'APPROVED' ? 'تم تأكيد التسجيل' : result.status === 'WAITLIST' ? 'طلبك في قائمة الانتظار' : result.status === 'REJECTED' ? 'لم يعتمد طلب التسجيل' : 'تحديث على طلبك'}. ${body.response}`
      );
      return result;
    });
    return { data: updated };
  });
  app.post('/requests', async (request, reply) => {
    const body = z
      .object({
        studentId: z.string().min(1),
        courseId: z.string().min(1),
        sessionId: z.string().min(1).optional(),
        kind: z.enum(['ABSENCE', 'MAKEUP', 'WITHDRAWAL', 'REFUND', 'SUPPORT']),
        reason: text.refine((v) => v.length >= 3, 'اكتب سبب الطلب'),
      })
      .parse(request.body);
    const child = await childFor(request.user, body.studentId);
    const result = await prisma.$transaction(async (tx) => {
      await lockCourse(tx, body.courseId);
      const currentChild = await tx.studentProfile.findUniqueOrThrow({ where: { id: child.id } });
      if (currentChild.parentId !== child.parentId) throw httpError(409, 'تغير ربط الطالب');
      if (
        !(await tx.enrollment.findUnique({
          where: { courseId_studentId: { courseId: body.courseId, studentId: child.id } },
        }))
      )
        throw httpError(403, 'الطلب متاح لدورات الطفل فقط');
      const session = body.sessionId
        ? await tx.classSession.findFirst({
            where: { id: body.sessionId, courseId: body.courseId },
          })
        : null;
      if (body.sessionId && !session) throw httpError(400, 'الحصة لا تتبع الدورة');
      if (['ABSENCE', 'MAKEUP'].includes(body.kind) && !session) throw httpError(400, 'اختر الحصة');
      if (
        body.kind === 'ABSENCE' &&
        (session?.status !== 'SCHEDULED' || session.scheduledAt < new Date())
      )
        throw httpError(409, 'الإبلاغ عن الغياب للحصص القادمة فقط');
      const prior = await tx.academyServiceRequest.findFirst({
        where: {
          studentId: child.id,
          courseId: body.courseId,
          sessionId: body.sessionId ?? null,
          kind: body.kind,
          status: 'OPEN',
        },
      });
      if (prior) return prior;
      const item = await tx.academyServiceRequest.create({ data: body });
      await audit(tx, request.user.id, 'SERVICE_REQUEST_CREATED', item.id, { kind: item.kind });
      return item;
    });
    return reply.status(201).send({ data: result });
  });
  app.get('/requests', async (request) => {
    const parent = request.user.role === 'ADMIN' ? null : await parentFor(request.user);
    return {
      data: await prisma.academyServiceRequest.findMany({
        where: parent ? { student: { parentId: parent.id } } : {},
        include: {
          student: { select: { user: { select: { name: true } } } },
          course: { select: { title: true } },
          session: { select: { title: true, scheduledAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  });
  app.patch<{ Params: { id: string } }>('/requests/:id', async (request) => {
    requireAdmin(request.user);
    const body = z
      .object({
        version: z.number().int().positive(),
        status: z.enum(['RESOLVED', 'DECLINED']),
        response: text.refine((v) => v.length >= 3, 'اكتب الرد للأسرة'),
      })
      .parse(request.body);
    const found = await prisma.academyServiceRequest.findUnique({
      where: { id: request.params.id },
    });
    if (!found) throw httpError(404, 'الطلب غير موجود');
    return {
      data: await prisma.$transaction(async (tx) => {
        await lockCourse(tx, found.courseId);
        const current = await tx.academyServiceRequest.findUniqueOrThrow({
          where: { id: found.id },
          include: { student: { select: { parent: { select: { userId: true } } } } },
        });
        if (current.version !== body.version || current.status !== 'OPEN')
          throw httpError(409, 'تم تحديث الطلب بالفعل');
        if (body.status === 'RESOLVED' && current.kind === 'WITHDRAWAL')
          await tx.enrollment.updateMany({
            where: { studentId: current.studentId, courseId: current.courseId, status: 'ACTIVE' },
            data: { status: 'CANCELLED' },
          });
        // A refund request response never claims a bank refund occurred.
        const result = await tx.academyServiceRequest.update({
          where: { id: current.id },
          data: { ...body, version: { increment: 1 } },
        });
        await audit(tx, request.user.id, 'SERVICE_REQUEST_UPDATED', current.id, {
          kind: current.kind,
          ...body,
        });
        if (current.student.parent)
          await notice(tx, current.student.parent.userId, 'رد الإدارة على طلبك', body.response);
        return result;
      }),
    };
  });
  app.get('/notices', async (request) => ({
    data: await prisma.academyNotice.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  }));
  app.patch<{ Params: { id: string } }>('/notices/:id/read', async (request) => {
    const changed = await prisma.academyNotice.updateMany({
      where: { id: request.params.id, userId: request.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { data: { updated: changed.count } };
  });
  app.get('/audit', async (request) => {
    requireAdmin(request.user);
    return {
      data: await prisma.auditEvent.findMany({
        include: { actor: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    };
  });
  app.get('/operations', async (request) => {
    requireAdmin(request.user);
    const [pending, requests, sessions] = await Promise.all([
      prisma.courseApplication.count({ where: { status: { in: ['PENDING', 'WAITLIST'] } } }),
      prisma.academyServiceRequest.count({ where: { status: 'OPEN' } }),
      prisma.classSession.findMany({
        where: { status: 'COMPLETED', scheduledAt: { gte: new Date(Date.now() - 31 * 86400000) } },
        include: {
          course: {
            select: {
              title: true,
              enrollments: {
                where: { status: 'ACTIVE' },
                select: { studentId: true, enrolledAt: true },
              },
            },
          },
          attendance: { select: { studentId: true } },
          reports: { select: { studentId: true, publishedAt: true } },
          homework: { select: { submissions: { select: { publishedAt: true } } } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      data: {
        pending,
        requests,
        sessions: sessions.map((s) => {
          const roster = new Set([
            ...s.course.enrollments
              .filter((e) => e.enrolledAt <= s.scheduledAt)
              .map((e) => e.studentId),
            ...s.attendance.map((a) => a.studentId),
            ...s.reports.map((r) => r.studentId),
          ]);
          return {
            id: s.id,
            title: s.title,
            courseTitle: s.course.title,
            missingReports: [...roster].filter(
              (id) => !s.reports.some((r) => r.studentId === id && r.publishedAt)
            ).length,
            pendingHomework: s.homework?.submissions.filter((x) => !x.publishedAt).length ?? 0,
            absent: [...roster].filter((id) => !s.attendance.some((a) => a.studentId === id))
              .length,
          };
        }),
      },
    };
  });
}
