import { test, expect } from '@playwright/test';

test('mobile student login, enrollment, quiz and account linking code', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill('student@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText('Preview Student', { exact: true })).toBeVisible();
  await page.goto('/courses');
  await expect(page.getByText('Arabic Foundations · أساسيات العربية', { exact: true })).toBeVisible();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Arabic Foundations · أساسيات العربية', exact: true }) });
  const enroll = card.getByRole('button', { name: /Enroll/ });
  if (await enroll.isEnabled()) { await enroll.click(); await expect(card.getByRole('button', { name: '✓ Enrolled', exact: true })).toBeVisible(); }
  await page.goto('/courses/preview-arabic/lessons');
  await expect(page.getByText('First Arabic words', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Take Quiz' }).click();
  await page.getByLabel('Hello', { exact: true }).check();
  await page.getByPlaceholder('Type your answer…').fill('مرحباً');
  await page.getByRole('button', { name: 'Submit Quiz' }).click();
  await expect(page.getByText('⏳ Pending Review', { exact: true })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Generate linking code' }).click();
  await expect(page.locator('code')).toHaveText(/^[a-f0-9]{16}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: 'test-results/student-account-mobile.png', fullPage: true });
});

test('teacher creates a course and sees students; logout protects the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('teacher@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole('button', { name: /Create.*Class|Create.*Course|New.*Course|New.*Class/ }).first().click();
  await page.locator('#c-title').fill('Browser test Arabic course');
  await page.locator('#c-desc').fill('A course created through the browser test.');
  await page.getByRole('button', { name: /Create/ }).last().click();
  await expect(page.locator('#teacher-courses').getByText('Browser test Arabic course', { exact: true }).first()).toBeVisible();
  await page.goto('/teacher/students');
  await expect(page.getByRole('cell', { name: 'Preview Student', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /Log out/ }).click();
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/login$/);
});

test('parent dashboard and report navigation work on mobile', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('parent@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await page.getByRole('button', { name: '+ Add Child', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Link a Child' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download learning report' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});

test('public pages and password recovery are reachable', async ({ page }) => {
  for (const path of ['/about', '/curriculum', '/teachers', '/contact', '/help', '/terms', '/privacy', '/forgot-password']) {
    const response = await page.goto(path); expect(response?.status()).toBe(200); await expect(page.locator('h1')).toBeVisible();
  }
});
