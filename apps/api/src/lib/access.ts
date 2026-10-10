import { prisma } from './prisma';

export type Actor = { id: string; role: string };

export async function canAccessCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role === 'ADMIN')
    return !!(await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }));
  if (actor.role === 'TEACHER') {
    return !!(await prisma.course.findFirst({
      where: { id: courseId, teacher: { userId: actor.id } },
      select: { id: true },
    }));
  }
  if (actor.role === 'STUDENT') {
    return !!(await prisma.enrollment.findFirst({
      where: { courseId, status: 'ACTIVE', student: { userId: actor.id } },
      select: { id: true },
    }));
  }
  return false;
}

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

// Observation is limited to live classrooms, not general child course data.
export async function canObserveCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role !== 'PARENT') return false;
  return !!(await prisma.enrollment.findFirst({
    where: { courseId, status: 'ACTIVE', student: { parent: { userId: actor.id } } },
    select: { id: true },
  }));
}
export async function canReadClassroom(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role !== 'PARENT') return canAccessCourse(actor, courseId);
  return await canObserveCourse(actor, courseId) && !!(await prisma.classSession.findFirst({
    where: { courseId, status: 'LIVE' }, select: { id: true },
  }));
}
