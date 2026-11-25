// Disposable, staging-only journey. Credentials come from GitHub Actions secrets.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from '@playwright/test';
import { chromiumPath } from './chromium.mjs';

const mode = process.env.HOSTED_TEST_MODE;
const api = new URL(process.env.API_URL || '');
const web = new URL(process.env.WEB_URL || '');
if (mode === 'staging') {
  assert.equal(api.origin, 'https://midad-test-api.onrender.com');
  assert.equal(web.origin, 'https://midad-academy-preview.vercel.app');
} else if (mode === 'local') {
  assert.equal(api.origin, 'http://127.0.0.1:4000');
  assert.equal(web.origin, 'http://127.0.0.1:3000');
} else throw new Error('Set HOSTED_TEST_MODE to staging or local.');
assert.equal(api.pathname, '/');
assert.equal(web.pathname, '/');
if (!process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD)
  throw new Error('TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are required.');

const unique = randomUUID().slice(0, 12);
const password = () => `Sm0ke-${randomBytes(20).toString('hex')}!`;
const deadline = Date.now() + 8 * 60_000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, { method = 'GET', body, token, base = web } = {}) {
  return fetch(new URL(path, base), {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(70_000),
    headers: {
      ...(body ? { 'content-type': 'application/json', origin: web.origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function data(path, options = {}, expected = 200) {
  const response = await request(path, options);
  assert.equal(response.status, expected, `${options.method || 'GET'} ${path}: HTTP ${response.status}`);
  return (await response.json()).data;
}
async function login(email, accountPassword) {
  const result = await data('/api/auth/login', { method: 'POST', body: { email, password: accountPassword } });
  assert.ok(result.token, 'Login did not return an API token.');
  return result.token;
}
async function parent(index) {
  const email = `writing-${unique}-${index}@midad.test`;
  const accountPassword = password();
  await data('/api/auth/register', {
    method: 'POST', body: {
      name: `أسرة اختبار الكتابة ${index}`, email, password: accountPassword,
      role: 'PARENT', whatsappPhone: '+12025550100', whatsappOptIn: false,
    },
  }, 201);
  return { email, password: accountPassword, token: await login(email, accountPassword) };
}
async function child(parentToken, name) {
  const created = await data('/api/academy/children', {
    method: 'POST', token: parentToken, body: { name, age: 9 },
  }, 201);
  const accountPassword = password();
  const credentials = await data(`/api/academy/children/${created.id}/password`, {
    method: 'POST', token: parentToken, body: { password: accountPassword },
  });
  return { id: created.id, token: await login(credentials.username, accountPassword) };
}
async function ready() {
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/ready', { base: api });
      if (response.status === 200) {
        const result = await response.json();
        if (result.status === 'ready' && (!process.env.EXPECTED_COMMIT || result.revision === process.env.EXPECTED_COMMIT)) {
          const proxy = await request('/api/ready');
          assert.equal(proxy.status, 200, 'Web-to-API proxy is not ready.');
          assert.equal((await proxy.json()).revision, result.revision, 'Web proxy points at another API revision.');
          return;
        }
      }
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
    await pause(12_000);
  }
  throw new Error('TEST API did not become ready at the expected commit.');
}

await ready();
const admin = await login(process.env.TEST_ADMIN_EMAIL, process.env.TEST_ADMIN_PASSWORD);
const teacherEmail = `writing-teacher-${unique}@midad.test`;
const teacherPassword = password();
await data('/api/admin/teachers', {
  method: 'POST', token: admin,
  body: { name: 'معلم اختبار الكتابة', email: teacherEmail, password: teacherPassword },
}, 201);
const overview = await data('/api/admin/overview', { token: admin });
const teacherId = overview.teachers.find((item) => item.user.email === teacherEmail)?.id;
assert.ok(teacherId, 'New TEST teacher is missing from the admin overview.');
const teacher = await login(teacherEmail, teacherPassword);
const family = await parent(0);
const otherFamily = await parent(1);
const first = await child(family.token, 'أحمد اختبار');
const second = await child(family.token, 'مريم اختبار');
const scheduledAt = new Date(Date.now() + 10 * 60_000);
const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).formatToParts(scheduledAt);
const month = `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
const course = await data('/api/admin/courses', {
  method: 'POST', token: admin,
  body: {
    title: `دورة اختبار الكتابة ${unique}`, description: 'دورة وهمية للتحقق من تقدم الكتابة لطفلين وعزل الأسر.',
    teacherId, ageGroup: '8–10', month, timeZone: 'Europe/Istanbul', price: 0, maxStudents: 2,
  },
}, 201);
for (const student of [first, second])
  await data(`/api/admin/courses/${course.id}/enrollments`, {
    method: 'POST', token: admin, body: { studentId: student.id },
  }, 201);
const session = await data(`/api/admin/courses/${course.id}/sessions`, {
  method: 'POST', token: admin,
  body: { title: 'حصة اختبار الكتابة', scheduledAt: scheduledAt.toISOString(), durationMinutes: 30 },
}, 201);
const tasks = [];
for (const [word, title] of [['باب', 'تدريب أحمد'], ['دار', 'تدريب مريم']]) {
  const template = await data('/api/writing/library', {
    method: 'POST', token: admin,
    body: { word, fontSize: 120, mode: 'SIMPLE', guides: [] },
  });
  tasks.push(await data(`/api/writing/sessions/${session.id}`, {
    method: 'POST', token: admin,
    body: { templateId: template.id, useAs: 'ACTIVITY', title },
  }, 201));
}

let started = false;
let ended = false;
try {
  await data(`/api/sessions/${session.id}/start`, { method: 'PATCH', token: teacher });
  started = true;
  for (const [index, student] of [first, second].entries())
    await data(`/api/writing/tasks/${tasks[index].id}/submit`, {
      method: 'POST', token: student.token,
      body: { strokes: [[{ x: 100, y: 120 }, { x: 240, y: 160 }]] },
    });
  await data('/api/sessions/end', { method: 'POST', token: teacher, body: { roomName: course.id } });
  ended = true;

  for (const [student, task] of [[first, tasks[0]], [second, tasks[1]]]) {
    const result = await data(`/api/writing/parent-progress?studentId=${student.id}`, { token: family.token });
    assert.deepEqual(result.map((item) => item.taskId), [task.id]);
    const stranger = await data(`/api/writing/parent-progress?studentId=${student.id}`, { token: otherFamily.token });
    assert.deepEqual(stranger, [], 'Another family can read a child’s writing progress.');
  }

  const executablePath = await chromiumPath();
  const browser = await playwrightChromium.launch({
    headless: true, executablePath,
    args: chromium.args.filter((arg) => !['--single-process', '--disable-web-security', '--allow-running-insecure-content'].includes(arg)),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(new URL('/login', web).href);
    await page.getByLabel('البريد الإلكتروني أو اسم المستخدم').fill(family.email);
    await page.getByLabel('كلمة المرور', { exact: true }).fill(family.password);
    await page.getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
    await page.getByRole('heading', { name: 'متابعة أبنائك' }).waitFor();
    await page.getByRole('button', { name: /أحمد اختبار/ }).click();
    await page.getByText('تدريب أحمد', { exact: true }).waitFor();
    assert.equal(await page.getByText('تدريب مريم', { exact: true }).count(), 0);
    await page.getByRole('button', { name: /مريم اختبار/ }).click();
    await page.getByText('تدريب مريم', { exact: true }).waitFor();
    assert.equal(await page.getByText('تدريب أحمد', { exact: true }).count(), 0);
  } finally { await browser.close(); }
  console.log('Hosted writing results, child switching and cross-family isolation passed.');
} finally {
  if (started && !ended) {
    try { await data('/api/sessions/end', { method: 'POST', token: teacher, body: { roomName: course.id } }); }
    catch { console.error('Could not close the TEST class after a failed check.'); }
  }
}
