import { prisma } from './prisma';

export type Actor = { id: string; role: string };

export async function canAccessCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role === 'TEACHER') {
    return !!await prisma.course.findFirst({ where: { id: courseId, teacher: { userId: actor.id } }, select: { id: true } });
  }
  if (actor.role === 'STUDENT') {
    return !!await prisma.enrollment.findFirst({
      where: { courseId, status: 'ACTIVE', student: { userId: actor.id } }, select: { id: true },
    });
  }
  return false;
}

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
