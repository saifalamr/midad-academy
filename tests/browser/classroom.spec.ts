import { test, expect, type Page } from '@playwright/test';

test.skip(!process.env.RUN_CLASSROOM_TEST, 'Requires the local LiveKit server; run the classroom verification command.');

test('teacher and student exchange real media, synchronized ink, permissions and late-join material', async ({ browser, request }) => {
  test.setTimeout(120000);
  const login = async (email: string) => {
    const res = await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email, password: 'MidadPreview2026!' } });
    expect(res.ok()).toBeTruthy(); return (await res.json()).data.token as string;
  };
  const teacherToken = await login('teacher@preview.midad.test');
  const studentToken = await login('student@preview.midad.test');
  const api = async (method: 'post' | 'patch', path: string, token: string, data: unknown) => {
    const res = await request[method](`http://127.0.0.1:4000${path}`, { headers: { Authorization: `Bearer ${token}` }, data });
    expect(res.ok(), await res.text()).toBeTruthy(); return res.json();
  };
  await api('post', '/api/enrollments', studentToken, { courseId: 'preview-arabic' });
  const scheduled = await api('post', '/api/sessions/schedule', teacherToken, { courseId: 'preview-arabic', title: 'Verified classroom', scheduledAt: new Date().toISOString() });
  await api('patch', `/api/sessions/${scheduled.data.id}/start`, teacherToken, {});
  const teacherContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['camera', 'microphone'] });
  const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera', 'microphone'] });
  await teacherContext.addInitScript(token => localStorage.setItem('token', token), teacherToken);
  await studentContext.addInitScript(token => localStorage.setItem('token', token), studentToken);
  const teacher = await teacherContext.newPage(); const student = await studentContext.newPage();
  const errors: string[] = [];
  for (const page of [teacher, student]) page.on('pageerror', e => errors.push(e.message));
  const enter = async (page: Page) => {
    await page.goto('/classroom/preview-arabic');
    await page.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
    await expect(page.getByText('متزامنة', { exact: true })).toBeVisible();
  };
  await enter(teacher); await enter(student);
  await teacher.getByRole('button', { name: 'تشغيل الكاميرا' }).click();
  await student.getByRole('button', { name: 'تشغيل الكاميرا' }).click();
  await teacher.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  await student.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  const remoteMedia = (page: Page) => page.evaluate(() => {
    const videos = [...document.querySelectorAll('video')].filter(v => v.videoWidth > 0 && v.readyState >= 2);
    const audio = [...document.querySelectorAll('audio')].filter(a => a.srcObject instanceof MediaStream && a.srcObject.getAudioTracks().some(t => t.readyState === 'live'));
    return { videos: videos.length, audio: audio.length };
  });
  await expect.poll(async () => (await remoteMedia(student)).videos).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await remoteMedia(teacher)).videos).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await remoteMedia(student)).audio).toBeGreaterThan(0);
  await expect.poll(async () => (await remoteMedia(teacher)).audio).toBeGreaterThan(0);
  const ink = (page: Page) => page.locator('canvas.lower-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    let count = 0; for (let i=0; i<pixels.length; i+=4) if (pixels[i] < 100 && pixels[i+1] < 120 && pixels[i+2] > 50 && pixels[i+3] > 100) count++;
    return count;
  });
  const placeShape = async (page: Page, title: string, offset: number) => {
    await page.getByTitle(title, { exact: true }).click();
    const canvas = page.locator('canvas.upper-canvas'); const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * offset, box.y + box.height * .5);
  };
  expect(await ink(student)).toBe(0);
  await placeShape(teacher, 'مستطيل', .5);
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  await teacher.getByRole('button', { name: 'تراجع', exact: true }).click();
  await expect.poll(() => ink(student)).toBe(0);
  await teacher.getByRole('button', { name: 'إعادة', exact: true }).click();
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  const me = await request.get('http://127.0.0.1:4000/api/auth/me', { headers: { Authorization: `Bearer ${studentToken}` } });
  const studentId = (await me.json()).data.id;
  await api('post', '/api/sessions/drawing-permission', teacherToken, { roomName: 'preview-arabic', studentId, canDraw: true });
  // Re-entry restores the saved drawing grant.
  await student.reload(); await student.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(student.getByText('متزامنة', { exact: true })).toBeVisible();
  await expect(student.getByText('مشاهدة فقط')).toHaveCount(0);
  const before = await ink(teacher);
  await Promise.all([placeShape(teacher, 'دائرة', .25), placeShape(student, 'مستطيل', .75)]);
  await expect.poll(() => ink(teacher)).toBeGreaterThan(before + 100);
  await api('patch', '/api/sessions/state/preview-arabic', teacherToken, { sharedDoc: { url: '', name: 'درس متزامن', docType: 'html', htmlContent: '<h1 dir="rtl">مرحباً</h1>' }, pdfPage: 1 });
  await expect(teacher.getByText('درس متزامن', { exact: true })).toBeVisible();
  await student.reload(); await student.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(student.getByText('درس متزامن', { exact: true })).toBeVisible();
  await expect(student.frameLocator('iframe[title="درس متزامن"]').getByText('مرحباً')).toBeVisible();
  for (const size of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }, { width: 1440, height: 900 }]) {
    await teacher.setViewportSize(size);
    await teacher.getByRole('button', { name: 'السبورة', exact: true }).click();
    await expect(teacher.locator('.board-paper')).toBeVisible();
    const box = (await teacher.locator('.board-paper').boundingBox())!;
    expect(box.width).toBeGreaterThan(250); expect(box.height).toBeGreaterThan(180);
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(teacher.getByRole('button', { name: 'كتم الصوت', exact: true })).toBeVisible();
    await teacher.screenshot({ path: `test-results/classroom-${size.width}.png` });
    await teacher.getByRole('button', { name: 'المحتوى', exact: true }).click();
    await expect(teacher.frameLocator('iframe[title="درس متزامن"]').getByText('مرحباً')).toBeVisible();
  }
  await teacher.getByRole('button', { name: 'السبورة', exact: true }).click();
  expect(await ink(teacher)).toBeGreaterThan(before + 100);
  await teacher.getByRole('button', { name: 'إضافة محتوى', exact: true }).click();
  await teacher.getByRole('button', { name: 'رفع ملف', exact: true }).click();
  await teacher.locator('#class-file').setInputFiles({ name: 'نشاط.html', mimeType: 'text/html', buffer: Buffer.from('<h1>نشاط جديد</h1>') });
  await expect(teacher.frameLocator('iframe[title="نشاط.html"]').getByText('نشاط جديد')).toBeVisible();
  await expect(student.frameLocator('iframe[title="نشاط.html"]').getByText('نشاط جديد')).toBeVisible();
  await api('post', '/api/sessions/end' , teacherToken, { roomName: 'preview-arabic' });
  await expect(student).toHaveURL(/\/student/);
  expect(errors).toEqual([]);
  await teacherContext.close(); await studentContext.close();
});
