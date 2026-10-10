import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('teacher saves and reloads private drafts, publishes a report once, and the linked parent reads it across screens', async ({
  page,
  browser,
  request,
}) => {
  const database = new URL(process.env.DATABASE_URL!);
  expect(['127.0.0.1', 'localhost']).toContain(database.hostname);
  expect(database.port).toBe('5433');
  const prisma = new PrismaClient();
  const teacher = await prisma.teacherProfile.findFirstOrThrow({
    where: { user: { email: 'teacher@preview.midad.test' } },
  });
  const student = await prisma.studentProfile.findFirstOrThrow({
    where: { user: { email: 'student@preview.midad.test' } },
  });
  const course = await prisma.course.create({
    data: {
      title: 'دورة تقارير التجربة',
      description: 'Local report test',
      teacherId: teacher.id,
      ageGroup: '8–10',
      level: 'BEGINNER',
      price: 0,
      month: '2099-01',
      timeZone: 'Africa/Cairo',
    },
  });
  const absent = await prisma.user.create({
    data: {
      name: 'طالب غائب',
      email: 'absent-report@preview.midad.test',
      role: 'STUDENT',
      passwordHash: 'local-fixture-only',
      studentProfile: { create: { age: 9 } },
    },
    include: { studentProfile: true },
  });
  await prisma.enrollment.createMany({
    data: [student.id, absent.studentProfile!.id].map((studentId) => ({
      courseId: course.id,
      studentId,
      enrolledAt: new Date('2020-01-01'),
    })),
  });
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      title: 'حصة مراجعة الحروف',
      scheduledAt: new Date(),
      status: 'COMPLETED',
    },
  });
  await prisma.sessionAttendance.create({ data: { sessionId: session.id, studentId: student.id } });
  const login = async (email: string) => {
    const response = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data.token as string;
  };
  const parentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    await page.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('teacher@preview.midad.test')
    );
    await parentContext.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('parent@preview.midad.test')
    );
    const parentPage = await parentContext.newPage();
    await page.goto('/teacher/reports?course=' + course.id);
    const editor = page.getByRole('article', { name: 'تقرير Preview Student' });
    await expect(editor).toBeVisible();
    const absentEditor = page.getByRole('article', { name: 'تقرير طالب غائب' });
    await expect(absentEditor.getByRole('combobox', { name: 'مستوى طالب غائب' })).toBeDisabled();
    await editor.getByRole('combobox', { name: 'مستوى Preview Student' }).selectOption('GOOD');
    await editor.getByRole('spinbutton', { name: 'مشاركات Preview Student' }).fill('4');
    await editor.getByRole('combobox', { name: 'واجب Preview Student' }).selectOption('COMPLETED');
    const note = 'أتقن الطالب الحروف وشارك أربع مرات. يحتاج مراجعة الكلمات في البيت.';
    await editor.getByRole('textbox', { name: 'ملاحظة Preview Student' }).fill(note);
    const path = '**/api/teacher/reports/' + session.id + '/' + student.id;
    await page.route(path, (route) =>
      route.fulfill({ status: 503, json: { error: 'تعذر الحفظ مؤقتًا' } })
    );
    await editor.getByRole('button', { name: 'حفظ مسودة' }).click();
    await expect(editor.getByRole('alert')).toContainText('تعذر الحفظ');
    await expect(editor.getByRole('textbox')).toHaveValue(note);
    await page.unroute(path);
    await editor.getByRole('button', { name: 'حفظ مسودة' }).click();
    await expect(editor.getByRole('status')).toContainText('حُفظت المسودة');
    await page.reload();
    await expect(editor.getByRole('textbox')).toHaveValue(note);
    await parentPage.goto('http://127.0.0.1:3000/parent');
    await expect(parentPage.getByRole('region', { name: 'تقارير المعلم' })).not.toContainText(note);
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
      await page.screenshot({ path: 'test-results/reports-' + width + '.png', fullPage: true });
    }
    page.once('dialog', (dialog) => dialog.accept());
    await editor.getByRole('button', { name: 'اعتماد وإظهار لولي الأمر' }).click();
    await expect(editor.getByRole('status')).toContainText('أصبح ظاهرًا لولي الأمر');
    await expect(editor.getByRole('textbox')).toBeDisabled();
    await expect(page.getByText('معتمد 1 من 2', { exact: true })).toBeVisible();
    await parentPage.reload();
    const reports = parentPage.getByRole('region', { name: 'تقارير المعلم' });
    await expect(reports).toContainText(note);
    await expect(reports).toContainText('جيد');
    await expect(reports).toContainText('أنجز الواجب');
    for (const width of [320, 820, 1440]) {
      await parentPage.setViewportSize({ width, height: 1000 });
      expect(
        await parentPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
    }
    await page.reload();
    await expect(editor.getByRole('textbox')).toBeDisabled();
  } finally {
    await parentContext.close();
    await prisma.sessionReport.deleteMany({ where: { sessionId: session.id } });
    await prisma.classSession.delete({ where: { id: session.id } });
    await prisma.enrollment.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.user.delete({ where: { id: absent.id } });
    await prisma.$disconnect();
  }
});
