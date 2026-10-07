import { prisma } from './prisma';

export async function studentProgress(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({ where: { studentId, status: 'ACTIVE' },
    include: { course: { include: { classSessions: { where: { status: { not: 'CANCELLED' } },
      include: { attendance: { where: { studentId }, select: { id: true } } }, orderBy: { scheduledAt: 'desc' } } } } } });
  const sessions = enrollments.flatMap((e) => e.course.classSessions.map((s) => ({
    id: s.id, title: s.title, lessonTitle: s.title, courseTitle: e.course.title, scheduledAt: s.scheduledAt,
    attended: s.attendance.length > 0,
  })));
  return {
    totalLessons: sessions.filter((s) => s.scheduledAt <= new Date()).length,
    lessonsCompleted: sessions.filter((s) => s.attended).length,
    courseProgress: enrollments.map((e) => ({ courseId: e.courseId, title: e.course.title, courseTitle: e.course.title,
      total: e.course.classSessions.filter((s) => s.scheduledAt <= new Date()).length,
      completed: e.course.classSessions.filter((s) => s.attendance.length > 0).length })),
    recentSessions: sessions.filter((s) => s.scheduledAt <= new Date()).sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime()).slice(0, 8),
  };
}
