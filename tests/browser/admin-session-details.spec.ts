import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
test('administration opens class details from the course and sees historical teacher, students and connection times on all screens', async ({
  page,
  request,
}) => {
  const database = new URL(process.env.DATABASE_URL!);
  expect(['127.0.0.1', 'localhost']).toContain(database.hostname);
  expect(database.port).toBe('5433');
  const prisma = new PrismaClient();
  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { user: { email: 'teacher@preview.midad.test' } },
    include: { user: true },
  });
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: { user: { email: 'student@preview.midad.test' } },
    include: { user: true },
  });
  const absent = await prisma.user.create({
    data: {
      email: 'attendance-absent@midad.test',
      name: 'طالب لم يدخل',
      role: 'STUDENT',
      passwordHash: 'unused-local-password',
      studentProfile: { create: { age: 10 } },
    },
    include: { studentProfile: true },
  });
  const course = await prisma.course.create({
    data: {
      title: 'دورة متابعة الحضور',
      description: 'Local attendance fixture',
      teacherId: teacher.id,
      ageGroup: '8–10',
      level: 'beginner',
      month: '2099-02',
      price: 0,
      timeZone: 'Asia/Aden',
    },
  });
  const joinedAt = new Date(Date.now() - 300_000),
    leftAt = new Date(Date.now() - 60_000);
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      title: 'حصة متابعة الحضور',
      status: 'COMPLETED',
      scheduledAt: joinedAt,
      startedAt: joinedAt,
      endedAt: leftAt,
      durationMinutes: 40,
    },
  });
  await prisma.sessionReport.createMany({
    data: [student.id, absent.studentProfile!.id].map((studentId) => ({
      sessionId: session.id,
      studentId,
    })),
  });
  await prisma.sessionAttendance.create({
    data: { sessionId: session.id, studentId: student.id, joinedAt },
  });
  await prisma.classroomVisit.createMany({
    data: [
      {
        sessionId: session.id,
        userId: teacher.userId,
        role: 'TEACHER',
        participantSid: 'PA_teacher_ui',
        joinedAt,
        leftAt,
        exitSource: 'WEBHOOK',
      },
      {
        sessionId: session.id,
        userId: student.userId,
        role: 'STUDENT',
        participantSid: 'PA_student_ui',
        joinedAt,
        leftAt,
        exitSource: 'OBSERVED',
      },
    ],
  });
  try {
    const login = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email: 'admin@preview.midad.test', password: 'MidadPreview2026!' },
    });
    expect(login.ok()).toBeTruthy();
    await page.addInitScript(
      (token) => localStorage.setItem('token', token),
      (await login.json()).data.token
    );
    await page.goto('/admin');
    await page.getByRole('button', { name: /دورة متابعة الحضور/ }).click();
    const row = page.locator('.admin-session').filter({ hasText: 'حصة متابعة الحضور' });
    await row.getByRole('link', { name: 'تفاصيل الحصة والحضور' }).click();
    await expect(
      page.getByRole('heading', { name: 'حصة متابعة الحضور', exact: true })
    ).toBeVisible();
    const instructor = page.getByRole('region', { name: 'حضور المعلم' });
    await expect(instructor).toContainText('سُجّل دخوله');
    const attended = page.getByRole('article', { name: 'حضور Preview Student' });
    await expect(attended).toContainText('سُجّل دخوله');
    const noEntry = page.getByRole('article', { name: 'حضور طالب لم يدخل' });
    await expect(noEntry).toContainText('لم يُسجّل دخوله');
    await attended.locator('summary').click();
    await expect(attended).toContainText('رُصد الخروج');
    await expect(attended).toContainText('تقريبي');
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
      await page.screenshot({ path: `test-results/admin-attendance-${width}.png`, fullPage: true });
    }
    const route = `**/api/admin/sessions/${session.id}/details`;
    await page.route(route, (r) =>
      r.fulfill({ status: 503, json: { error: 'تعذر قراءة السجل مؤقتًا' } })
    );
    await page.reload();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('تعذر قراءة');
    await page.unroute(route);
    await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
    await expect(instructor).toContainText('سُجّل دخوله');
  } finally {
    await prisma.classSession.delete({ where: { id: session.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.user.delete({ where: { id: absent.id } });
    await prisma.$disconnect();
  }
});
