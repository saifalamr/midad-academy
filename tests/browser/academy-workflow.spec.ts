import { test, expect } from '@playwright/test';

test('family chooses a course before login, adds a child, requests and receives approval in-site, and opens the unified class', async ({
  page,
  request,
  browser,
}) => {
  const password = 'MidadPreview2026!';
  const parentEmail = `family-${Date.now()}@midad.test`;
  const registration = await request.post('http://127.0.0.1:4000/api/auth/register', {
    data: {
      name: 'أسرة رحلة التسجيل',
      email: parentEmail,
      password,
      role: 'PARENT',
      whatsappPhone: '+905001234567',
    },
  });
  expect(registration.ok()).toBeTruthy();
  const adminLogin = await request.post('http://127.0.0.1:4000/api/auth/login', {
    data: { email: 'admin@preview.midad.test', password },
  });
  const adminToken = (await adminLogin.json()).data.token;
  const headers = { Authorization: `Bearer ${adminToken}` };
  const teacherRes = await request.post('http://127.0.0.1:4000/api/admin/teachers', {
    headers,
    data: {
      name: 'معلم رحلة التسجيل',
      email: `flow-${Date.now()}@midad.test`,
      password: 'TeacherTesting2026!',
    },
  });
  expect(teacherRes.ok()).toBeTruthy();
  const overview = (
    await (await request.get('http://127.0.0.1:4000/api/admin/overview', { headers })).json()
  ).data;
  const teacherUser = (await teacherRes.json()).data;
  const teacher = overview.teachers.find(
    (t: { user: { id: string } }) => t.user.id === teacherUser.id
  );
  const courseTitle = `رحلة الأسرة ${Date.now()}`;
  const courseRes = await request.post('http://127.0.0.1:4000/api/admin/courses', {
    headers,
    data: {
      title: courseTitle,
      description: 'دورة شهرية لتجربة رحلة التسجيل الجديدة',
      teacherId: teacher.id,
      ageGroup: '8–10',
      month: new Date().toISOString().slice(0, 7),
      timeZone: 'Europe/Istanbul',
      price: 25,
      maxStudents: 2,
    },
  });
  expect(courseRes.ok()).toBeTruthy();
  const course = (await courseRes.json()).data;
  await page.goto(`/academy?course=${course.id}`);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('البريد الإلكتروني أو اسم المستخدم', { exact: true }).fill(parentEmail);
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/academy\\?course=${course.id}`));
  await page.getByRole('button', { name: 'أبنائي ودخولهم', exact: true }).click();
  await page.getByLabel('اسم الطفل', { exact: true }).fill('نور رحلة التسجيل');
  await page.getByLabel('العمر', { exact: true }).fill('9');
  await page.getByRole('button', { name: 'إضافة الطفل', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('تم حفظ التحديث');
  await page.getByRole('button', { name: 'حسنًا', exact: true }).click();
  // Selected course remains attached to the intent while the family adds a child.
  await page.getByRole('button', { name: 'تسجيل وتجديد', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'الطفل', exact: true })
    .selectOption({ label: 'نور رحلة التسجيل — 9 سنوات' });
  await page.getByRole('combobox', { name: 'الدورة', exact: true }).selectOption(course.id);
  await page
    .getByLabel('ما الذي يعرفه طفلك بالعربية؟')
    .fill('يعرف الحروف ويحتاج مساعدة في القراءة');
  await page.getByRole('checkbox', { name: 'نحتاج مساعدة في تحديد المستوى قبل البداية' }).check();
  await page.getByRole('button', { name: 'إرسال طلب التسجيل', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('تم حفظ التحديث');
  await page.getByRole('button', { name: 'حسنًا', exact: true }).click();
  await expect(page.getByText('قيد مراجعة الإدارة', { exact: true })).toBeVisible();
  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await adminContext.addInitScript((token) => localStorage.setItem('token', token), adminToken);
  const admin = await adminContext.newPage();
  await admin.goto('/academy');
  await admin.getByRole('button', { name: 'طلبات التسجيل والدفع', exact: true }).click();
  const card = admin.locator('article').filter({
    has: admin.getByRole('heading', { name: `نور رحلة التسجيل · ${courseTitle}`, exact: true }),
  });
  await card.getByLabel('مرجع الدفع أو سبب الإعفاء').fill('وصل نقدي تجريبي 991');
  await card.getByLabel('رد يظهر للأسرة').fill('تم التسجيل؛ راجع الحصة القادمة');
  await card.getByRole('button', { name: 'حفظ القرار' }).click();
  await expect(admin.getByRole('alertdialog')).toContainText('تم حفظ التحديث');
  await admin.getByRole('button', { name: 'حسنًا', exact: true }).click();
  await page.getByRole('button', { name: 'تحديث البيانات' }).click();
  await expect(page.getByText('التسجيل مؤكد', { exact: true })).toBeVisible();
  await expect(page.getByText(/وصل نقدي تجريبي 991/)).toBeVisible();
  const scheduledAt = new Date(Date.now() + 7200000).toISOString();
  const sessionRes = await request.post(
    `http://127.0.0.1:4000/api/admin/courses/${course.id}/sessions`,
    { headers, data: { title: 'أول حصة للأسرة', scheduledAt, durationMinutes: 45 } }
  );
  expect(sessionRes.ok()).toBeTruthy();
  const session = (await sessionRes.json()).data;
  await page.goto(`/sessions/${session.id}`);
  await expect(page.getByRole('heading', { name: 'أول حصة للأسرة' })).toBeVisible();
  await expect(page.getByText(/زر الدخول يتاح عندما يبدأ المعلم/)).toBeVisible();
  await expect(page.getByText(/توقيت الأكاديمية:/)).toBeVisible();
  await page.goto('/academy');
  await expect(
    page.getByRole('heading', { name: 'دوراتك ومتابعة الشهر', exact: true })
  ).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    ).toBeTruthy();
  }
  await page.screenshot({ path: '/tmp/midad-workflow-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/midad-workflow-mobile.png', fullPage: true });
  await adminContext.close();
});
