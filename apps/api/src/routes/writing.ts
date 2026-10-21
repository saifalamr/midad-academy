import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError, type Actor } from '../lib/access';
import { lockCourse } from '../lib/enrollment';
import { audit } from '../lib/academy-operations';
import { eligible } from './homework';
import { assessWriting, strokesSchema, type Strokes } from '../lib/writing';

const word = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^[\u0621-\u063A\u0641-\u0652\u0670-\u06D3\u06FA-\u06FC\u0750-\u077F\u08A0-\u08FF\s]+$/,
    'اكتب حروفًا عربية ومسافات وتشكيلًا فقط'
  );
const templateSchema = z
  .object({
    word,
    fontSize: z.number().int().min(32).max(180),
    mode: z.enum(['SIMPLE', 'GUIDED']),
    guides: strokesSchema,
    pathsReviewed: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'GUIDED' && (!v.guides.length || !v.pathsReviewed))
      ctx.addIssue({
        code: 'custom',
        message: 'ارسم المسارات بالترتيب وجرّبها ثم أكد مراجعتها قبل تفعيل المساعدة الآلية',
      });
    // Simple tracing must never silently acquire an automatic assessment.
    if (v.mode === 'SIMPLE' && v.guides.length)
      ctx.addIssue({
        code: 'custom',
        message: 'اختر وضع المسارات المجهزة أو امسح المسارات للتتبّع البسيط',
      });
  });
type DB = Prisma.TransactionClient | typeof prisma;
async function writingEligible(
  db: DB,
  studentId: string,
  session: { id: string; courseId: string; scheduledAt: Date }
) {
  return (
    (await eligible(db, studentId, session)) ||
    !!(await db.writingAttempt.findFirst({
      where: { studentId, task: { sessionId: session.id } },
      select: { id: true },
    }))
  );
}
async function sessionFor(db: DB, actor: Actor, id: string, writing = false) {
  const session = await db.classSession.findUnique({
    where: { id },
    include: { teacher: { select: { userId: true } }, course: { select: { title: true } } },
  });
  if (!session) throw httpError(404, 'الحصة غير موجودة');
  const staff =
    actor.role === 'ADMIN' || (actor.role === 'TEACHER' && session.teacher.userId === actor.id);
  if (writing && !staff) throw httpError(404, 'إعداد التمرين للمعلم المسؤول والإدارة فقط');
  if (!staff) {
    if (!['STUDENT', 'PARENT'].includes(actor.role)) throw httpError(404, 'الحصة غير موجودة');
    const students = await db.studentProfile.findMany({
      where: actor.role === 'PARENT' ? { parent: { userId: actor.id } } : { userId: actor.id },
      select: { id: true },
    });
    let allowed = false;
    for (const s of students)
      if (await writingEligible(db, s.id, session)) {
        allowed = true;
        break;
      }
    if (!allowed) throw httpError(404, 'الحصة لا تتبع حسابك');
  }
  return { session, staff };
}
async function taskFor(db: DB, actor: Actor, id: string, writing = false) {
  const task = await db.writingTask.findUnique({ where: { id }, include: { session: true } });
  if (!task) throw httpError(404, 'التمرين غير موجود');
  const access = await sessionFor(db, actor, task.sessionId, writing);
  if (
    !access.staff &&
    (access.session.status === 'SCHEDULED' ||
      access.session.status === 'CANCELLED' ||
      (task.useAs === 'HOMEWORK' && access.session.status !== 'COMPLETED'))
  )
    throw httpError(404, 'التمرين غير متاح بعد؛ راجع صفحة الحصة');
  return { task, ...access };
}
async function studentCanSubmit(db: DB, actor: Actor, taskId: string) {
  if (actor.role !== 'STUDENT') throw httpError(403, 'الطالب وحده يسلّم محاولته');
  const access = await taskFor(db, actor, taskId);
  const student = await db.studentProfile.findUniqueOrThrow({ where: { userId: actor.id } });
  if (
    !(await db.enrollment.findFirst({
      where: { studentId: student.id, courseId: access.session.courseId, status: 'ACTIVE' },
    }))
  )
    throw httpError(403, 'التسليم يحتاج تسجيلًا فعالًا في الدورة؛ تبقى المحاولات السابقة محفوظة');
  return { ...access, student };
}
export async function writingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.get<{ Params: { courseId: string } }>('/live/:courseId', async (request) => {
    const session = await prisma.classSession.findFirst({
      where: { courseId: request.params.courseId, status: 'LIVE' },
      select: { id: true },
    });
    if (!session) throw httpError(404, 'لا توجد حصة مباشرة');
    await sessionFor(prisma, request.user, session.id);
    return { data: { sessionId: session.id } };
  });
  app.get('/library', async (request) => {
    if (!['TEACHER', 'ADMIN'].includes(request.user.role))
      throw httpError(403, 'المكتبة للمعلم والإدارة');
    return {
      data: await prisma.writingTemplate.findMany({
        where: { authorId: request.user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });
  app.post('/library', async (request) => {
    if (!['TEACHER', 'ADMIN'].includes(request.user.role))
      throw httpError(403, 'إنشاء النماذج للمعلم والإدارة');
    const body = templateSchema.parse(request.body);
    return {
      data: await prisma.writingTemplate.create({
        data: {
          authorId: request.user.id,
          word: body.word,
          fontSize: body.fontSize,
          mode: body.mode,
          guides: body.guides,
        },
      }),
    };
  });
  app.post('/preview', async (request) => {
    if (!['TEACHER', 'ADMIN'].includes(request.user.role))
      throw httpError(403, 'المعاينة للمعلم والإدارة');
    const body = z
      .object({ guides: strokesSchema.refine((s) => !!s.length), strokes: strokesSchema })
      .parse(request.body);
    return { data: assessWriting(body.guides, body.strokes) };
  });
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request) => {
    const { session, staff } = await sessionFor(prisma, request.user, request.params.id);
    const available = staff || ['LIVE', 'COMPLETED'].includes(session.status);
    return {
      data: {
        session: {
          id: session.id,
          title: session.title,
          status: session.status,
          courseTitle: session.course.title,
        },
        staff,
        tasks: available
          ? await prisma.writingTask.findMany({
              where: {
                sessionId: session.id,
                ...(!staff && session.status !== 'COMPLETED' ? { useAs: 'ACTIVITY' } : {}),
              },
              select: { id: true, title: true, word: true, mode: true, useAs: true },
              orderBy: { createdAt: 'asc' },
            })
          : [],
      },
    };
  });
  app.post<{ Params: { id: string } }>('/sessions/:id', async (request, reply) => {
    const body = z
      .object({
        templateId: z.string().uuid(),
        useAs: z.enum(['ACTIVITY', 'HOMEWORK']),
        title: z.string().trim().min(1).max(100),
      })
      .parse(request.body);
    const initial = await sessionFor(prisma, request.user, request.params.id, true);
    const result = await prisma.$transaction(async (tx) => {
      await lockCourse(tx, initial.session.courseId);
      const { session } = await sessionFor(tx, request.user, request.params.id, true);
      if (session.status === 'CANCELLED') throw httpError(409, 'لا تضف تمرينًا لحصة ملغاة');
      const template = await tx.writingTemplate.findFirst({
        where: { id: body.templateId, authorId: request.user.id },
      });
      if (!template) throw httpError(404, 'اختر كلمة من مكتبتك');
      if ((await tx.writingTask.count({ where: { sessionId: session.id } })) >= 20)
        throw httpError(409, 'الحد الأقصى 20 تمرينًا للحصة');
      const existing = await tx.writingTask.findFirst({
        where: {
          sessionId: session.id,
          word: template.word,
          mode: template.mode,
          useAs: body.useAs,
          title: body.title,
          guides: { equals: template.guides as Prisma.InputJsonValue },
        },
      });
      if (existing) return existing;
      const task = await tx.writingTask.create({
        data: {
          sessionId: session.id,
          title: body.title,
          word: template.word,
          fontSize: template.fontSize,
          mode: template.mode,
          guides: template.guides as Prisma.InputJsonValue,
          useAs: body.useAs,
        },
      });
      await audit(tx, request.user.id, 'WRITING_ASSIGNED', task.id, {
        sessionId: session.id,
        useAs: body.useAs,
        word: template.word,
      });
      return task;
    });
    return reply.status(201).send({ data: result });
  });
  app.delete<{ Params: { id: string } }>('/tasks/:id', async (request) => {
    const initial = await taskFor(prisma, request.user, request.params.id, true);
    await prisma.$transaction(async (tx) => {
      await lockCourse(tx, initial.session.courseId);
      const { task } = await taskFor(tx, request.user, request.params.id, true);
      if (await tx.writingAttempt.count({ where: { taskId: task.id } }))
        throw httpError(409, 'بدأ الطلاب التسليم؛ يبقى التمرين محفوظًا');
      await tx.writingTask.delete({ where: { id: task.id } });
      await audit(tx, request.user.id, 'WRITING_UNASSIGNED', task.id, {
        sessionId: task.sessionId,
      });
    });
    return { data: { removed: true } };
  });
  app.get('/homework', async (request) => {
    const actor = request.user;
    const family =
      actor.role === 'PARENT' ? { parent: { userId: actor.id } } : { userId: actor.id };
    const familyStudents = ['STUDENT', 'PARENT'].includes(actor.role)
      ? await prisma.studentProfile.findMany({
          where: family,
          select: { id: true, user: { select: { name: true } } },
        })
      : [];
    const tasks = await prisma.writingTask.findMany({
      where:
        actor.role === 'ADMIN'
          ? { useAs: 'HOMEWORK' }
          : actor.role === 'TEACHER'
            ? { useAs: 'HOMEWORK', session: { teacher: { userId: actor.id } } }
            : {
                useAs: 'HOMEWORK',
                session: {
                  status: 'COMPLETED',
                  OR: [
                    { course: { enrollments: { some: { student: family } } } },
                    { writingTasks: { some: { attempts: { some: { student: family } } } } },
                    { attendance: { some: { student: family } } },
                    { reports: { some: { student: family } } },
                  ],
                },
              },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            courseId: true,
            scheduledAt: true,
            course: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const out: {
      id: string;
      title: string;
      word: string;
      courseTitle: string;
      studentName: string | null;
      submitted: Date | null;
      verdict: string | null;
    }[] = [];
    const staff = actor.role === 'ADMIN' || actor.role === 'TEACHER';
    for (const task of tasks) {
      if (staff) {
        out.push({
          id: task.id,
          title: task.title,
          word: task.word,
          courseTitle: task.session.course.title,
          studentName: null,
          submitted: null,
          verdict: null,
        });
        continue;
      }
      for (const s of familyStudents)
        if (await writingEligible(prisma, s.id, task.session)) {
          const attempt = await prisma.writingAttempt.findUnique({
            where: { taskId_studentId: { taskId: task.id, studentId: s.id } },
            select: { submittedAt: true, verdict: true },
          });
          out.push({
            id: task.id,
            title: task.title,
            word: task.word,
            courseTitle: task.session.course.title,
            studentName: s.user.name,
            submitted: attempt?.submittedAt ?? null,
            verdict: attempt?.verdict ?? null,
          });
        }
    }
    return { data: out };
  });
  app.get<{ Params: { id: string } }>('/tasks/:id', async (request) => {
    const { task, session, staff } = await taskFor(prisma, request.user, request.params.id);
    const attempts = await prisma.writingAttempt.findMany({
      where: {
        taskId: task.id,
        ...(!staff
          ? {
              student:
                request.user.role === 'PARENT'
                  ? { parent: { userId: request.user.id } }
                  : { userId: request.user.id },
            }
          : {}),
      },
      include: { student: { select: { user: { select: { name: true } } } } },
      orderBy: { submittedAt: 'asc' },
    });
    let canSubmit = false;
    if (request.user.role === 'STUDENT') {
      canSubmit = !!(await prisma.enrollment.findFirst({
        where: {
          courseId: session.courseId,
          status: 'ACTIVE',
          student: { userId: request.user.id },
        },
      }));
    }
    const { session: ignored, ...safe } = task;
    void ignored;
    return { data: { task: safe, staff, canSubmit, attempts, sessionTitle: session.title } };
  });
  app.post<{ Params: { id: string } }>('/tasks/:id/check', async (request) => {
    const { task } = await studentCanSubmit(prisma, request.user, request.params.id);
    const body = z.object({ strokes: strokesSchema }).parse(request.body);
    if (task.mode !== 'GUIDED') throw httpError(400, 'هذا تمرين بمراجعة المعلم فقط');
    return { data: assessWriting(task.guides as Strokes, body.strokes) };
  });
  app.post<{ Params: { id: string } }>('/tasks/:id/submit', async (request) => {
    const body = z
      .object({ strokes: strokesSchema.refine((s) => !!s.length, 'اكتب محاولة قبل التسليم') })
      .parse(request.body);
    const initial = await studentCanSubmit(prisma, request.user, request.params.id);
    const attempt = await prisma.$transaction(async (tx) => {
      await lockCourse(tx, initial.session.courseId);
      const { task, student } = await studentCanSubmit(tx, request.user, request.params.id);
      const previous = await tx.writingAttempt.findUnique({
        where: { taskId_studentId: { taskId: task.id, studentId: student.id } },
      });
      if (previous) return previous; // Lost-response retry returns the exact saved submission.
      const result = await tx.writingAttempt.create({
        data: {
          taskId: task.id,
          studentId: student.id,
          strokes: body.strokes,
          ...(task.mode === 'GUIDED'
            ? { guidance: assessWriting(task.guides as Strokes, body.strokes) }
            : {}),
        },
      });
      await audit(tx, request.user.id, 'WRITING_SUBMITTED', result.id, { taskId: task.id });
      return result;
    });
    return { data: attempt };
  });
  app.patch<{ Params: { id: string } }>('/attempts/:id/review', async (request) => {
    const body = z
      .object({
        version: z.number().int().positive(),
        verdict: z.enum(['ACHIEVED', 'PRACTICE']),
        feedback: z.string().trim().min(2).max(1000),
      })
      .parse(request.body);
    const initial = await prisma.writingAttempt.findUnique({
      where: { id: request.params.id },
      include: { task: { include: { session: true } } },
    });
    if (!initial) throw httpError(404, 'المحاولة غير موجودة');
    const result = await prisma.$transaction(async (tx) => {
      await lockCourse(tx, initial.task.session.courseId);
      await sessionFor(tx, request.user, initial.task.sessionId, true);
      const changed = await tx.writingAttempt.updateMany({
        where: { id: initial.id, version: body.version },
        data: {
          verdict: body.verdict,
          feedback: body.feedback,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw httpError(409, 'التقييم تغير في صفحة أخرى؛ حدّث المحاولة');
      await audit(tx, request.user.id, 'WRITING_REVIEWED', initial.id, { verdict: body.verdict });
      return tx.writingAttempt.findUniqueOrThrow({ where: { id: initial.id } });
    });
    return { data: result };
  });
}
