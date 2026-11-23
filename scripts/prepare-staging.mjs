// Idempotent staging fixture preparation; never use for production accounts.
import assert from 'node:assert/strict';

const api = process.env.API_URL;
if (process.env.STAGING_FIXTURES !== '1' || api !== 'https://midad-test-api.onrender.com')
  throw new Error('Use STAGING_FIXTURES=1 and the exact Medad test API URL.');
const { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_TEACHER_EMAIL, TEST_TEACHER_PASSWORD } =
  process.env;
for (const [name, value] of Object.entries({
  TEST_ADMIN_EMAIL,
  TEST_ADMIN_PASSWORD,
  TEST_TEACHER_EMAIL,
  TEST_TEACHER_PASSWORD,
}))
  if (!value) throw new Error(`${name} is required.`);
if (TEST_TEACHER_PASSWORD.length < 10)
  throw new Error('Teacher password must have at least 10 characters.');

async function request(path, method = 'GET', body, token) {
  const response = await fetch(`${api}${path}`, {
    method,
    signal: AbortSignal.timeout(70_000),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${result.error || 'request failed'}`);
  return result.data ?? result;
}
const ready = await request('/api/ready');
assert.equal(ready.status, 'ready');
const login = await request('/api/auth/login', 'POST', {
  email: TEST_ADMIN_EMAIL,
  password: TEST_ADMIN_PASSWORD,
});
assert.ok(login.token, 'Administrator login did not return a session token.');
const token = login.token;
let overview = await request('/api/admin/overview', 'GET', undefined, token);
let teacher = overview.teachers.find(
  (item) => item.user.email.toLowerCase() === TEST_TEACHER_EMAIL.toLowerCase()
);
if (!teacher) {
  await request(
    '/api/admin/teachers',
    'POST',
    {
      name: 'معلم تجربة مداد',
      email: TEST_TEACHER_EMAIL,
      password: TEST_TEACHER_PASSWORD,
    },
    token
  );
  overview = await request('/api/admin/overview', 'GET', undefined, token);
  teacher = overview.teachers.find(
    (item) => item.user.email.toLowerCase() === TEST_TEACHER_EMAIL.toLowerCase()
  );
}
assert.ok(teacher, 'Teacher fixture was not created.');
const parts = new Intl.DateTimeFormat('en', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
}).formatToParts(new Date());
const month = `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
const title = `دورة تجربة مداد ${month}`;
let course = overview.courses.find(
  (item) => item.title === title && item.teacher.id === teacher.id
);
if (!course) {
  await request(
    '/api/admin/courses',
    'POST',
    {
      title,
      description: 'دورة تجريبية لمسار ولي الأمر والطالب والمعلم، ببيانات وهمية قابلة للاستبدال.',
      teacherId: teacher.id,
      ageGroup: '8–10',
      month,
      timeZone: 'Europe/Istanbul',
      price: 0,
      maxStudents: 20,
    },
    token
  );
  overview = await request('/api/admin/overview', 'GET', undefined, token);
  course = overview.courses.find((item) => item.title === title && item.teacher.id === teacher.id);
}
assert.ok(course, 'Course fixture was not created.');
console.log(
  `Staging ready: teacher ${TEST_TEACHER_EMAIL}; course ${course.id} (${month}). No existing accounts were reset.`
);
