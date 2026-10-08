import { test, expect } from '@playwright/test';

test('student sees the next session, retries failed data and prepares devices before any join request', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email: 'student@preview.midad.test', password: 'MidadPreview2026!' } });
  await page.addInitScript(token => localStorage.setItem('token', token), (await login.json()).data.token);
  const course = { id: 'preview-arabic', title: 'رحلة الحروف', teacherName: 'أستاذ مداد', ageGroup: '5–7', price: 0, currency: 'USD' };
  await page.route('**/api/enrollments', route => route.fulfill({ json: { data: [{ id: 'journey-enrollment', status: 'ACTIVE', isLive: true, course }] } }));
  let schedules = 0, joins = 0;
  await page.route('**/api/sessions/upcoming', route => {
    schedules++;
    return route.fulfill(schedules === 1 ? { status: 503, json: {} } : { json: { data: [{ id: 'journey-session', title: 'تعلّم حرف الباء', courseId: course.id, course, teacherName: course.teacherName, status: 'LIVE', scheduledAt: new Date().toISOString(), durationMinutes: 30 }] } });
  });
  await page.route('**/api/sessions/join', route => { joins++; return route.fulfill({ status: 409, json: {} }); });
  await page.goto('/student');
  await expect(page.locator('.student-data-error')).toContainText('تعذر تحديث بعض بياناتك');
  await expect(page.getByText(course.title, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'تعلّم حرف الباء' })).toBeVisible();
  await expect(page.locator('.student-data-error')).toHaveCount(0);
  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `test-results/student-journey-${width}.png`, fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 2).map(el => ({ tag: el.tagName, class: el.className, right: Math.round(el.getBoundingClientRect().right), width: Math.round(el.getBoundingClientRect().width) })));
    expect(overflow).toEqual([]);
  }
  await expect(page.getByRole('heading', { name: /My Badges/ })).toHaveCount(0);
  await page.locator('.student-progress summary').click();
  await expect(page.getByRole('heading', { name: /My Badges/ })).toBeVisible();
  await page.getByRole('button', { name: 'تجهيز ودخول الحصة', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'جاهز للتعلّم؟' })).toBeVisible();
  expect(joins).toBe(0);
  await page.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('الحصة غير مباشرة');
  expect(joins).toBe(1);
});

test('a delayed camera request can be cancelled by joining muted; its late stream is released', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email: 'student@preview.midad.test', password: 'MidadPreview2026!' } });
  await page.addInitScript(token => {
    localStorage.setItem('token', token);
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      Object.assign(window, { finishCamera: () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        const stream = canvas.captureStream(10); Object.assign(window, { lateCamera: stream }); resolve(stream);
      } });
    });
  }, (await login.json()).data.token);
  await page.route('**/api/sessions/join', async route => {
    expect(route.request().postDataJSON().roomName).toBe('preview-arabic');
    await route.fulfill({ status: 409, json: {} });
  });
  await page.goto('/classroom/preview-arabic');
  await page.getByRole('button', { name: /تشغيل الكاميرا/ }).click();
  await expect(page.getByRole('button', { name: 'دخول الحصة', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toBeVisible();
  await page.evaluate(() => (window as any).finishCamera());
  await expect.poll(() => page.evaluate(() => (window as any).lateCamera.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
});
