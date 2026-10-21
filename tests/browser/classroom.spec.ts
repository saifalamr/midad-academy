import { test, expect, type Page } from '@playwright/test';

test.use({ actionTimeout: 20000 });

test.skip(
  !process.env.RUN_CLASSROOM_TEST,
  'Requires the local LiveKit server; run the classroom verification command.'
);

test('teacher and student exchange real media, synchronized ink, permissions and late-join material', async ({
  browser,
  request,
}) => {
  test.setTimeout(300000);
  const login = async (email: string) => {
    const res = await request.post('http://127.0.0.1:4000/api/auth/login', {
      data: { email, password: 'MidadPreview2026!' },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).data.token as string;
  };
  const teacherToken = await login('teacher@preview.midad.test');
  const studentToken = await login('student@preview.midad.test');
  const api = async (method: 'post' | 'patch', path: string, token: string, data: unknown) => {
    const res = await request[method](`http://127.0.0.1:4000${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
  };
  const adminToken = await login('admin@preview.midad.test');
  const scheduled = await api('post', '/api/admin/courses/preview-arabic/sessions', adminToken, {
    title: 'Verified classroom',
    scheduledAt: new Date(Date.now() + 60000).toISOString(),
    durationMinutes: 50,
  });
  await api('patch', `/api/sessions/${scheduled.data.id}/start`, teacherToken, {});
  const teacherContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['camera', 'microphone'],
  });
  // Generate moving video and a speech-like tone in this device-less runtime.
  // Media still travels through LiveKit/WebRTC and is decoded by the peer.
  for (const context of [teacherContext, studentContext])
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = new MediaStream();
        if (constraints.video) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext('2d')!;
          let frame = 0;
          const draw = () => {
            ctx.fillStyle = '#18365f';
            ctx.fillRect(0, 0, 640, 360);
            ctx.fillStyle = '#c9922a';
            ctx.fillRect((frame++ * 8) % 600, 80, 40, 100);
          };
          draw();
          const timer = setInterval(draw, 100);
          const track = canvas.captureStream(10).getVideoTracks()[0];
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
          stream.addTrack(track);
        }
        if (constraints.audio) {
          const context = new AudioContext();
          const source = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          source.connect(destination);
          source.start();
          const track = destination.stream.getAudioTracks()[0];
          const stop = track.stop.bind(track);
          let stopped = false;
          track.stop = () => {
            if (stopped) return;
            stopped = true;
            source.stop();
            if (context.state !== 'closed') void context.close().catch(() => {});
            stop();
          };
          stream.addTrack(track);
        }
        return stream;
      };
    });
  await teacherContext.addInitScript((token) => localStorage.setItem('token', token), teacherToken);
  await studentContext.addInitScript((token) => localStorage.setItem('token', token), studentToken);
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  const errors: string[] = [];
  for (const page of [teacher, student])
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.error('Classroom page error:', e.message);
    });
  for (const page of [teacher, student]) {
    const scrub = (value: string) =>
      value.replace(/(access_token|token)=[^&\s]+/g, '$1=[redacted]');
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        console.error('Browser:', scrub(message.text()));
    });
    page.on('response', async (response) => {
      if (response.request().method() !== 'GET' || !response.url().includes('/api/writing/tasks/'))
        return;
      const json = await response.json().catch(() => null);
      console.log('Writing access:', response.status(), {
        staff: json?.data?.staff,
        canSubmit: json?.data?.canSubmit,
        attempts: json?.data?.attempts?.length,
        error: json?.error,
      });
    });
    page.on('requestfailed', (request) =>
      console.error('Network:', scrub(request.url()), request.failure()?.errorText)
    );
    page.on('websocket', (socket) =>
      socket.on('socketerror', (error) => console.error('Socket:', error))
    );
  }

  const enter = async (page: Page) => {
    await page.goto('/classroom/preview-arabic');
    await page.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
    try {
      await expect(page.getByText('متزامنة', { exact: true })).toBeVisible({ timeout: 20000 });
    } catch (error) {
      console.error('Classroom entry state:', await page.locator('body').innerText());
      throw error;
    }
  };
  await enter(teacher);
  await enter(student);
  await teacher.getByRole('button', { name: 'تشغيل الكاميرا' }).click();
  await student.getByRole('button', { name: 'تشغيل الكاميرا' }).click();
  await teacher.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  await expect(student.getByRole('button', { name: 'المايك مقفول من المعلم' })).toBeDisabled();
  await teacher.getByRole('button', { name: 'مايكات الطلاب', exact: true }).click();
  const microphones = teacher.getByRole('dialog', { name: 'إدارة مايكات الطلاب' });
  await microphones
    .getByRole('button', { name: 'السماح بالكلام لـ Preview Student', exact: true })
    .click();
  await expect(student.getByRole('button', { name: 'تشغيل الصوت', exact: true })).toBeEnabled();
  await microphones.getByRole('button', { name: 'إغلاق إدارة المايكات' }).click();
  await student.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  const remoteMedia = (page: Page) =>
    page.evaluate(() => {
      const videos = [...document.querySelectorAll('video')].filter(
        (v) => v.videoWidth > 0 && v.readyState >= 2
      );
      const audio = [...document.querySelectorAll('audio')].filter(
        (a) =>
          a.srcObject instanceof MediaStream &&
          a.srcObject.getAudioTracks().some((t) => t.readyState === 'live')
      );
      return { videos: videos.length, audio: audio.length };
    });
  await expect.poll(async () => (await remoteMedia(student)).videos).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await remoteMedia(teacher)).videos).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await remoteMedia(student)).audio).toBeGreaterThan(0);
  await expect.poll(async () => (await remoteMedia(teacher)).audio).toBeGreaterThan(0);
  await teacher.getByRole('button', { name: 'مايكات الطلاب', exact: true }).click();
  await microphones.getByRole('button', { name: 'قفل مايكات الجميع', exact: true }).click();
  await expect(student.getByRole('button', { name: 'المايك مقفول من المعلم' })).toBeDisabled();
  await expect.poll(async () => (await remoteMedia(teacher)).audio).toBe(0);
  await microphones
    .getByRole('button', { name: 'السماح بالكلام لـ Preview Student', exact: true })
    .click();
  await expect(student.getByRole('button', { name: 'تشغيل الصوت', exact: true })).toBeEnabled();
  await expect.poll(async () => (await remoteMedia(teacher)).audio).toBe(0);
  await student.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  await expect.poll(async () => (await remoteMedia(teacher)).audio).toBeGreaterThan(0);
  await microphones.getByRole('button', { name: 'إغلاق إدارة المايكات' }).click();
  const attendance = await request.get(
    `http://127.0.0.1:4000/api/admin/sessions/${scheduled.data.id}/details`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  expect(attendance.ok(), await attendance.text()).toBeTruthy();
  const details = (await attendance.json()).data;
  expect(details.teacher.present).toBe(true);
  expect(details.teacher.hasJoined).toBe(true);
  expect(details.students[0].present).toBe(true);
  // Permission state exposes host ICE candidates for this loopback-only test server.
  // Observer grants still prohibit publishing, and the test checks zero capture requests.
  const adminContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    permissions: ['camera', 'microphone'],
  });
  await adminContext.addInitScript((token) => localStorage.setItem('token', token), adminToken);
  const administrator = await adminContext.newPage();
  await administrator.goto(`/admin/sessions/${scheduled.data.id}/details`);
  await expect(administrator.getByRole('region', { name: 'حضور المعلم' })).toContainText(
    'داخل الحصة الآن'
  );
  await administrator.getByRole('link', { name: 'مراقبة الحصة', exact: true }).click();
  await administrator.getByRole('button', { name: 'دخول للمشاهدة', exact: true }).click();
  await expect(
    administrator.getByText('وضع المشاهدة · بدون كاميرا أو ميكروفون أو تفاعل')
  ).toBeVisible();
  await expect(teacher.locator('.rt-count')).toContainText('2');
  await expect(student.locator('.rt-count')).toContainText('2');
  await expect(
    administrator.getByRole('button', { name: 'مايكات الطلاب', exact: true })
  ).toHaveCount(0);
  await expect
    .poll(async () => (await remoteMedia(administrator)).videos, { timeout: 20000 })
    .toBeGreaterThanOrEqual(2);
  await adminContext.close();
  const parentContext = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    permissions: ['camera', 'microphone'],
  });
  await parentContext.addInitScript(
    (token) => {
      localStorage.setItem('token', token);
      (window as any).__deviceRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        (window as any).__deviceRequests++;
        throw new Error('An observer must never request devices');
      };
    },
    await login('parent@preview.midad.test')
  );
  const parent = await parentContext.newPage();
  await parent.goto('/classroom/preview-arabic');
  await parent.getByRole('button', { name: 'دخول للمشاهدة', exact: true }).click();
  await expect(parent.getByText('وضع المشاهدة · بدون كاميرا أو ميكروفون أو تفاعل')).toBeVisible();
  await expect
    .poll(async () => (await remoteMedia(parent)).videos, { timeout: 20000 })
    .toBeGreaterThanOrEqual(2);
  await expect.poll(async () => (await remoteMedia(parent)).audio).toBeGreaterThan(0);
  await expect(parent.getByRole('button', { name: 'تشغيل الكاميرا', exact: true })).toHaveCount(0);
  await expect(parent.getByRole('button', { name: 'مايكات الطلاب', exact: true })).toHaveCount(0);
  expect(await parent.evaluate(() => (window as any).__deviceRequests)).toBe(0);
  await expect(teacher.locator('.rt-count')).toContainText('2');
  await parentContext.close();

  const videoFrames = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLVideoElement>('.video-strip video')].map(
        (v) => v.getVideoPlaybackQuality().totalVideoFrames
      )
    );
  const expectMovingVideo = async (page: Page) => {
    const before = await videoFrames(page);
    await expect
      .poll(
        async () => {
          const after = await videoFrames(page);
          return after.length >= 2 && before.every((count, i) => after[i] > count + 3);
        },
        { timeout: 15000 }
      )
      .toBeTruthy();
  };
  await expectMovingVideo(teacher);
  await expectMovingVideo(student);
  const template = await api('post', '/api/writing/library', teacherToken, {
    word: 'مطر',
    mode: 'SIMPLE',
    fontSize: 120,
    guides: [],
  });
  await api('post', `/api/writing/sessions/${scheduled.data.id}`, teacherToken, {
    templateId: template.data.id,
    title: 'كتابة أثناء المكالمة',
    useAs: 'ACTIVITY',
  });
  await student.getByRole('button', { name: 'نتدرّب على الكتابة', exact: true }).click();
  const writing = student.frameLocator('iframe[title="تمارين كتابة الحصة"]');
  await writing.getByRole('link', { name: 'فتح تمرين الكتابة', exact: true }).click();
  const board = writing.getByRole('img', { name: 'لوحة تتبّع الكلمة', exact: true });
  try {
    await expect(
      writing.getByRole('heading', { name: 'كتابة أثناء المكالمة', exact: true })
    ).toBeVisible({ timeout: 15000 });
    await expect(board).toBeVisible({ timeout: 15000 });
    await board.scrollIntoViewIfNeeded();
  } catch (error) {
    console.error('Writing frame:', await writing.locator('body').innerText());
    throw error;
  }
  const writingBox = (await board.boundingBox())!;
  await student.mouse.move(
    writingBox.x + writingBox.width * 0.7,
    writingBox.y + writingBox.height * 0.5
  );
  await student.mouse.down();
  await student.mouse.move(
    writingBox.x + writingBox.width * 0.3,
    writingBox.y + writingBox.height * 0.55,
    { steps: 12 }
  );
  await student.mouse.up();
  await writing.getByRole('button', { name: 'تسليم محاولة الكتابة', exact: true }).click();
  await expect(writing.getByText('حُفظت المحاولة وسُلّمت للمعلم.', { exact: true })).toBeVisible();
  await expect.poll(async () => (await remoteMedia(teacher)).audio).toBeGreaterThan(0);
  await student.getByRole('button', { name: 'إغلاق والعودة للمكالمة', exact: true }).click();
  await expectMovingVideo(teacher);
  await expectMovingVideo(student);
  const ink = (page: Page) =>
    page.locator('canvas.lower-canvas').evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] < 100 && pixels[i + 1] < 120 && pixels[i + 2] > 50 && pixels[i + 3] > 100)
          count++;
      return count;
    });
  const placeShape = async (page: Page, title: string, offset: number) => {
    await page.getByTitle(title, { exact: true }).click();
    const canvas = page.locator('canvas.upper-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width * offset, box.y + box.height * 0.5);
  };
  expect(await ink(student)).toBe(0);
  await placeShape(teacher, 'مستطيل', 0.5);
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  await teacher.getByRole('button', { name: 'تراجع', exact: true }).click();
  await expect.poll(() => ink(student)).toBe(0);
  await teacher.getByRole('button', { name: 'إعادة', exact: true }).click();
  await expect.poll(() => ink(student)).toBeGreaterThan(20);
  const me = await request.get('http://127.0.0.1:4000/api/auth/me', {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const studentId = (await me.json()).data.id;
  await api('post', '/api/sessions/drawing-permission', teacherToken, {
    roomName: 'preview-arabic',
    studentId,
    canDraw: true,
  });
  // Re-entry restores the saved drawing grant.
  await student.reload();
  await enter(student);
  await student.getByRole('button', { name: 'تشغيل الكاميرا', exact: true }).click();
  await expect(student.getByRole('button', { name: 'تشغيل الصوت', exact: true })).toBeEnabled();
  await student.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  await expect(student.getByText('مشاهدة فقط')).toHaveCount(0);
  const before = await ink(teacher);
  await Promise.all([placeShape(teacher, 'دائرة', 0.25), placeShape(student, 'مستطيل', 0.75)]);
  await expect.poll(() => ink(teacher)).toBeGreaterThan(before + 100);
  await api('patch', '/api/sessions/state/preview-arabic', teacherToken, {
    sharedDoc: {
      url: '',
      name: 'درس متزامن',
      docType: 'html',
      htmlContent: '<h1 dir="rtl">مرحباً</h1>',
    },
    pdfPage: 1,
  });
  await expect(teacher.getByText('درس متزامن', { exact: true })).toBeVisible();
  await student.reload();
  await student.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(student.getByText('درس متزامن', { exact: true })).toBeVisible();
  await student.getByRole('button', { name: 'تشغيل الكاميرا', exact: true }).click();
  await expect(student.getByRole('button', { name: 'تشغيل الصوت', exact: true })).toBeEnabled();
  await student.getByRole('button', { name: 'تشغيل الصوت', exact: true }).click();
  await expect(student.getByText('درس متزامن', { exact: true })).toBeVisible();
  await expect(
    student.frameLocator('iframe[title="درس متزامن"]').getByText('مرحباً')
  ).toBeVisible();
  for (const size of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
    { width: 1440, height: 900 },
  ]) {
    await teacher.setViewportSize(size);
    await teacher.getByRole('button', { name: 'السبورة', exact: true }).click();
    await expect(teacher.locator('.board-paper')).toBeVisible();
    const box = (await teacher.locator('.board-paper').boundingBox())!;
    expect(box.width).toBeGreaterThan(250);
    expect(box.height).toBeGreaterThan(180);
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await expect(teacher.getByRole('button', { name: 'كتم الصوت', exact: true })).toBeVisible();
    await teacher.screenshot({ path: `test-results/classroom-${size.width}.png` });
    await teacher.getByRole('button', { name: 'المحتوى', exact: true }).click();
    await expect(
      teacher.frameLocator('iframe[title="درس متزامن"]').getByText('مرحباً')
    ).toBeVisible();
  }
  await expectMovingVideo(teacher);
  await expectMovingVideo(student);
  await teacher.getByRole('button', { name: 'السبورة', exact: true }).click();
  expect(await ink(teacher)).toBeGreaterThan(before + 100);
  await teacher.getByRole('button', { name: 'إضافة محتوى', exact: true }).click();
  await teacher.getByRole('button', { name: 'رفع ملف', exact: true }).click();
  await teacher.locator('#class-file').setInputFiles({
    name: 'نشاط.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<h1>نشاط جديد</h1>'),
  });
  await expect(
    teacher.frameLocator('iframe[title="نشاط.html"]').getByText('نشاط جديد')
  ).toBeVisible();
  await expect(
    student.frameLocator('iframe[title="نشاط.html"]').getByText('نشاط جديد')
  ).toBeVisible();
  await expect(teacher.getByRole('button', { name: 'إيقاف المشاركة', exact: true })).toBeVisible();
  await teacher.getByRole('button', { name: 'إيقاف المشاركة', exact: true }).click();
  await expect(student.getByRole('button', { name: 'المحتوى', exact: true })).toHaveCount(0);
  await expect(teacher.getByRole('button', { name: 'إيقاف المشاركة', exact: true })).toHaveCount(0);
  await expectMovingVideo(teacher);
  await expectMovingVideo(student);
  await api('post', '/api/sessions/end', teacherToken, { roomName: 'preview-arabic' });
  await expect(student.getByRole('heading', { name: 'انتهت الحصة', exact: true })).toBeVisible();
  await expect(student.locator('video')).toHaveCount(0);
  const after = await request.get(
    `http://127.0.0.1:4000/api/admin/sessions/${scheduled.data.id}/details`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  const completed = (await after.json()).data;
  expect(completed.teacher.hasJoined).toBe(true);
  expect(completed.teacher.present).toBe(false);
  expect(completed.students[0].entryCount).toBeGreaterThan(1);
  expect(completed.endedAt).toBeTruthy();

  await student.getByRole('button', { name: 'الرجوع للوحة التحكم', exact: true }).click();
  await expect(student).toHaveURL(/\/student/);
  expect(errors).toEqual([]);
  await teacherContext.close();
  await studentContext.close();
});
