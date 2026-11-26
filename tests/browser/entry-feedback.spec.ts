import { test, expect } from '@playwright/test';

test('security policy restricts remote scripts and external framing while keeping own writing iframe available', async ({ page }) => {
  const response = await page.goto('/login');
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net;");
  expect(policy).toContain("frame-ancestors 'self';");
  expect(policy).toContain("frame-src 'self' https://www.youtube.com;");
  expect(policy).toContain("object-src 'none';");
  expect(policy).toContain("base-uri 'self';");
  expect(policy).toContain("form-action 'self';");
});

test('password recovery removes its one-time token from the address and referrer', async ({ page }) => {
  const response = await page.goto(`/reset-password?token=${'a'.repeat(64)}`);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('button', { name: 'تحديث كلمة المرور' })).toBeEnabled();
});

test('password recovery shows Arabic guidance without exposing server errors', async ({ page }) => {
  await page.route('**/api/auth/forgot-password', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Internal response' }) })
  );
  await page.goto('/forgot-password');
  await page.getByLabel('البريد الإلكتروني لحسابك').fill('family@example.test');
  await page.getByRole('button', { name: 'إرسال رابط الاستعادة' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('إذا كان البريد مسجلًا');
  await expect(page.getByRole('alertdialog')).not.toContainText('Internal response');

  await page.route('**/api/auth/reset-password', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Internal token error' }) })
  );
  await page.goto(`/reset-password?token=${'a'.repeat(64)}`);
  await page.getByLabel('كلمة المرور الجديدة').fill('NewPassword2026!');
  await page.getByRole('button', { name: 'تحديث كلمة المرور' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('رابط الاستعادة غير صالح');
  await expect(page.getByRole('alertdialog')).not.toContainText('Internal token error');
});

test('login keeps the session secret in an HttpOnly cookie and blocks cross-site writes', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('parent@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  const loginResponse = page.waitForResponse((res) => res.url().endsWith('/api/auth/login'));
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  const response = await loginResponse;
  expect((await response.json()).data.token).toBeUndefined();
  await expect(page).toHaveURL(/\/parent$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('cookie');
  expect(await page.evaluate(() => document.cookie)).not.toContain('midad_session');
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === 'midad_session');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  const denied = await page.request.post('http://127.0.0.1:3000/api/auth/whiteboard-ticket', {
    headers: { Origin: 'https://attacker.example' }, data: { roomName: 'whiteboard-preview-arabic' },
  });
  expect(denied.status()).toBe(403);
});

test('public home explains the lesson and exposes working entry links across widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /العربية، عالمٌ يكتشفه طفلك/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'حصة فيها تفاعل' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تقدّم تراه بنفسك' })).toBeVisible();
  for (const width of [280, 320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.locator('.welcome-actions').getByRole('link', { name: 'اكتشف الدورات' })
    ).toBeVisible();
    await expect(
      page.locator('.welcome-actions').getByRole('link', { name: 'أنشئ حساب ولي أمر' })
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
  await page.getByRole('button', { name: 'تفعيل الوضع الداكن' }).click();
  await expect(page.locator('.public-home')).toHaveAttribute('data-home-theme', 'dark');
  await page.screenshot({ path: 'test-results/glass-home-dark-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/glass-home-dark-390.png', fullPage: true });
  await page.reload();
  await expect(page.locator('.public-home')).toHaveAttribute('data-home-theme', 'dark');
  await page.getByRole('button', { name: 'تفعيل الوضع الفاتح' }).click();
  await expect(page.locator('.public-home')).toHaveAttribute('data-home-theme', 'light');
  await page.locator('.welcome-actions').getByRole('link', { name: 'اكتشف الدورات' }).click();
  await expect(page).toHaveURL(/#monthly-courses$/);
  await page.locator('.welcome-actions').getByRole('link', { name: 'أنشئ حساب ولي أمر' }).click();
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
  await expect(page.getByRole('alertdialog')).toContainText(/أدخل (البريد الإلكتروني أو اسم المستخدم|كلمة المرور)/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await page.locator('#email').fill('missing@preview.midad.test');
  await page.locator('#password').fill('IncorrectPassword2026');
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('بيانات الدخول غير صحيحة');
  await page.getByRole('button', { name: 'حسنًا' }).click();
  await expect(page.locator('#email')).toHaveValue('missing@preview.midad.test');
  await page.getByRole('button', { name: 'عرض التنبيه' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('بيانات الدخول غير صحيحة');
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
