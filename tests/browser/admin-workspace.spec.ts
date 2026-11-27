import { expect, test } from '@playwright/test';

test('admin navigation stays on the RTL start side and work sections remain usable', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('#email').fill('admin@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('.admin-overview .admin-metric')).toHaveCount(5);

  const nav = page.locator('.workspace-nav');
  for (const label of [
    'لوحة الإدارة',
    'الطلبات والمتابعة',
    'الدورات والمحتوى',
    'إعدادات التنبيهات',
    'حسابي',
    'زيارة الموقع',
  ]) {
    await expect(nav.getByRole('link', { name: label, includeHidden: true })).toHaveCount(1);
  }

  await page.getByRole('button', { name: 'أولياء الأمور' }).click();
  await expect(page.locator('.admin-section-intro h2')).toHaveText('الأسر والطلاب');
  await page.getByText('إنشاء حساب طالب', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'إنشاء حساب الطالب' })).toBeVisible();
  await page.getByRole('button', { name: 'المعلمون', exact: true }).first().click();
  await expect(page.locator('.admin-section-intro h2')).toHaveText('المعلمون');
  await page.getByText('إضافة معلم جديد', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'إنشاء حساب المعلم' })).toBeVisible();
  await page.locator('.admin-tabs button').first().click();
  await expect(page.locator('.admin-section-intro h2')).toHaveText('الدورات والمواعيد');
  await page.getByText('إنشاء دورة جديدة', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'إنشاء الدورة' })).toBeVisible();

  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
    expect(
      await page
        .locator('.admin-tabs')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    ).toBe(true);
    if (width <= 700) {
      await page.getByRole('button', { name: 'فتح قائمة الإدارة' }).click();
      await expect(nav.getByRole('link', { name: 'لوحة الإدارة' })).toBeVisible();
      await expect
        .poll(async () => {
          const bounds = await nav.boundingBox();
          return Math.abs(bounds!.x + bounds!.width - width);
        })
        .toBeLessThan(1);
      await page.keyboard.press('Escape');
      await expect(nav.getByRole('link', { name: 'لوحة الإدارة' })).toBeHidden();
    } else {
      const bounds = await nav.boundingBox();
      expect(bounds!.x + bounds!.width).toBeCloseTo(width, 0);
      await expect(nav.getByRole('link', { name: 'لوحة الإدارة' })).toBeVisible();
    }
  }
});
