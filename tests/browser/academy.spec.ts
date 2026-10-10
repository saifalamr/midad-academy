import { test, expect } from '@playwright/test';

test('mobile student login, enrollment, quiz and account linking code', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('student@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.locator('main').getByText('Preview Student', { exact: true })).toBeVisible();
  await page.goto('/courses');
  await expect(
    page.getByText('Arabic Foundations · أساسيات العربية', { exact: true })
  ).toBeVisible();
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Arabic Foundations · أساسيات العربية', exact: true }),
  });
  await expect(card.getByRole('link', { name: 'عرض المواد' })).toBeVisible();
  await expect(card.getByRole('button', { name: /Enroll/ })).toHaveCount(0);
  await page.goto('/courses/preview-arabic/lessons');
  await expect(page.getByText('First Arabic words', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ملاحظاتي', exact: true }).click();
  await page.getByLabel('ملاحظتك الخاصة لهذا الدرس').fill('تعلمت أن مرحباً تعني Hello');
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ الملاحظة');
  await page.getByRole('button', { name: 'تحديد كمكتمل', exact: true }).click();
  await expect(page.getByRole('button', { name: 'مكتمل · إلغاء الإنجاز' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'مكتمل · إلغاء الإنجاز' })).toBeVisible();
  await page.getByRole('button', { name: 'ملاحظاتي', exact: true }).click();
  await expect(page.getByLabel('ملاحظتك الخاصة لهذا الدرس')).toHaveValue(
    'تعلمت أن مرحباً تعني Hello'
  );
  await page.getByLabel('عرض الدروس').selectOption('todo');
  await expect(page.getByText('لا توجد دروس تطابق البحث أو الفلتر.')).toBeVisible();
  await page.getByLabel('عرض الدروس').selectOption('all');
  await page.getByLabel('ابحث عن درس').fill('not-a-lesson');
  await expect(page.getByText('لا توجد دروس تطابق البحث أو الفلتر.')).toBeVisible();
  await page.getByLabel('ابحث عن درس').fill('');
  await page.getByRole('button', { name: 'مكتمل · إلغاء الإنجاز' }).click();
  await page.getByLabel('ملاحظتك الخاصة لهذا الدرس').fill('ملاحظة تبقى هنا عند تعذر الحفظ');
  await page.route('**/api/learning/lessons/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'تعذر الحفظ، حاول مرة أخرى' }),
    })
  );
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذر الحفظ' })).toContainText(
    'تعذر الحفظ'
  );
  await expect(page.getByLabel('ملاحظتك الخاصة لهذا الدرس')).toHaveValue(
    'ملاحظة تبقى هنا عند تعذر الحفظ'
  );
  await page.unroute('**/api/learning/lessons/*');
  await page.getByRole('button', { name: 'حفظ الملاحظة', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('تم حفظ الملاحظة');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBeTruthy();
  await page.locator('textarea').blur();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/learning-workspace-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Take Quiz' }).click();
  await page.getByLabel('Hello', { exact: true }).check();
  await page.getByPlaceholder('Type your answer…').fill('مرحباً');
  await page.getByRole('button', { name: 'Submit Quiz' }).click();
  await expect(page.getByText('Pending Review', { exact: true })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'حساب الأسرة' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/student-account-mobile.png', fullPage: true });
});

test('teacher creates a course and sees students; logout protects the dashboard', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('#email').fill('teacher@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByRole('link', { name: 'عرض المنهج' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Create.*Class/ })).toHaveCount(0);
  await page.goto('/teacher/students');
  await expect(
    page.getByRole('cell', { name: 'Preview Student', exact: true }).first()
  ).toBeVisible();
  await page.getByLabel('البحث عن طالب').fill('nobody-with-this-name');
  await expect(page.getByText('لا يوجد طلاب يطابقون البحث.')).toBeVisible();
  await page.getByLabel('البحث عن طالب').fill('Preview Student');
  await expect(
    page.getByRole('cell', { name: 'Preview Student', exact: true }).first()
  ).toBeVisible();
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
  await expect(page.getByRole('button', { name: '+ Add Child' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'تحميل سجل الحضور الأخير' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBeTruthy();
});

test('public pages and password recovery are reachable', async ({ page }) => {
  for (const path of [
    '/about',
    '/curriculum',
    '/teachers',
    '/contact',
    '/help',
    '/terms',
    '/privacy',
    '/forgot-password',
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toBeVisible();
  }
});

test('student downloads a real scheduled class as a calendar event', async ({ page, request }) => {
  const login = async (email: string) =>
    (
      await (
        await request.post('http://127.0.0.1:4000/api/auth/login', {
          data: { email, password: 'MidadPreview2026!' },
        })
      ).json()
    ).data;
  const student = await login('student@preview.midad.test');
  const adminLogin = await request.post('http://127.0.0.1:4000/api/auth/login', {
    data: { email: 'admin@preview.midad.test', password: 'MidadPreview2026!' },
  });
  const adminToken = (await adminLogin.json()).data.token;
  const schedule = await request.post(
    'http://127.0.0.1:4000/api/admin/courses/preview-arabic/sessions',
    {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        title: 'حصة التقويم التجريبية',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 45,
      },
    }
  );
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  await page.addInitScript((token) => localStorage.setItem('token', token), student.token);
  await page.goto('/student');
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'إضافة حصة التقويم التجريبية للتقويم', exact: true })
    .click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('midad-class.ics');
  const stream = await file.createReadStream();
  let text = '';
  for await (const chunk of stream!) text += chunk.toString();
  expect(text).toContain('BEGIN:VEVENT');
  expect(text).toContain('SUMMARY:حصة التقويم التجريبية');
  expect(text).toContain('DTSTART:');
  expect(text).toContain('/courses/preview-arabic/lessons');
});

test('parent browses courses without student checkout controls', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill('parent@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/parent$/);
  await page.goto('/courses');
  await expect(page.getByRole('link', { name: 'طلب التسجيل عبر واتساب' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Enroll/ })).toHaveCount(0);
});

test('a student can retry joining after a connection failure without leaving the classroom page', async ({
  page,
  request,
}) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', {
    data: { email: 'student@preview.midad.test', password: 'MidadPreview2026!' },
  });
  const token = (await login.json()).data.token;
  await page.addInitScript((value) => localStorage.setItem('token', value), token);
  let attempts = 0;
  await page.route('**/api/sessions/join', (route) => {
    attempts++;
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'This class is not live' }),
    });
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

test('mobile quiz delivery retries one saved attempt, teacher feedback and final parent results persist', async ({
  browser,
  request,
}) => {
  const login = async (email: string) =>
    (
      await (
        await request.post('http://127.0.0.1:4000/api/auth/login', {
          data: { email, password: 'MidadPreview2026!' },
        })
      ).json()
    ).data;
  const admin = await login('admin@preview.midad.test');
  const teacher = await login('teacher@preview.midad.test');
  const student = await login('student@preview.midad.test');
  const parent = await login('parent@preview.midad.test');
  const post = async (url: string, data: unknown) => {
    const res = await request.post(`http://127.0.0.1:4000${url}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
      data,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json()).data;
  };
  const lesson = await post('/api/courses/preview-arabic/lessons', {
    title: 'Written feedback lesson',
    description: 'Mobile grading verification',
    type: 'EXERCISE',
    contentUrl: 'https://example.com/feedback',
    duration: 10,
  });
  const quiz = await post(`/api/content/${lesson.id}/quiz`, {
    title: 'Mobile feedback quiz',
    passingScore: 70,
  });
  await post(`/api/quiz/${quiz.id}/questions`, {
    text: 'اكتب جملة عربية',
    questionType: 'WRITTEN',
    points: 2,
  });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const teacherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const parentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const [context, token] of [
    [studentContext, student.token],
    [teacherContext, teacher.token],
    [parentContext, parent.token],
  ] as const)
    await context.addInitScript((value) => localStorage.setItem('token', value), token);
  const studentPage = await studentContext.newPage();
  const teacherPage = await teacherContext.newPage();
  const parentPage = await parentContext.newPage();
  await studentPage.goto('/courses/preview-arabic/lessons');
  await studentPage
    .getByRole('article')
    .filter({
      has: studentPage.getByRole('heading', { name: 'Written feedback lesson', exact: true }),
    })
    .getByRole('button', { name: 'Take Quiz' })
    .click();
  await studentPage.getByRole('button', { name: 'Submit Quiz', exact: true }).click();
  await expect(
    studentPage.getByRole('alert').filter({ hasText: 'أجب عن جميع الأسئلة' })
  ).toBeVisible();
  await studentPage.getByLabel('إجابتك: اكتب جملة عربية', { exact: true }).fill('مرحباً يا معلم');
  let delivered = false;
  const keys: string[] = [];
  await studentPage.route(`**/api/quiz/${quiz.id}/submit`, async (route) => {
    keys.push(route.request().postDataJSON().submissionKey);
    if (!delivered) {
      delivered = true;
      const actual = await route.fetch();
      expect(actual.ok()).toBeTruthy();
      await route.abort('failed');
    } else await route.continue();
  });
  await studentPage.getByRole('button', { name: 'Submit Quiz', exact: true }).click();
  await expect(
    studentPage.getByRole('alert').filter({ hasText: 'تعذر تأكيد التسليم' })
  ).toBeVisible();
  await studentPage.getByRole('button', { name: 'Submit Quiz', exact: true }).click();
  await expect(studentPage.getByText('Pending Review', { exact: true })).toBeVisible();
  expect(keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  const results = await request.get('http://127.0.0.1:4000/api/students/results', {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  expect((await results.json()).data.filter((result) => result.quizId === quiz.id)).toHaveLength(1);
  const parentResponse = parentPage.waitForResponse((response) =>
    response.url().includes('/api/parent/overview')
  );
  await parentPage.goto(`/parent?verification=${quiz.id}`);
  const parentData = await (await parentResponse).json();
  expect(parentData.data.children[0].quizResults, JSON.stringify(parentData)).toEqual(
    expect.arrayContaining([expect.objectContaining({ quizTitle: 'Mobile feedback quiz' })])
  );
  const familyResults = parentPage
    .locator('.family-course')
    .filter({ has: parentPage.getByText('Mobile feedback quiz', { exact: true }) });
  await expect(familyResults.getByText('Mobile feedback quiz', { exact: true })).toBeVisible();
  await expect(familyResults).toContainText('بانتظار تصحيح المعلم');
  await teacherPage.goto('/teacher/review-answers');
  const answerCard = teacherPage
    .locator('.card.pad')
    .filter({ has: teacherPage.getByText('اكتب جملة عربية', { exact: true }) })
    .filter({ has: teacherPage.getByRole('button', { name: 'Mark as Graded', exact: true }) });
  await answerCard.getByLabel('Feedback', { exact: false }).fill('أحسنت، جملة واضحة');
  await expect(answerCard.getByRole('spinbutton')).toHaveValue('2'); // Feedback alone preserves the default grade.
  await answerCard.getByRole('spinbutton').fill('1.5');
  await answerCard.getByRole('button', { name: 'Mark as Graded', exact: true }).click();
  await expect(teacherPage.getByRole('alert').filter({ hasText: 'must be between' })).toBeVisible();
  await answerCard.getByRole('spinbutton').fill('2');
  await answerCard.getByRole('button', { name: 'Mark as Graded', exact: true }).click();
  await expect(answerCard).toHaveCount(0);
  await studentPage.goto('/student');
  const ownResult = studentPage
    .locator('li')
    .filter({ has: studentPage.getByText('Mobile feedback quiz', { exact: true }) });
  await expect(ownResult).toContainText('Score: 100%');
  await expect(ownResult).toContainText('أحسنت، جملة واضحة');
  await parentPage.reload();
  await expect(familyResults).toContainText('الدرجة النهائية: 100%');
  expect(
    await teacherPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBeTruthy();
  await studentContext.close();
  await teacherContext.close();
  await parentContext.close();
});

test('signed-in home stays a workspace across navigation, reloads and connection failures', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('#email').fill('teacher@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole('link', { name: 'الرئيسية', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'أهلاً، Preview Teacher' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create an account', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'فتح صفوفي وحصصي', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'أهلاً، Preview Teacher' })).toBeVisible();
  for (const [label, width, height] of [
    ['desktop', 1440, 900],
    ['tablet', 1024, 768],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/workspace-${label}.png`, fullPage: true });
  }
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Offline"}' })
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'تعذر تحميل حسابك' })).toBeVisible();
  expect(await page.evaluate(() => !!localStorage.getItem('token'))).toBeTruthy();
  await expect(page.getByRole('link', { name: 'Create an account', exact: true })).toHaveCount(0);
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: 'إعادة المحاولة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'أهلاً، Preview Teacher' })).toBeVisible();
  await page.getByRole('button', { name: 'Log out · خروج', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Create an account', exact: true }).first()
  ).toBeVisible();
});

test('session-only login survives home reload and expires on a confirmed unauthorized response', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('#email').fill('student@preview.midad.test');
  await page.locator('#password').fill('MidadPreview2026!');
  await page.getByLabel('Remember me', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await page.getByRole('link', { name: 'الرئيسية', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'أهلاً، Preview Student' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'أهلاً، Preview Student' })).toBeVisible();
  expect(
    await page.evaluate(() => !localStorage.getItem('token') && !!sessionStorage.getItem('token'))
  ).toBeTruthy();
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
  );
  await page.reload();
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  await expect(page.getByRole('link', { name: 'Log in', exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('token'))).toBeNull();
});
