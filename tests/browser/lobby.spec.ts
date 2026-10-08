import { test, expect } from '@playwright/test';

test('lobby media controls work before joining and release preview devices', async ({ browser, request }) => {
  const login = await request.post('http://127.0.0.1:4000/api/auth/login', { data: { email: 'teacher@preview.midad.test', password: 'MidadPreview2026!' } });
  const token = (await login.json()).data.token;
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 390, height: 844 } });
  // This headless runtime cannot capture physical devices. Generate actual
  // MediaStream tracks to verify preview rendering and their full lifecycle.
  await context.addInitScript(value => {
    localStorage.setItem('token', value);
    const tracks: MediaStreamTrack[] = [];
    Object.assign(window, { previewTracks: tracks });
    navigator.mediaDevices.getUserMedia = async options => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      canvas.getContext('2d')!.fillRect(0, 0, 640, 480);
      const stream = options.audio ? new AudioContext().createMediaStreamDestination().stream : canvas.captureStream(5);
      tracks.push(...stream.getTracks()); return stream;
    };
  }, token);
  const page = await context.newPage();
  await page.route('**/api/sessions/upcoming', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ courseId: 'preview-arabic', title: 'حصة الحروف', scheduledAt: new Date().toISOString(), status: 'LIVE', teacherName: 'أستاذ مداد', course: { title: 'العربية للمبتدئين' } }] }) }));
  await page.goto('/classroom/preview-arabic');
  await expect(page.getByRole('heading', { name: 'حصة الحروف' })).toBeVisible();
  await expect(page.getByText('Preview Teacher', { exact: true }).last()).toBeVisible();
  const audio = page.getByRole('button', { name: /تشغيل الصوت/ });
  const camera = page.getByRole('button', { name: /تشغيل الكاميرا/ });
  await expect(audio).toHaveAttribute('aria-pressed', 'false');
  await expect(camera).toHaveAttribute('aria-pressed', 'false');
  for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await expect(audio).toBeVisible(); await expect(camera).toBeVisible();
    await page.screenshot({ path: `test-results/lobby-${width}.png`, fullPage: true });
  }
  await audio.click();
  await expect(page.getByRole('button', { name: /كتم الصوت/ })).toHaveAttribute('aria-pressed', 'true');
  await camera.click();
  await expect(page.getByRole('button', { name: /إيقاف الكاميرا/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: /إيقاف الكاميرا/ }).click();
  await expect(camera).toHaveAttribute('aria-pressed', 'false');
  await camera.click();
  await expect(page.getByRole('button', { name: /إيقاف الكاميرا/ })).toHaveAttribute('aria-pressed', 'true');
  await page.route('**/api/sessions/create', route => route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }));
  await page.getByRole('button', { name: 'دخول الحصة', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('الحصة غير مباشرة');
  expect(await page.evaluate(() => (window as unknown as { previewTracks: MediaStreamTrack[] }).previewTracks.every(t => t.readyState === 'ended'))).toBeTruthy();
  await context.close();
});

test('denied media permissions show recovery and still allow joining muted', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.goto('/classroom/preview-arabic');
  await page.getByRole('button', { name: /تشغيل الصوت/ }).click();
  await expect(page.locator('p[role=alert]')).toContainText('الإذن مرفوض');
  await expect(page.getByRole('button', { name: /تشغيل الصوت/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'دخول الحصة', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /تشغيل الكاميرا/ }).click();
  await expect(page.locator('p[role=alert]')).toContainText('الإذن مرفوض');
  await expect(page.getByRole('button', { name: /تشغيل الكاميرا/ })).toHaveAttribute('aria-pressed', 'false');
});
