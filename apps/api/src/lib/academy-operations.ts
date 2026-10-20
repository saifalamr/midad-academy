import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { httpError, type Actor } from './access';

export async function parentFor(actor: Actor) {
  if (actor.role !== 'PARENT') throw httpError(403, 'هذه الخدمة لولي الأمر');
  const parent = await prisma.parentProfile.findUnique({ where: { userId: actor.id } });
  if (!parent) throw httpError(404, 'حساب ولي الأمر غير موجود');
  return parent;
}
export async function childFor(actor: Actor, studentId: string) {
  const parent = await parentFor(actor);
  const child = await prisma.studentProfile.findFirst({
    where: { id: studentId, parentId: parent.id },
    include: { user: { select: { id: true, name: true, username: true } } },
  });
  if (!child) throw httpError(404, 'الطفل غير موجود في حسابك');
  return child;
}
export function requireAdmin(actor: Actor) {
  if (actor.role !== 'ADMIN') throw httpError(403, 'هذه الخدمة لإدارة الأكاديمية');
}
export function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetId: string,
  details: Prisma.InputJsonValue = {}
) {
  return tx.auditEvent.create({ data: { actorId, action, targetId, details } });
}
export function notice(
  tx: Prisma.TransactionClient,
  userId: string,
  title: string,
  body: string,
  href = '/academy'
) {
  return tx.academyNotice.create({ data: { userId, title, body, href } });
}
export async function notifyCourse(
  tx: Prisma.TransactionClient,
  courseId: string,
  title: string,
  body: string,
  sessionId: string
) {
  const students = await tx.studentProfile.findMany({
    where: { enrollments: { some: { courseId, status: 'ACTIVE' } } },
    select: { userId: true, parent: { select: { userId: true } } },
  });
  const course = await tx.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { teacher: { select: { userId: true } } },
  });
  const users = new Set([
    course.teacher.userId,
    ...students.flatMap((s) => [s.userId, ...(s.parent ? [s.parent.userId] : [])]),
  ]);
  for (const userId of users) await notice(tx, userId, title, body, `/sessions/${sessionId}`);
}
export function courseHasEnded(course: { month: string | null; timeZone: string }) {
  const now = new Intl.DateTimeFormat('en-CA', {
    timeZone: course.timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const month = `${now.find((p) => p.type === 'year')!.value}-${now.find((p) => p.type === 'month')!.value}`;
  return !!course.month && course.month < month;
}
