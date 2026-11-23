import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
}

test('each role sees a short mobile navigation while secondary pages stay reachable', async ({
  page,
}) => {
  for (const [email, destination, primary, secondary] of [
    ['student@preview.midad.test', '/student', 'تعلمي', 'واجباتي'],
    ['teacher@preview.midad.test', '/teacher', 'حصصي', 'تقارير الحصص'],
    ['admin@preview.midad.test', '/admin', 'الإدارة', 'سجل الرسائل'],
    ['parent@preview.midad.test', '/parent', 'أبنائي', 'واجبات أبنائي'],
  ]) {
    await signIn(page, email);
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    const nav = page.getByRole('navigation', { name: 'تنقل مساحة العمل' });
    await expect(nav.getByRole('link', { name: primary, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: secondary, exact: true })).toBeHidden();
    await nav.locator('summary').click();
    await expect(nav.getByRole('link', { name: secondary, exact: true })).toBeVisible();
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBeTruthy();
    }
    await page.getByRole('button', { name: 'Log out · خروج' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.setViewportSize({ width: 390, height: 844 });
  }
});

test('student, teacher and admin home screens lead with the next action', async ({ page }) => {
  await signIn(page, 'student@preview.midad.test');
  await expect(page.getByRole('heading', { name: 'خطوتك التالية' })).toBeVisible();
  await expect(page.locator('main').getByText('إنجازاتي بالأرقام')).toBeVisible();
  await page.getByRole('button', { name: 'Log out · خروج' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();

  await signIn(page, 'teacher@preview.midad.test');
  await expect(page.getByRole('heading', { name: 'ما التالي في حصصك؟' })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'أدوات المعلم' })
      .getByRole('link', { name: 'تقارير الحصص' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Log out · خروج' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();

  await signIn(page, 'admin@preview.midad.test');
  await expect(page.getByRole('region', { name: 'الخطوة التالية للإدارة' })).toBeVisible();
});
