import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
const script = buildSync({
  stdin: {
    contents: `import React from 'react';import {FeedbackProvider} from './apps/web/src/components/FeedbackProvider'; import {createRoot} from 'react-dom/client'; import ClassClock from './apps/web/src/components/ClassClock'; const root=createRoot(document.getElementById('clock-root')); let key=0; window.clockTest={remount:()=>root.render(React.createElement(FeedbackProvider,null,React.createElement(ClassClock,{key:++key,courseId:'clock-fixture',editable:true})))}; window.clockTest.remount();`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  jsx: 'automatic',
  format: 'iife',
  loader: { '.css': 'empty' },
  alias: { '@': process.cwd() + '/apps/web/src', 'next/navigation': process.cwd() + '/tests/browser/fixtures/navigation.ts' },
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('http://127.0.0.1:4000'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
}).outputFiles[0].text;
test('teacher sees persistent phases, validates the time distribution and uses the clock on mobile, tablet and desktop', async ({
  page,
}) => {
  let minutes = [8, 20, 8, 4],
    version = 0;
  const startedAt = new Date(Date.now() - 600_000).toISOString();
  await page.route('**/api/sessions/clock/clock-fixture', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.version).toBe(version);
      minutes = body.minutes;
      version++;
    }
    await route.fulfill({
      json: {
        data: {
          sessionId: 'fixture',
          startedAt,
          minutes,
          durationMinutes: 40,
          version,
          serverNow: new Date().toISOString(),
        },
      },
    });
  });
  await page.route('**/clock-test-harness', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head></head><body></body></html>',
    })
  );
  await page.goto('/clock-test-harness');
  await page.setContent(
    '<div class="midad room classroom-v2"><header class="room-top">الحصة</header><div id="clock-root" style="display:contents"></div><aside class="video-strip">الفيديو</aside><main class="board-wrap">السبورة</main><footer class="room-controls">أزرار الاتصال</footer></div>'
  );
  await page.addStyleTag({
    content:
      '*{box-sizing:border-box}body{margin:0}' +
      readFileSync('apps/web/src/app/classroom/[roomId]/classroom.css', 'utf8'),
  });
  await page.addStyleTag({
    content: readFileSync('apps/web/src/components/class-clock.css', 'utf8'),
  });
  await page.addScriptTag({ content: script });
  const clock = page.getByRole('region', { name: 'مؤقت مراحل الحصة' });
  await expect(clock.locator('.class-clock-head strong')).toHaveText('شرح الدرس الحالي');
  await clock.getByRole('button', { name: 'تعديل تقسيم الوقت' }).click();
  await clock.getByLabel('مراجعة الدرس السابق').fill('5');
  await expect(clock.getByRole('button', { name: 'حفظ التقسيم' })).toBeDisabled();
  await clock.getByLabel('شرح الدرس الحالي').fill('23');
  await clock.getByRole('button', { name: 'حفظ التقسيم' }).click();
  await expect(clock.locator('li[aria-current="step"]')).toContainText('شرح الدرس الحالي');
  await page.evaluate(() => (window as any).clockTest.remount());
  await expect(clock.locator('.class-clock-head strong')).toHaveText('شرح الدرس الحالي');
  await clock.getByRole('button', { name: 'تعديل تقسيم الوقت' }).click();
  await expect(clock.getByLabel('مراجعة الدرس السابق')).toHaveValue('5');
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    ).toBeTruthy();
    const bounds = await page.locator('.board-wrap').boundingBox();
    const clockBounds = await clock.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(clockBounds!.y + clockBounds!.height);
    expect(bounds!.height).toBeGreaterThan(100);
    await page.screenshot({ path: `test-results/class-clock-${width}.png` });
  }
});
