import type { FastifyInstance } from 'fastify';
import type { Prisma, HomeworkSubmission } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { lockCourse } from '../lib/enrollment';

const questionDefinition = z
  .object({
    id: z.string().uuid(),
    text: z.string().trim().min(2).max(2000),
    type: z.enum(['MCQ', 'TRUE_FALSE', 'MATCHING']),
    points: z.number().int().min(1).max(100),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(8).optional(),
    correctAnswer: z.string().trim().max(300).optional(),
    pairs: z
      .array(
        z.object({
          left: z.string().trim().min(1).max(300),
          right: z.string().trim().min(1).max(300),
        })
      )
      .min(2)
      .max(8)
      .optional(),
  })
  .superRefine((q, ctx) => {
    let valid = false;
    if (q.type === 'MATCHING')
      valid =
        !!q.pairs &&
        new Set(q.pairs.map((p) => p.left)).size === q.pairs.length &&
        new Set(q.pairs.map((p) => p.right)).size === q.pairs.length;
    else if (q.type === 'TRUE_FALSE') valid = ['true', 'false'].includes(q.correctAnswer ?? '');
    else
      valid =
        !!q.options &&
        new Set(q.options).size === q.options.length &&
        q.options.includes(q.correctAnswer ?? '');
    if (!valid)
      ctx.addIssue({
        code: 'custom',
        message: 'راجع الخيارات والإجابة الصحيحة؛ عناصر التوصيل والخيارات يجب أن تكون مختلفة',
      });
  });
// A question type validates only its own fields, even when an editor switches types.
const question = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = { ...(value as Record<string, unknown>) };
  if (input.type !== 'MCQ') delete input.options;
  if (input.type !== 'MATCHING') delete input.pairs;
  else delete input.correctAnswer;
  return input;
}, questionDefinition);
const definition = z.object({
  title: z.string().trim().min(2).max(200),
  version: z.number().int().min(0),
  questions: z
    .array(question)
    .min(1)
    .max(30)
    .refine((q) => new Set(q.map((v) => v.id)).size === q.length, 'لا تكرر معرف السؤال'),
});
type Question = z.infer<typeof question>;
type Answers = Record<string, string | string[]>;
function questionsForStudent(questions: Question[]) {
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    points: q.points,
    ...(q.type === 'MATCHING'
      ? { left: q.pairs!.map((p) => p.left), options: q.pairs!.map((p) => p.right).sort() }
      : { options: q.type === 'TRUE_FALSE' ? ['true', 'false'] : q.options }),
  }));
}
function score(questions: Question[], answers: Answers) {
  if (
    Object.keys(answers).length !== questions.length ||
    Object.keys(answers).some((id) => !questions.some((q) => q.id === id))
  )
    throw httpError(400, 'أجب عن أسئلة هذا الواجب فقط، وعنها كلها');
  return Object.fromEntries(
    questions.map((q) => {
      const value = answers[q.id];
      let correct = false;
      if (q.type === 'MATCHING') {
        if (
          !Array.isArray(value) ||
          value.length !== q.pairs!.length ||
          new Set(value).size !== value.length ||
          value.some((v) => !q.pairs!.some((p) => p.right === v))
        )
          throw httpError(400, 'صل كل عنصر بإجابة مختلفة من القائمة');
        correct = q.pairs!.every((p, i) => p.right === value[i]);
      } else {
        const options = q.type === 'TRUE_FALSE' ? ['true', 'false'] : q.options!;
        if (typeof value !== 'string' || !options.includes(value))
          throw httpError(400, 'اختر إجابة صحيحة من الخيارات');
        correct = value === q.correctAnswer;
      }
      return [q.id, correct ? q.points : 0];
    })
  );
}
async function eligible(
  tx: Prisma.TransactionClient | typeof prisma,
  studentId: string,
  session: { id: string; courseId: string; scheduledAt: Date }
) {
  return (
    !!(await tx.sessionReport.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId } },
      select: { id: true },
    })) ||
    !!(await tx.sessionAttendance.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId } },
      select: { id: true },
    })) ||
    !!(await tx.enrollment.findFirst({
      where: {
        studentId,
        courseId: session.courseId,
        status: 'ACTIVE',
        enrolledAt: { lte: session.scheduledAt },
      },
      select: { id: true },
    }))
  );
}
function publicSubmission(s: HomeworkSubmission | null) {
  if (!s) return null;
  return {
    id: s.id,
    studentId: s.studentId,
    submittedAt: s.submittedAt,
    publishedAt: s.publishedAt,
    answers: s.answers,
    ...(s.publishedAt ? { grades: s.grades, feedback: s.feedback } : {}),
  };
}
const include = { homework: true, course: { select: { title: true, timeZone: true } } } as const;
export async function homeworkRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  app.get('/', async (request) => {
    const actor = request.user;
    if (actor.role === 'ADMIN') throw httpError(403, 'افتح واجب الحصة من صفحة الإدارة');
    if (actor.role === 'PARENT') {
      const children = await prisma.studentProfile.findMany({
        where: { parent: { userId: actor.id } },
        select: { id: true, user: { select: { name: true } } },
      });
      const childIds = children.map((child) => child.id);
      const sessions = await prisma.classSession.findMany({
        where: {
          status: 'COMPLETED',
          homework: { isNot: null },
          OR: [
            { reports: { some: { studentId: { in: childIds } } } },
            { attendance: { some: { studentId: { in: childIds } } } },
            {
              course: { enrollments: { some: { studentId: { in: childIds }, status: 'ACTIVE' } } },
            },
          ],
        },
        include: {
          ...include,
          reports: { where: { studentId: { in: childIds } }, select: { studentId: true } },
          attendance: { where: { studentId: { in: childIds } }, select: { studentId: true } },
          course: {
            select: {
              title: true,
              enrollments: {
                where: { studentId: { in: childIds }, status: 'ACTIVE' },
                select: { studentId: true, enrolledAt: true },
              },
            },
          },
          homework: { include: { submissions: { where: { studentId: { in: childIds } } } } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 100,
      });
      return {
        data: sessions.flatMap((session) =>
          children.flatMap((child) => {
            const eligibleChild =
              session.reports.some((r) => r.studentId === child.id) ||
              session.attendance.some((a) => a.studentId === child.id) ||
              session.course.enrollments.some(
                (e) => e.studentId === child.id && e.enrolledAt <= session.scheduledAt
              );
            if (!eligibleChild) return [];
            const submission =
              session.homework!.submissions.find((s) => s.studentId === child.id) ?? null;
            return [
              {
                ...publicSubmission(submission),
                id: submission?.id ?? `${session.id}:${child.id}`,
                title: session.homework!.title,
                sessionTitle: session.title,
                courseTitle: session.course.title,
                studentName: child.user.name,
                status: !submission
                  ? 'NOT_SUBMITTED'
                  : submission.publishedAt
                    ? 'GRADED'
                    : 'PENDING',
                maxPoints: (session.homework!.questions as Question[]).reduce(
                  (sum, q) => sum + q.points,
                  0
                ),
              },
            ];
          })
        ),
      };
    }
    const sessions = await prisma.classSession.findMany({
      where: {
        status: 'COMPLETED',
        homework: { isNot: null },
        ...(actor.role === 'TEACHER'
          ? { teacher: { userId: actor.id } }
          : {
              OR: [
                { reports: { some: { student: { userId: actor.id } } } },
                { attendance: { some: { student: { userId: actor.id } } } },
                {
                  course: {
                    enrollments: { some: { student: { userId: actor.id }, status: 'ACTIVE' } },
                  },
                },
              ],
            }),
      },
      include,
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
    const student =
      actor.role === 'STUDENT'
        ? await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actor.id } })
        : null;
    const data: {
      id: string;
      title: string;
      sessionTitle: string;
      courseTitle: string;
      scheduledAt: Date;
      submissions: number;
      pending: number;
      status: string;
    }[] = [];
    for (const session of sessions) {
      if (student && !(await eligible(prisma, student.id, session))) continue;
      const submissions = await prisma.homeworkSubmission.findMany({
        where: { sessionId: session.id, ...(student ? { studentId: student.id } : {}) },
        select: { id: true, publishedAt: true },
      });
      data.push({
        id: session.id,
        title: session.homework!.title,
        sessionTitle: session.title,
        courseTitle: session.course.title,
        scheduledAt: session.scheduledAt,
        submissions: submissions.length,
        pending: submissions.filter((s) => !s.publishedAt).length,
        status: !submissions.length
          ? 'NOT_SUBMITTED'
          : submissions.every((s) => s.publishedAt)
            ? 'GRADED'
            : 'PENDING',
      });
    }
    return { data };
  });
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const actor = request.user;
    const session = await prisma.classSession.findUnique({
      where: { id: request.params.id },
      include,
    });
    if (!session) throw httpError(404, 'الحصة غير موجودة');
    const hw = session.homework;
    if (actor.role === 'ADMIN') return { data: { session, homework: hw } };
    if (actor.role === 'TEACHER') {
      if (
        !(await prisma.teacherProfile.findFirst({
          where: { id: session.teacherId, userId: actor.id },
        }))
      )
        throw httpError(404, 'الحصة غير موجودة');
      const submissions = await prisma.homeworkSubmission.findMany({
        where: { sessionId: session.id },
        include: { student: { select: { user: { select: { name: true } } } } },
        orderBy: { submittedAt: 'asc' },
      });
      return {
        data: {
          session,
          homework: hw,
          submissions: submissions.map(({ student, ...s }) => ({
            ...s,
            studentName: student.user.name,
          })),
        },
      };
    }
    if (actor.role !== 'STUDENT') throw httpError(403, 'هذه الصفحة لحل الطالب وتصحيح المعلم');
    const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actor.id } });
    if (!(await eligible(prisma, student.id, session)))
      throw httpError(403, 'هذا الواجب ليس من حصصك');
    if (session.status !== 'COMPLETED')
      throw httpError(409, 'الواجب يفتح بعد انتهاء الحصة. أعد المحاولة بعد قليل');
    if (!hw) throw httpError(404, 'الإدارة لم تخصص واجبًا لهذه الحصة');
    const submission = await prisma.homeworkSubmission.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
    });
    // Never expose session.homework or correct answers to students.
    return {
      data: {
        session: { id: session.id, title: session.title, course: session.course },
        homework: {
          title: hw.title,
          version: hw.version,
          questions: questionsForStudent(hw.questions as Question[]),
        },
        submission: publicSubmission(submission),
      },
    };
  });
  app.put<{ Params: { id: string } }>('/:id', async (request) => {
    if (request.user.role !== 'ADMIN') throw httpError(403, 'إعداد الواجب من صلاحيات الإدارة فقط');
    const body = definition.parse(request.body);
    const original = await prisma.classSession.findUnique({ where: { id: request.params.id } });
    if (!original) throw httpError(404, 'الحصة غير موجودة');
    const hw = await prisma.$transaction(async (tx) => {
      await lockCourse(tx, original.courseId);
      const session = await tx.classSession.findUniqueOrThrow({
        where: { id: original.id },
        include: { homework: true },
      });
      if (session.status !== 'SCHEDULED')
        throw httpError(409, 'جهز الواجب قبل بداية الحصة؛ بعدها يُحفظ في السجل');
      if ((session.homework?.version ?? 0) !== body.version)
        throw httpError(409, 'الواجب تغير في صفحة أخرى. أعد تحميله');
      return tx.sessionHomework.upsert({
        where: { sessionId: session.id },
        create: { sessionId: session.id, title: body.title, questions: body.questions },
        update: { title: body.title, questions: body.questions, version: { increment: 1 } },
      });
    });
    return { data: hw };
  });
  app.post<{ Params: { id: string } }>('/:id/submit', async (request) => {
    if (request.user.role !== 'STUDENT') throw httpError(403, 'التسليم من حساب الطالب فقط');
    const body = z
      .object({
        version: z.number().int().min(1),
        answers: z
          .record(z.string(), z.union([z.string().max(300), z.array(z.string().max(300)).max(8)]))
          .refine((v) => Object.keys(v).length <= 30),
      })
      .parse(request.body);
    const student = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: request.user.id },
    });
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "sessionId" FROM "SessionHomework" WHERE "sessionId" = ${request.params.id} FOR UPDATE`;
      const session = await tx.classSession.findUnique({
        where: { id: request.params.id },
        include: { homework: true },
      });
      if (!session?.homework || session.status !== 'COMPLETED')
        throw httpError(409, 'الواجب متاح بعد انتهاء الحصة فقط');
      if (!(await eligible(tx, student.id, session)))
        throw httpError(403, 'هذا الواجب ليس من حصصك');
      if (body.version !== session.homework.version)
        throw httpError(409, 'حدّث الواجب قبل التسليم');
      const grades = score(session.homework.questions as Question[], body.answers);
      const existing = await tx.homeworkSubmission.findUnique({
        where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
      });
      if (existing) {
        const old = existing.answers as Answers;
        if (
          Object.keys(old).some(
            (id) => JSON.stringify(old[id]) !== JSON.stringify(body.answers[id])
          )
        )
          throw httpError(409, 'سبق تسليم هذا الواجب. إجاباتك محفوظة ولا يمكن تغييرها');
        return existing;
      }
      return tx.homeworkSubmission.create({
        data: { sessionId: session.id, studentId: student.id, answers: body.answers, grades },
      });
    });
    return { data: publicSubmission(result) };
  });
  app.put<{ Params: { id: string } }>('/submissions/:id/grade', async (request) => {
    if (request.user.role !== 'TEACHER') throw httpError(403, 'تصحيح الواجب من حساب المعلم فقط');
    const body = z
      .object({
        version: z.number().int().min(1),
        grades: z.record(z.string(), z.number().int().min(0).max(100)),
        feedback: z.string().trim().max(3000),
        publish: z.boolean(),
      })
      .parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "HomeworkSubmission" WHERE id = ${request.params.id} FOR UPDATE`;
      const submission = await tx.homeworkSubmission.findUnique({
        where: { id: request.params.id },
        include: { homework: { include: { session: { include: { teacher: true } } } } },
      });
      if (!submission || submission.homework.session.teacher.userId !== request.user.id)
        throw httpError(404, 'التسليم غير موجود');
      if (submission.publishedAt || submission.version !== body.version)
        throw httpError(409, 'التصحيح تغير أو اعتمد بالفعل. حدّث الصفحة');
      const questions = submission.homework.questions as Question[];
      if (
        Object.keys(body.grades).length !== questions.length ||
        questions.some((q) => body.grades[q.id] === undefined || body.grades[q.id] > q.points) ||
        Object.keys(body.grades).some((id) => !questions.some((q) => q.id === id))
      )
        throw httpError(400, 'راجع درجات جميع الأسئلة وحدودها');
      return tx.homeworkSubmission.update({
        where: { id: submission.id },
        data: {
          grades: body.grades,
          feedback: body.feedback,
          version: { increment: 1 },
          ...(body.publish ? { publishedAt: new Date() } : {}),
        },
      });
    });
    return { data: result };
  });
}
