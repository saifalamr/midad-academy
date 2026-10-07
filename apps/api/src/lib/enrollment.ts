import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { httpError } from './access';

export async function lockCourse(tx: Prisma.TransactionClient, courseId: string) {
  // Every seat-changing path locks the same row before checking capacity.
  await tx.$queryRaw`SELECT id FROM "Course" WHERE id = ${courseId} FOR UPDATE`;
  const course = await tx.course.findUnique({ where: { id: courseId } });
  if (!course) throw httpError(404, 'Course not found');
  return course;
}

export async function availableSeat(tx: Prisma.TransactionClient, courseId: string, maxStudents: number, reservationId?: string) {
  const [active, held] = await Promise.all([
    tx.enrollment.count({ where: { courseId, status: 'ACTIVE' } }),
    tx.seatReservation.count({ where: { courseId, ...(reservationId ? { id: { not: reservationId } } : {}) } }),
  ]);
  return active + held < maxStudents;
}

export async function enrollFree(courseId: string, studentId: string) {
  return prisma.$transaction(async tx => {
    const course = await lockCourse(tx, courseId);
    if (course.price > 0) throw httpError(402, 'Purchase this course through checkout first');
    const existing = await tx.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId } } });
    if (existing?.status === 'ACTIVE') throw httpError(409, 'You are already enrolled in this course');
    if (!await availableSeat(tx, courseId, course.maxStudents)) throw httpError(409, 'اكتملت مقاعد الدورة. لا يمكن التسجيل حاليًا.');
    return tx.enrollment.upsert({ where: { courseId_studentId: { courseId, studentId } }, create: { courseId, studentId }, update: { status: 'ACTIVE' } });
  });
}
