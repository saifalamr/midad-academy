import { test, expect } from '@playwright/test';

test('family and administration see a distinguishable request conversation and unread updates', async ({ page, request, browser }) => {
  const login = async (email: string) => {
    const response = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data.token as string;
  };
  const parentToken = await login('parent@preview.midad.test');
  const adminToken = await login('admin@preview.midad.test');
  const parentHeaders = { Authorization: `Bearer ${parentToken}` };
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const childrenResponse = await request.get('http://127.0.0.1:4000/api/academy/children', { headers: parentHeaders });
  const child = (await childrenResponse.json()).data[0];
  const reason = `أحتاج توضيحًا بشأن خطة الدرس ${Date.now()}`;
  const created = await request.post('http://127.0.0.1:4000/api/academy/requests', {
    headers: parentHeaders,
    data: { studentId: child.id, courseId: 'preview-arabic', kind: 'SUPPORT', reason },
  });
  expect(created.status(), await created.text()).toBe(201);
  const item = (await created.json()).data;
  const answer = 'وصلنا سؤالك، وسنراجع الخطة مع المعلم.';
  const replied = await request.patch(`http://127.0.0.1:4000/api/academy/requests/${item.id}`, {
    headers: adminHeaders,
    data: { version: item.version, status: 'RESOLVED', response: answer },
  });
  expect(replied.ok(), await replied.text()).toBeTruthy();

  await page.addInitScript((token) => localStorage.setItem('token', token), parentToken);
  await page.goto('/academy');
  const notices = page.getByRole('link', { name: /الإشعارات، .* غير مقروءة/ });
  await expect(notices).toBeVisible();
  await notices.click();
  await expect(page.getByRole('button', { name: /الإشعارات \(/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'رد الإدارة على طلبك' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'الغياب والتعويض والمساعدة' }).click();
  const conversation = page.getByRole('group', { name: 'محادثة طلب مساعدة' }).filter({ hasText: reason });
  await expect(conversation.locator('.is-sent')).toContainText(reason);
  await expect(conversation.locator('.is-received')).toContainText(answer);

  const adminContext = await browser.newContext();
  await adminContext.addInitScript((token) => localStorage.setItem('token', token), adminToken);
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/academy');
  await adminPage.getByRole('button', { name: 'الغياب والتعويض والمساعدة' }).click();
  const adminConversation = adminPage.getByRole('group', { name: 'محادثة طلب مساعدة' }).filter({ hasText: reason });
  await expect(adminConversation.locator('.is-received')).toContainText(reason);
  await expect(adminConversation.locator('.is-sent')).toContainText(answer);
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
  await adminContext.close();
});
