import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError, type Actor } from '../lib/access';
import { audit, notifyCourse, requireAdmin } from '../lib/academy-operations';
import { lockCourse } from '../lib/enrollment';

async function courseAccess(actor: Actor, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { teacher: { select: { userId: true } } },
  });
  if (!course) throw httpError(404, 'الدورة غير موجودة');
  if (actor.role === 'ADMIN' || (actor.role === 'TEACHER' && course.teacher.userId === actor.id))
    return course;
  const allowed =
    actor.role === 'PARENT' || actor.role === 'STUDENT'
      ? await prisma.enrollment.findFirst({
          where: {
            courseId,
            student:
              actor.role === 'PARENT' ? { parent: { userId: actor.id } } : { userId: actor.id },
          },
        })
      : null;
  if (!allowed) throw httpError(404, 'الدورة غير موجودة في حسابك');
  return course;
}
export async function academySessionRoutes(app: FastifyInstance) {
  app.get('/schedule', async (request) => {
    const actor = request.user;
    return {
      data: await prisma.classSession.findMany({
        where:
          actor.role === 'ADMIN'
            ? {}
            : actor.role === 'TEACHER'
              ? { teacher: { userId: actor.id } }
              : {
                  course: {
                    enrollments: {
                      some: {
                        student:
                          actor.role === 'PARENT'
                            ? { parent: { userId: actor.id } }
                            : { userId: actor.id },
                      },
                    },
                  },
                },
        select: {
          id: true,
          title: true,
          scheduledAt: true,
          durationMinutes: true,
          status: true,
          changeReason: true,
          makeupForId: true,
          course: { select: { id: true, title: true, month: true, timeZone: true } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 150,
      }),
    };
  });
  app.get<{ Params: { id: string } }>('/sessions/:id', async (request) => {
    const actor = request.user;
    const session = await prisma.classSession.findUnique({
      where: { id: request.params.id },
      include: {
        course: { select: { id: true, title: true, timeZone: true, month: true } },
        teacher: { select: { user: { select: { name: true, id: true } } } },
        makeups: { select: { id: true, scheduledAt: true, status: true } },
        materials: { select: { title: true, type: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!session) throw httpError(404, 'الحصة غير موجودة');
    const staff =
      actor.role === 'ADMIN' || (actor.role === 'TEACHER' && session.teacher.user.id === actor.id);
    if (!staff) {
      if (!['PARENT', 'STUDENT'].includes(actor.role)) throw httpError(403, 'لا تملك صلاحية الحصة');
      await courseAccess(actor, session.courseId);
    }
    const students = await prisma.studentProfile.findMany({
      where: {
        ...(staff
          ? {}
          : actor.role === 'PARENT'
            ? { parent: { userId: actor.id } }
            : { userId: actor.id }),
        OR: [
          {
            enrollments: {
              some: { courseId: session.courseId, enrolledAt: { lte: session.scheduledAt } },
            },
          },
          { attendance: { some: { sessionId: session.id } } },
        ],
      },
      select: {
        id: true,
        user: { select: { name: true } },
        enrollments: { where: { courseId: session.courseId }, select: { status: true } },
      },
    });
    if (!staff && !students.length) throw httpError(404, 'الحصة لا تتبع سجل الطالب');
    const ids = students.map((s) => s.id);
    const [reports, homework, attendance, applications, receipts] = await Promise.all([
      prisma.sessionReport.findMany({
        where: {
          sessionId: session.id,
          studentId: { in: ids },
          ...(!staff ? { publishedAt: { not: null } } : {}),
        },
        select: {
          studentId: true,
          performance: true,
          participationCount: true,
          homework: true,
          note: true,
          publishedAt: true,
        },
      }),
      prisma.sessionHomework.findUnique({
        where: { sessionId: session.id },
        select: {
          title: true,
          submissions: {
            where: { studentId: { in: ids } },
            select: { studentId: true, submittedAt: true, publishedAt: true },
          },
        },
      }),
      prisma.sessionAttendance.findMany({
        where: { sessionId: session.id, studentId: { in: ids } },
        select: { studentId: true },
      }),
      actor.role === 'TEACHER' || actor.role === 'ADMIN'
        ? prisma.courseApplication.findMany({
            where: { courseId: session.courseId, studentId: { in: ids }, needsAssessment: true },
            select: { studentId: true, levelNotes: true },
          })
        : Promise.resolve([] as { studentId: string; levelNotes: string }[]),
      actor.role === 'ADMIN'
        ? prisma.academyNotice.findMany({
            where: { href: `/sessions/${session.id}` },
            select: {
              id: true,
              title: true,
              createdAt: true,
              readAt: true,
              user: { select: { name: true, role: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    const active = students.some((s) => s.enrollments.some((e) => e.status === 'ACTIVE'));
    return {
      data: {
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduledAt,
        durationMinutes: session.durationMinutes,
        status: session.status,
        changeReason: session.changeReason,
        makeupForId: session.makeupForId,
        makeups: session.makeups,
        updatedAt: session.updatedAt,
        course: session.course,
        teacherName: session.teacher.user.name,
        ...(actor.role === 'ADMIN' ? { notificationReceipts: receipts } : {}),
        materials: session.materials,
        canJoin: session.status === 'LIVE' && (staff || active),
        observer: actor.role === 'PARENT',
        students: students.map((s) => ({
          id: s.id,
          name: s.user.name,
          attended: attendance.some((a) => a.studentId === s.id),
          report: reports.find((r) => r.studentId === s.id) ?? null,
          homework:
            homework && session.status === 'COMPLETED'
              ? {
                  title: homework.title,
                  submission: homework.submissions.find((h) => h.studentId === s.id) ?? null,
                }
              : null,
          assessment: applications.find((a) => a.studentId === s.id)?.levelNotes ?? null,
        })),
      },
    };
  });
  app.patch<{ Params: { id: string } }>('/sessions/:id/schedule', async (request) => {
    requireAdmin(request.user);
    const body = z
      .object({
        action: z.enum(['RESCHEDULE', 'CANCEL', 'MAKEUP']),
        updatedAt: z.string().datetime(),
        reason: z.string().trim().min(3).max(1000),
        scheduledAt: z.string().datetime().optional(),
        durationMinutes: z.number().int().min(5).max(240).optional(),
      })
      .parse(request.body);
    const found = await prisma.classSession.findUnique({ where: { id: request.params.id } });
    if (!found) throw httpError(404, 'الحصة غير موجودة');
    return {
      data: await prisma.$transaction(async (tx) => {
        await lockCourse(tx, found.courseId);
        const current = await tx.classSession.findUniqueOrThrow({ where: { id: found.id } });
        if (current.updatedAt.toISOString() !== body.updatedAt)
          throw httpError(409, 'تغيرت الحصة؛ حدّث الصفحة');
        if (
          current.status === 'LIVE' ||
          (body.action !== 'MAKEUP' && current.status !== 'SCHEDULED')
        )
          throw httpError(409, 'لا يمكن تعديل حصة بدأت أو انتهت');
        if (body.action === 'MAKEUP' && !['COMPLETED', 'CANCELLED'].includes(current.status))
          throw httpError(409, 'التعويض لحصة منتهية أو ملغاة فقط');
        let updated;
        if (body.action === 'CANCEL')
          updated = await tx.classSession.update({
            where: { id: current.id },
            data: { status: 'CANCELLED', changeReason: body.reason },
          });
        else {
          if (!body.scheduledAt || new Date(body.scheduledAt) <= new Date())
            throw httpError(400, 'اختر موعدًا قادمًا');
          const scheduledAt = new Date(body.scheduledAt);
          const durationMinutes = body.durationMinutes ?? current.durationMinutes;
          await tx.$queryRaw`SELECT id FROM "TeacherProfile" WHERE id = ${current.teacherId} FOR UPDATE`;
          const others = await tx.classSession.findMany({
            where: {
              teacherId: current.teacherId,
              id: { not: current.id },
              status: { in: ['SCHEDULED', 'LIVE'] },
            },
          });
          if (
            others.some(
              (s) =>
                s.scheduledAt.getTime() < scheduledAt.getTime() + durationMinutes * 60000 &&
                s.scheduledAt.getTime() + s.durationMinutes * 60000 > scheduledAt.getTime()
            )
          )
            throw httpError(409, 'الموعد يتعارض مع حصة أخرى للمعلم');
          if (body.action === 'MAKEUP') {
            if (
              await tx.classSession.count({
                where: { makeupForId: current.id, status: { in: ['SCHEDULED', 'LIVE'] } },
              })
            )
              throw httpError(409, 'يوجد تعويض قادم لهذه الحصة');
            updated = await tx.classSession.create({
              data: {
                courseId: current.courseId,
                teacherId: current.teacherId,
                title: `تعويض: ${current.title}`,
                scheduledAt,
                durationMinutes,
                makeupForId: current.id,
                changeReason: body.reason,
              },
            });
          } else
            updated = await tx.classSession.update({
              where: { id: current.id },
              data: { scheduledAt, durationMinutes, changeReason: body.reason },
            });
        }
        await audit(tx, request.user.id, `SESSION_${body.action}`, current.id, {
          before: current.scheduledAt.toISOString(),
          after: updated.scheduledAt.toISOString(),
          reason: body.reason,
          resultId: updated.id,
        });
        await notifyCourse(
          tx,
          current.courseId,
          body.action === 'CANCEL'
            ? 'إلغاء موعد الحصة'
            : body.action === 'MAKEUP'
              ? 'تحديد حصة تعويضية'
              : 'تغيير موعد الحصة',
          `${updated.title}: ${updated.scheduledAt.toISOString()}. السبب: ${body.reason}. راجع الموعد بتوقيت جهازك في صفحة الحصة.`,
          updated.id
        );
        return updated;
      }),
    };
  });
  app.get<{ Params: { id: string } }>('/courses/:id/skills', async (request) => {
    const course = await courseAccess(request.user, request.params.id);
    const staff = request.user.role === 'ADMIN' || request.user.role === 'TEACHER';
    const students = await prisma.studentProfile.findMany({
      where: {
        enrollments: { some: { courseId: course.id } },
        ...(staff
          ? {}
          : request.user.role === 'PARENT'
            ? { parent: { userId: request.user.id } }
            : { userId: request.user.id }),
      },
      select: { id: true, level: true, user: { select: { name: true } } },
    });
    const skills = await prisma.courseSkill.findMany({
      where: { courseId: course.id },
      include: { progress: { where: { studentId: { in: students.map((s) => s.id) } } } },
      orderBy: { createdAt: 'asc' },
    });
    return { data: { course: { id: course.id, title: course.title }, students, skills } };
  });
  app.post<{ Params: { id: string } }>('/courses/:id/skills', async (request, reply) => {
    const course = await courseAccess(request.user, request.params.id);
    if (!['ADMIN', 'TEACHER'].includes(request.user.role))
      throw httpError(403, 'المهارات يحددها المعلم أو الإدارة');
    const { title } = z.object({ title: z.string().trim().min(3).max(200) }).parse(request.body);
    const skill = await prisma.$transaction(async (tx) => {
      const locked = await lockCourse(tx, course.id);
      if (
        request.user.role === 'TEACHER' &&
        !(await tx.teacherProfile.findFirst({
          where: { id: locked.teacherId, userId: request.user.id },
        }))
      )
        throw httpError(403, 'تغير معلم الدورة');
      const existing = await tx.courseSkill.findUnique({
        where: { courseId_title: { courseId: course.id, title } },
      });
      if (existing) return existing;
      const item = await tx.courseSkill.create({ data: { courseId: course.id, title } });
      await audit(tx, request.user.id, 'SKILL_CREATED', item.id, { title, courseId: course.id });
      return item;
    });
    return reply.status(201).send({ data: skill });
  });
  app.put<{ Params: { id: string } }>('/skills/:id/progress', async (request) => {
    if (!['TEACHER', 'ADMIN'].includes(request.user.role))
      throw httpError(403, 'تقييم المهارة للمعلم والإدارة');
    const body = z
      .object({
        studentId: z.string().min(1),
        status: z.enum(['NOT_STARTED', 'PRACTICING', 'MASTERED']),
        note: z.string().trim().max(1000),
        version: z.number().int().min(0),
      })
      .parse(request.body);
    const skill = await prisma.courseSkill.findUnique({ where: { id: request.params.id } });
    if (!skill) throw httpError(404, 'المهارة غير موجودة');
    await courseAccess(request.user, skill.courseId);
    return {
      data: await prisma.$transaction(async (tx) => {
        const locked = await lockCourse(tx, skill.courseId);
        if (
          request.user.role === 'TEACHER' &&
          !(await tx.teacherProfile.findFirst({
            where: { id: locked.teacherId, userId: request.user.id },
          }))
        )
          throw httpError(403, 'تغير معلم الدورة');
        if (
          !(await tx.enrollment.findFirst({
            where: { courseId: skill.courseId, studentId: body.studentId, status: 'ACTIVE' },
          }))
        )
          throw httpError(403, 'الطالب غير مسجل في الدورة');
        const where = { skillId_studentId: { skillId: skill.id, studentId: body.studentId } };
        const old = await tx.skillProgress.findUnique({ where });
        if ((old?.version ?? 0) !== body.version) throw httpError(409, 'تغير التقييم؛ حدّث الصفحة');
        const result = await tx.skillProgress.upsert({
          where,
          create: {
            skillId: skill.id,
            studentId: body.studentId,
            status: body.status,
            note: body.note,
          },
          update: { status: body.status, note: body.note, version: { increment: 1 } },
        });
        await audit(tx, request.user.id, 'SKILL_ASSESSED', skill.id, {
          studentId: body.studentId,
          status: body.status,
        });
        return result;
      }),
    };
  });
}
