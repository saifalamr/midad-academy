import { test, expect } from '@playwright/test';

test('parent registration, admin child account, monthly course, enrollment and scheduling form a complete journey', async ({
  page,
  request,
  browser,
}) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'إنشاء حساب ولي الأمر' })).toBeVisible();
  await expect(page.locator('#role')).toHaveCount(0);
  await page.locator('#name').fill('Browser parent');
  await page.locator('#email').fill('browser-parent@midad.test');
  await page.locator('#password').fill('TestingPassword2026!');
  await page.locator('#whatsappPhone').fill('+905001234567');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  await page.locator('#email').fill('admin@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/admin$/);
  await expect(page.getByRole('heading', { name: 'إدارة الأكاديمية', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'الأسر والطلاب', exact: true }).click();
  const childForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'إنشاء حساب الطالب', exact: true }) });
  const overview = await (
    await request.get('http://127.0.0.1:4000/api/admin/overview', {
      headers: {
        Authorization: `Bearer ${(await (await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email: 'admin@preview.midad.test', password: 'MidadPreview2026!' } })).json()).data.token}`,
      },
    })
  ).json();
  const parent = overview.data.parents.find((p) => p.user.email === 'browser-parent@midad.test');
  await childForm.getByLabel('ولي الأمر', { exact: true }).selectOption(parent.id);
  await childForm.getByLabel('اسم الطالب', { exact: true }).fill('Browser child');
  await childForm
    .getByLabel('اسم المستخدم (حروف إنجليزية وأرقام)', { exact: true })
    .fill('browser.child');
  await childForm
    .getByLabel('كلمة المرور (10 أحرف على الأقل)', { exact: true })
    .fill('TestingPassword2026!');
  await childForm.getByLabel('العمر', { exact: true }).fill('8');
  await childForm.getByRole('button', { name: 'إنشاء حساب الطالب' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'تم حفظ التعديل.' })).toBeVisible();
  await expect(page.getByText('browser.child', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'الدورات والمواعيد', exact: true }).click();
  const courseForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'إنشاء الدورة', exact: true }) });
  await courseForm.getByLabel('اسم الدورة', { exact: true }).fill('Browser monthly course');
  await courseForm
    .getByLabel('وصف الدورة', { exact: true })
    .fill('A monthly course assigned by the academy.');
  await courseForm
    .getByLabel('المعلم المسؤول', { exact: true })
    .selectOption(
      overview.data.teachers.find((t) => t.user.email === 'teacher@preview.midad.test').id
    );
  await courseForm.getByLabel('شهر الدورة', { exact: true }).fill('2028-01');
  await courseForm.getByLabel('السعر الشهري بالدولار', { exact: true }).fill('30');
  await courseForm.getByLabel('عدد المقاعد', { exact: true }).fill('1');
  await courseForm.getByRole('button', { name: 'إنشاء الدورة', exact: true }).click();
  const courseButton = page
    .locator('.admin-course-list button')
    .filter({ hasText: 'Browser monthly course' });
  await expect(courseButton).toBeVisible();
  await courseButton.click();
  const enroll = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'تسجيل الطالب', exact: true }) });
  await enroll
    .getByLabel('تسجيل طالب في الدورة', { exact: true })
    .selectOption({ label: 'Browser child — Browser parent' });
  await enroll.getByRole('button', { name: 'تسجيل الطالب', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إلغاء التسجيل', exact: true })).toBeVisible();
  const schedule = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'إضافة الموعد', exact: true }) });
  await schedule.getByLabel('عنوان الحصة', { exact: true }).fill('Browser January session');
  await schedule
    .getByLabel('التاريخ والوقت بتوقيت جهازك', { exact: true })
    .fill('2028-01-10T10:00');
  await schedule.getByRole('button', { name: 'إضافة الموعد', exact: true }).click();
  await expect(page.getByText('Browser January session', { exact: true })).toBeVisible();
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/admin-${width}.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'إدارة المنهج والمواد', exact: false }).click();
  await expect(page).toHaveURL(/\/content$/);
  await expect(
    page.getByRole('heading', { name: 'Manage Course Content', exact: true })
  ).toBeVisible();
  const ctx = await browser.newContext();
  const student = await ctx.newPage();
  await student.goto('/login');
  await student.locator('#email').fill('browser.child');
  await student.locator('#password').fill('TestingPassword2026!');
  await student.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(student).toHaveURL(/student$/);
  await student.goto('/courses');
  await expect(student.getByText('Browser monthly course', { exact: true }).first()).toBeVisible();
  await expect(student.getByRole('button', { name: /Enroll/ })).toHaveCount(0);
  await student.goto('/admin');
  await expect(student).toHaveURL(/student$/);
  await ctx.close();
});
