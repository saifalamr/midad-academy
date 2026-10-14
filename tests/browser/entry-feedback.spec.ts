import { test, expect } from '@playwright/test';

test('compact home exposes working entry links on phone, tablet and desktop', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 390, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.locator('.welcome-actions').getByRole('link', { name: 'تسجيل الدخول' })
    ).toBeVisible();
    await expect(
      page.locator('.welcome-actions').getByRole('link', { name: 'إنشاء حساب ولي أمر' })
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
    const links = await page
      .locator('.public-home a')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')));
    expect(links.every((href) => href && href !== '#')).toBe(true);
    await page.screenshot({ path: `test-results/compact-home-${width}.png`, fullPage: true });
  }
  await page.locator('.welcome-courses').click();
  await expect(page).toHaveURL(/#monthly-courses$/);
  await page.locator('.welcome-actions').getByRole('link', { name: 'إنشاء حساب ولي أمر' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.goto('/contact');
  await expect(page.locator('h1')).toBeVisible();
  await page.goto('/help');
  await expect(page.locator('h1')).toBeVisible();
});

test('validation and login failures use dismissible popups; retry remains available', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'راجع البيانات' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await page.locator('#email').fill('missing@preview.midad.test');
  await page.locator('#password').fill('IncorrectPassword2026');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Invalid credentials');
  await page.getByRole('button', { name: 'حسنًا' }).click();
  await expect(page.locator('#email')).toHaveValue('missing@preview.midad.test');
  await page.getByRole('button', { name: 'عرض التنبيه' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Invalid credentials');
  await page.keyboard.press('Escape');
  let failed = true;
  await page.route('**/api/courses/catalog', (route) =>
    route.fulfill({
      status: failed ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(failed ? { error: 'Unavailable' } : { data: [] }),
    })
  );
  await page.goto('/');
  await expect(page.getByRole('alertdialog')).toContainText('تعذر تحميل الدورات');
  failed = false;
  await page.getByRole('alertdialog').getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await expect(page.getByText('سيتم الإعلان عن الدورات الشهرية هنا قريبًا.')).toBeVisible();
});

test('logout cancel and Escape preserve the account; confirmation clears both token stores', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('#email').fill('teacher@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  const logout = page.getByRole('button', { name: /Log out/ });
  await logout.click();
  await expect(page.getByRole('alertdialog')).toContainText('هل تريد تسجيل الخروج');
  await page.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  expect(await page.evaluate(() => !!localStorage.getItem('token'))).toBe(true);
  await logout.click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => !!localStorage.getItem('token'))).toBe(true);
  await logout.click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'تسجيل الخروج', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => !localStorage.getItem('token') && !sessionStorage.getItem('token'))
  ).toBe(true);
});
