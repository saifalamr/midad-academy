import { test, expect } from '@playwright/test';

test('entry pages explain role access, preserve parent registration, and fit narrow screens', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByText('ولي الأمر، الطالب، المعلّم والإدارة يدخلون من هنا.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'أنشئ حساب ولي أمر' })).toHaveAttribute(
    'href',
    '/register'
  );
  for (const width of [280, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
  }
  await page.getByRole('button', { name: 'تفعيل الوضع الداكن' }).click();
  await expect(page.locator('.auth-page')).toHaveAttribute('data-home-theme', 'dark');
  await page.getByRole('link', { name: 'أنشئ حساب ولي أمر' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.locator('.auth-page')).toHaveAttribute('data-home-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'إنشاء حساب ولي الأمر' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'تسجيل الدخول' })).toHaveAttribute('href', '/login');
  expect(await page.locator('input[type="email"]').count()).toBe(1);
  expect(await page.locator('input[type="tel"]').count()).toBe(1);
  for (const width of [280, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    );
  }
});
