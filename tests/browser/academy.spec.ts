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
  await page.getByRole('button', { name: 'ملاحظاتي', exact: true }).click();
  await page.getByLabel('ملاحظتك الخاصة لهذا الدرس').fill('تعلمت أن مرحباً تعني Hello');
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ الملاحظة');
  await page.getByRole('button', { name: 'تحديد كمكتمل', exact: true }).click();
  await expect(page.getByRole('button', { name: '✓ مكتمل · إلغاء الإنجاز' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '✓ مكتمل · إلغاء الإنجاز' })).toBeVisible();
  await page.getByRole('button', { name: 'ملاحظاتي', exact: true }).click();
  await expect(page.getByLabel('ملاحظتك الخاصة لهذا الدرس')).toHaveValue('تعلمت أن مرحباً تعني Hello');
  await page.getByLabel('عرض الدروس').selectOption('todo');
  await expect(page.getByText('لا توجد دروس تطابق البحث أو الفلتر.')).toBeVisible();
  await page.getByLabel('عرض الدروس').selectOption('all');
  await page.getByLabel('ابحث عن درس').fill('not-a-lesson');
  await expect(page.getByText('لا توجد دروس تطابق البحث أو الفلتر.')).toBeVisible();
  await page.getByLabel('ابحث عن درس').fill('');
  await page.getByRole('button', { name: '✓ مكتمل · إلغاء الإنجاز' }).click();
  await page.getByLabel('ملاحظتك الخاصة لهذا الدرس').fill('ملاحظة تبقى هنا عند تعذر الحفظ');
  await page.route('**/api/learning/lessons/*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'تعذر الحفظ، حاول مرة أخرى' }) }));
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذر الحفظ' })).toContainText('تعذر الحفظ');
  await expect(page.getByLabel('ملاحظتك الخاصة لهذا الدرس')).toHaveValue('ملاحظة تبقى هنا عند تعذر الحفظ');
  await page.unroute('**/api/learning/lessons/*');
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ الملاحظة');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.locator('textarea').blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/learning-workspace-mobile.png', fullPage: true });
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
  await page.getByLabel('الحد الأقصى للطلاب', { exact: true }).fill('1');
  await page.getByRole('button', { name: /Create/ }).last().click();
  await expect(page.locator('#teacher-courses').getByText('Browser test Arabic course', { exact: true }).first()).toBeVisible();
  await page.goto('/teacher/students');
  await expect(page.getByRole('cell', { name: 'Preview Student', exact: true }).first()).toBeVisible();
  await page.getByLabel('البحث عن طالب').fill('nobody-with-this-name');
  await expect(page.getByText('لا يوجد طلاب يطابقون البحث.')).toBeVisible();
  await page.getByLabel('البحث عن طالب').fill('Preview Student');
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


test('student downloads a real scheduled class as a calendar event', async ({ page, request }) => {
  const login = async (email: string) => (await (await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email, password: 'MidadPreview2026!' } })).json()).data;
  const teacher = await login('teacher@preview.midad.test');
  const student = await login('student@preview.midad.test');
  const schedule = await request.post('http://127.0.0.1:4000/api/sessions/schedule', { headers: { Authorization: `Bearer ${teacher.token}` }, data: { courseId: 'preview-arabic', title: 'حصة التقويم التجريبية', scheduledAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 45 } });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  await page.addInitScript(token => localStorage.setItem('token', token), student.token);
  await page.goto('/student');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'إضافة حصة التقويم التجريبية للتقويم', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('midad-class.ics');
  const stream = await file.createReadStream();
  let text = ''; for await (const chunk of stream!) text += chunk.toString();
  expect(text).toContain('BEGIN:VEVENT'); expect(text).toContain('SUMMARY:حصة التقويم التجريبية');
  expect(text).toContain('DTSTART:'); expect(text).toContain('/courses/preview-arabic/lessons');
});


test('a full course shows its active count and blocks enrollment on mobile', async ({ page, request }) => {
  const login = async (email: string) => (await (await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email, password: 'MidadPreview2026!' } })).json()).data;
  const teacher = await login('teacher@preview.midad.test');
  const student = await login('student@preview.midad.test');
  const created = await request.post('http://127.0.0.1:4000/api/courses', { headers: { Authorization: `Bearer ${teacher.token}` }, data: { title: 'Full course browser fixture', description: 'A full course for a real UI test.', ageGroup: '8-10', price: 0, maxStudents: 1 } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const course = (await created.json()).data;
  const registered = await request.post('http://127.0.0.1:4000/api/auth/register', { data: { email: 'capacity-browser@midad.test', name: 'Capacity student', role: 'STUDENT', age: 10, password: 'MidadPreview2026!' } });
  expect(registered.ok()).toBeTruthy();
  const other = await login('capacity-browser@midad.test');
  expect((await request.post('http://127.0.0.1:4000/api/enrollments', { headers: { Authorization: `Bearer ${other.token}` }, data: { courseId: course.id } })).ok()).toBeTruthy();
  await page.addInitScript(token => localStorage.setItem('token', token), student.token);
  await page.goto('/courses');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: course.title, exact: true }) });
  await expect(card.getByRole('button', { name: 'اكتملت المقاعد', exact: true })).toBeDisabled();
  await expect(card).toContainText('1 student');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
});


test('a student can retry joining after a connection failure without leaving the classroom page', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email: 'student@preview.midad.test', password: 'MidadPreview2026!' } });
  const token = (await login.json()).data.token;
  await page.addInitScript(value => localStorage.setItem('token', value), token);
  let attempts = 0;
  await page.route('**/api/sessions/join', route => {
    attempts++;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'This class is not live' }) });
  });
  await page.goto('/classroom/preview-arabic');
  await page.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('الحصة غير مباشرة الآن');
  expect(attempts).toBe(1);
  await page.getByRole('button', { name: 'إعادة دخول الحصة', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(/classroom\/preview-arabic/);
  await page.getByRole('button', { name: 'الرجوع للوحة التحكم', exact: true }).click();
  await expect(page).toHaveURL(/student/);
});
