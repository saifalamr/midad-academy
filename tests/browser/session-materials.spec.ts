import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('admin orders class materials, retries safely, teacher reads frozen curriculum on mobile and desktop', async ({
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
  const course = await prisma.course.create({
    data: {
      title: 'دورة خطة الحصة',
      description: 'Local curriculum fixture',
      teacherId: teacher.id,
      ageGroup: '8–10',
      level: 'beginner',
      price: 0,
      month: '2099-01',
    },
  });
  const pdf = await prisma.courseContent.create({
    data: {
      courseId: course.id,
      title: 'مراجعة الحروف',
      description: 'نراجع الحروف التي تعلمناها',
      type: 'PDF',
      contentUrl: 'https://example.com/letters.pdf',
      duration: 5,
      order: 0,
    },
  });
  const video = await prisma.courseContent.create({
    data: {
      courseId: course.id,
      title: 'فيديو شرح الكلمات',
      description: 'فيديو قصير للشرح',
      type: 'VIDEO',
      contentUrl: 'https://example.com/video',
      duration: 10,
      order: 1,
    },
  });
  const session = await prisma.classSession.create({
    data: {
      courseId: course.id,
      teacherId: teacher.id,
      title: 'حصة الحروف والكلمات',
      scheduledAt: new Date('2099-01-05T10:00:00Z'),
    },
  });
  const login = async (email: string) => {
    const res = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).data.token as string;
  };
  const context = await browser.newContext();
  try {
    await page.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('admin@preview.midad.test')
    );
    await context.addInitScript(
      (token) => localStorage.setItem('token', token),
      await login('teacher@preview.midad.test')
    );
    await page.goto(`/admin/sessions/${session.id}/materials`);
    await expect(page.getByRole('heading', { name: session.title })).toBeVisible();
    await page.getByRole('button', { name: `إضافة ${pdf.title}`, exact: true }).click();
    await page.getByRole('button', { name: `إضافة ${video.title}`, exact: true }).click();
    await page.getByRole('button', { name: `تقديم ${video.title}`, exact: true }).click();
    const plan = page.getByRole('region', { name: 'ترتيب مواد الحصة' });
    await expect(plan.locator('li').first()).toContainText(video.title);
    const path = '**/api/admin/sessions/' + session.id + '/materials';
    await page.route(path, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 503, json: { error: 'تعذر الحفظ مؤقتًا' } })
        : route.continue()
    );
    await page.getByRole('button', { name: 'حفظ مواد الحصة', exact: true }).click();
    await expect(page.locator('.session-plan').getByRole('alert')).toContainText('تعذر الحفظ');
    await expect(plan.locator('li')).toHaveCount(2);
    await page.unroute(path);
    await page.getByRole('button', { name: 'حفظ مواد الحصة', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('حُفظت مواد الحصة');
    await page.reload();
    await expect(plan.locator('li').first()).toContainText(video.title);
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
      await page.screenshot({ path: `test-results/session-plan-${width}.png`, fullPage: true });
    }
    const teacherPage = await context.newPage();
    await teacherPage.goto(`/teacher/sessions/${session.id}/materials`);
    await expect(teacherPage.getByRole('heading', { name: session.title })).toBeVisible();
    await expect(teacherPage.getByRole('link', { name: 'فتح المادة', exact: true })).toHaveCount(2);
    await expect(teacherPage.getByRole('button', { name: 'حفظ مواد الحصة' })).toHaveCount(0);
    await expect(
      teacherPage.getByRole('link', { name: 'فتح المادة', exact: true }).first()
    ).toHaveAttribute('href', video.contentUrl);
    await page.getByRole('button', { name: `إزالة ${pdf.title}`, exact: true }).click();
    await page.getByRole('button', { name: 'حفظ مواد الحصة', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('حُفظت مواد الحصة');
    await prisma.classSession.update({ where: { id: session.id }, data: { status: 'COMPLETED' } });
    await page.reload();
    await expect(
      page.getByText('مواد هذه الحصة محفوظة للعرض فقط.', { exact: false })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'حفظ مواد الحصة' })).toHaveCount(0);
    await teacherPage.reload();
    await expect(teacherPage.getByRole('link', { name: 'فتح المادة', exact: true })).toHaveCount(1);
  } finally {
    await context.close();
    await prisma.classSession.deleteMany({ where: { courseId: course.id } });
    await prisma.courseContent.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
    await prisma.$disconnect();
  }
});
