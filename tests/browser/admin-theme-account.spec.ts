import { expect, test } from '@playwright/test';

test('appearance follows the same choice from homepage through admin pages and notifications open from the header', async ({
  page,
}) => {
  await page.goto('/');
  const enableDark = page.getByRole('button', { name: 'تفعيل الوضع الداكن' });
  if (await enableDark.isVisible()) await enableDark.click();
  await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'dark');
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'dark');
  await page.locator('#email').fill('admin@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'dark');
  await page.getByRole('button', { name: 'الإشعارات' }).click();
  await expect(page.getByRole('region', { name: 'آخر الإشعارات' })).toBeVisible();
  await page.getByRole('button', { name: 'إغلاق الإشعارات' }).click();
  await page.goto('/academy');
  await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'dark');
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page
        .locator('.flow-tabs')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    ).toBe(true);
  }
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'dark');
  await page.getByRole('button', { name: 'تفعيل الوضع الفاتح' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'light');
});

test('a parent can change the account password and sign in again', async ({ page }) => {
  const email = `account-review-${Date.now()}@midad.test`;
  await page.goto('/register');
  await page.locator('#name').fill('Account Review Parent');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('OldReviewPassword2026!');
  await page.locator('#whatsappPhone').fill('+905001234567');
  await page.getByRole('checkbox').last().check();
  await page.getByRole('button', { name: 'إنشاء الحساب ومتابعة تسجيل الطفل', exact: true }).click();
  await expect(page).toHaveURL(/\/academy\?start=1$/);
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'تغيير كلمة المرور' })).toBeVisible();
  await page.getByLabel('كلمة المرور الحالية').fill('OldReviewPassword2026!');
  await page.getByLabel('كلمة المرور الجديدة', { exact: true }).fill('NewReviewPassword2026!');
  await page.getByLabel('تأكيد كلمة المرور الجديدة').fill('NewReviewPassword2026!');
  await page.getByRole('button', { name: 'تغيير كلمة المرور' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('NewReviewPassword2026!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/parent$/);
});

test('dark appearance keeps parent, teacher and student dashboards readable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('midad-home-theme', 'dark'));
  for (const role of ['parent', 'teacher', 'student']) {
    await page.goto('/login');
    await page.locator('#email').fill(`${role}@preview.midad.test`);
    await page.locator('#password').fill('MidadPreview2026!');
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${role}$`));
    await expect(page.locator('html')).toHaveAttribute('data-midad-theme', 'dark');
    await expect.poll(() => page.locator('.workspace-shell').evaluate((element) =>
      getComputedStyle(element).backgroundColor
    )).toBe('rgb(13, 27, 50)');
    await page.getByRole('button', { name: /خروج/ }).click();
    await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
});
