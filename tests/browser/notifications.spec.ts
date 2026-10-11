import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
test('parents control WhatsApp consent and administration sees the honest integration status on all screen sizes', async ({
  page,
  request,
  browser,
}) => {
  const login = async (email: string) => {
    const r = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(r.ok()).toBeTruthy();
    return (await r.json()).data.token;
  };
  const url = new URL(process.env.DATABASE_URL!);
  expect(['127.0.0.1', 'localhost']).toContain(url.hostname);
  expect(url.port).toBe('5433');
  const prisma = new PrismaClient();
  await prisma.user.update({
    where: { email: 'parent@preview.midad.test' },
    data: { whatsappPhone: '201000000000', whatsappOptIn: false },
  });
  await prisma.$disconnect();
  const parentToken = await login('parent@preview.midad.test');
  await page.addInitScript((token) => localStorage.setItem('token', token), parentToken);
  await page.goto('/parent/notifications');
  await expect(page.getByRole('heading', { name: 'رسائل واتساب', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'أوافق على رسائل واتساب' }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ');
  await page.reload();
  await expect(page.getByRole('button', { name: 'إيقاف الرسائل' })).toBeVisible();
  await page.getByRole('button', { name: 'إيقاف الرسائل' }).click();
  await expect(page.getByRole('button', { name: 'أوافق على رسائل واتساب' })).toBeVisible();
  const admin = await login('admin@preview.midad.test');
  const context = await browser.newContext();
  await context.addInitScript((token) => localStorage.setItem('token', token), admin);
  const adminPage = await context.newPage();
  await adminPage.goto('http://127.0.0.1:3000/admin/notifications');
  await expect(
    adminPage.getByRole('heading', { name: 'الإرسال التلقائي غير مفعّل' })
  ).toBeVisible();
  for (const width of [320, 820, 1440]) {
    await adminPage.setViewportSize({ width, height: 900 });
    expect(
      await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    ).toBeTruthy();
  }
  await context.close();
});
