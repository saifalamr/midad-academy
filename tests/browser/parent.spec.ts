import { test, expect } from '@playwright/test';

test('parent switches children, retries errors and sees scoped attendance and exercise grades across screens', async ({
  page,
  request,
}) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', {
    data: { email: 'parent@preview.midad.test', password: 'MidadPreview2026!' },
  });
  await page.addInitScript(
    (token) => localStorage.setItem('token', token),
    (await login.json()).data.token
  );
  const course = {
    id: 'family-course',
    title: 'رحلة الحروف',
    month: '2099-01',
    timeZone: 'Africa/Cairo',
    teacherName: 'أستاذ مداد',
    upcomingSessions: [
      {
        id: 'next',
        title: 'الحرف القادم',
        scheduledAt: '2099-01-01T14:00:00Z',
        durationMinutes: 50,
        status: 'SCHEDULED',
      },
    ],
    exercises: [
      {
        id: 'todo',
        title: 'تمرين لم يسلم',
        status: 'NOT_SUBMITTED',
        score: null,
        submittedAt: null,
      },
      {
        id: 'pending',
        title: 'تمرين ينتظر التصحيح',
        status: 'PENDING_REVIEW',
        score: null,
        submittedAt: '2026-10-01T10:00:00Z',
      },
      {
        id: 'done',
        title: 'تمرين مصحح',
        status: 'COMPLETE',
        score: 85,
        submittedAt: '2026-10-01T10:00:00Z',
      },
    ],
  };
  const child = {
    id: 'child-a',
    name: 'أحمد',
    level: 'BEGINNER',
    totalPoints: 0,
    lessonsCompleted: 1,
    totalLessons: 2,
    courses: [course],
    courseProgress: [{ courseId: course.id, total: 2, completed: 1 }],
    materialProgress: [{ courseId: course.id, total: 3, completed: 1 }],
    recentSessions: [
      {
        id: 'completed',
        courseTitle: course.title,
        lessonTitle: 'حصة مكتملة',
        scheduledAt: '2026-10-01T10:00:00Z',
        attended: true,
        timeZone: 'Africa/Cairo',
      },
    ],
  };
  let count = 0;
  await page.route('**/api/parent/overview', (route) =>
    route.fulfill(
      ++count === 1
        ? { status: 503, json: {} }
        : {
            json: {
              data: {
                children: [
                  child,
                  {
                    ...child,
                    id: 'child-b',
                    name: 'مريم',
                    courses: [],
                    courseProgress: [],
                    recentSessions: [],
                    materialProgress: [],
                    totalLessons: 0,
                    lessonsCompleted: 0,
                  },
                ],
              },
            },
          }
    )
  );
  await page.goto('/parent');
  await expect(page.locator('main').getByRole('alert')).toContainText('تعذر تحميل');
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'دورات أحمد' })).toBeVisible();
  await expect(page.getByText('الحرف القادم', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('لم تُسلّم', { exact: true })).toBeVisible();
  await expect(page.getByText('بانتظار تصحيح المعلم', { exact: true })).toBeVisible();
  await expect(page.getByText('الدرجة النهائية: 85%', { exact: true })).toBeVisible();
  await expect(page.getByText('الحضور', { exact: false }).first()).toBeVisible();
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [820, 1180],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/parent-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: /مريم/ }).click();
  await expect(page.getByRole('heading', { name: 'دورات مريم' })).toBeVisible();
  await expect(page.getByText('تمرين مصحح', { exact: true })).toHaveCount(0);
  await expect(page.getByText('لم تسجل الأكاديمية طفلك في دورة بعد.')).toBeVisible();
  await page.getByRole('button', { name: /أحمد/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تحميل سجل الحضور الأخير' }).click();
  expect((await download).suggestedFilename()).toBe('midad-recent-attendance.csv');
});

test('course enquiry opens academy WhatsApp with exact course, month and timezone schedule', async ({
  page,
  request,
  browser,
}) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', {
    data: { email: 'parent@preview.midad.test', password: 'MidadPreview2026!' },
  });
  await page.addInitScript(
    (token) => localStorage.setItem('token', token),
    (await login.json()).data.token
  );
  const course = {
    id: 'inquiry',
    title: 'رحلة العربية',
    description: 'تعلم الحروف',
    month: '2099-01',
    ageGroup: '8–10',
    price: 12,
    currency: 'USD',
    teacherName: 'معلم',
    availableSeats: 2,
    timeZone: 'Africa/Cairo',
    sessions: [{ scheduledAt: '2099-01-01T14:00:00Z', durationMinutes: 50 }],
  };
  await page.route('**/api/courses/browse', (route) =>
    route.fulfill({
      json: {
        data: [
          course,
          { ...course, id: 'full', title: 'دورة ممتلئة', availableSeats: 0, sessions: [] },
        ],
      },
    })
  );
  await page.goto('/courses');
  const link = page.getByRole('link', { name: 'طلب التسجيل عبر واتساب' });
  const href = await link.getAttribute('href');
  const url = new URL(href!);
  expect(url.hostname).toBe('wa.me');
  expect(url.pathname).toBe('/201039310464');
  expect(url.searchParams.get('text')).toContain('رحلة العربية');
  expect(url.searchParams.get('text')).toContain('2099-01');
  expect(url.searchParams.get('text')).toContain('Africa/Cairo');
  await expect(page.getByText('المواعيد القادمة', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'استفسر عن قائمة الانتظار' })).toBeVisible();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.route('**/api/courses/catalog', (route) =>
    route.fulfill({ json: { data: [course] } })
  );
  await publicPage.goto('http://127.0.0.1:3000/');
  await expect(publicPage.getByRole('link', { name: 'طلب التسجيل عبر واتساب' })).toHaveAttribute(
    'href',
    href!
  );
  await publicContext.close();
});
