import { prisma } from './prisma';

export async function studentProgress(studentId: string) {
  const enrolled = await prisma.enrollment.findMany({
    where: { studentId, status: 'ACTIVE' },
    include: {
      course: {
        include: {
          content: {
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              title: true,
              learningStates: { where: { studentId }, select: { completedAt: true } },
            },
          },
          classSessions: {
            where: { status: 'COMPLETED' },
            include: { attendance: { where: { studentId }, select: { id: true } } },
            orderBy: { scheduledAt: 'desc' },
          },
        },
      },
    },
  });
  // Do not report pre-enrollment classes as absences. Actual attendance is
  // preserved even if a class was rescheduled or the student joined late.
  const enrollments = enrolled.map((e) => ({
    ...e,
    course: {
      ...e.course,
      classSessions: e.course.classSessions.filter(
        (s) => s.scheduledAt >= e.enrolledAt || s.attendance.length > 0
      ),
    },
  }));
  const sessions = enrollments.flatMap((e) =>
    e.course.classSessions.map((s) => ({
      id: s.id,
      courseId: e.courseId,
      timeZone: e.course.timeZone,
      title: s.title,
      lessonTitle: s.title,
      courseTitle: e.course.title,
      scheduledAt: s.scheduledAt,
      attended: s.attendance.length > 0,
    }))
  );
  return {
    materialProgress: enrollments.map((e) => {
      const materials = e.course.content;
      const next = materials.find((item) => !item.learningStates[0]?.completedAt);
      return {
        courseId: e.courseId,
        title: e.course.title,
        total: materials.length,
        completed: materials.filter((item) => !!item.learningStates[0]?.completedAt).length,
        nextLesson: next ? { id: next.id, title: next.title } : null,
      };
    }),
    totalLessons: sessions.length,
    lessonsCompleted: sessions.filter((s) => s.attended).length,
    courseProgress: enrollments.map((e) => ({
      courseId: e.courseId,
      title: e.course.title,
      courseTitle: e.course.title,
      total: e.course.classSessions.length,
      completed: e.course.classSessions.filter((s) => s.attendance.length > 0).length,
    })),
    recentSessions: sessions
      .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
      .slice(0, 8),
  };
}
