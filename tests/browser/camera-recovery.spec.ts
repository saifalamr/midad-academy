import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('apps/web/src/lib/camera-recovery.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText;

async function setup(page: Page, mode: 'recover' | 'fail' = 'recover') {
  await page.setContent('<video muted autoplay playsinline style="width:320px;height:180px"></video>');
  await page.evaluate(async ({ source, mode }) => {
    const { monitorCamera } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const video = document.querySelector('video')!;
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    const ctx = canvas.getContext('2d')!; let frame = 0;
    const draw = () => { ctx.fillStyle = '#18365f'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#c9922a'; ctx.fillRect((frame++ * 8) % 280, 50, 40, 40); };
    draw(); let timer = window.setInterval(draw, 60);
    video.srcObject = canvas.captureStream(15); await video.play();
    const state = { restores: 0, stalled: false, enabled: true, cleaned: false };
    const stop = monitorCamera(video, {
      staleMs: 650, intervalMs: 100, cooldownMs: 900,
      shouldMonitor: () => state.enabled,
      onStalled: (value: boolean) => { state.stalled = value; },
      restore: async () => {
        state.restores++;
        if (mode === 'fail') throw new Error('Capture unavailable');
        timer = window.setInterval(draw, 60);
        await video.play();
      },
    });
    Object.assign(window, { cameraTest: { state, freeze: () => clearInterval(timer), cleanup: () => { stop(); clearInterval(timer); state.cleaned = true; } } });
  }, { source, mode });
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(3);
}
const state = (page: Page) => page.evaluate(() => (window as any).cameraTest.state);

test('paused playback resumes and frozen rendered frames recover without repeated restarts', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => document.querySelector('video')!.pause());
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.paused)).toBe(false);
  expect((await state(page)).restores).toBe(0);
  await page.evaluate(() => (window as any).cameraTest.freeze());
  await expect.poll(async () => (await state(page)).restores).toBe(1);
  await expect.poll(async () => (await state(page)).stalled).toBe(false);
  const frames = await page.evaluate(() => document.querySelector('video')!.getVideoPlaybackQuality().totalVideoFrames);
  await expect.poll(() => page.evaluate(() => document.querySelector('video')!.getVideoPlaybackQuality().totalVideoFrames)).toBeGreaterThan(frames + 6);
  expect((await state(page)).restores).toBe(1);
  await page.evaluate(() => (window as any).cameraTest.cleanup());
});

test('camera-off and offscreen video do not recover; failed recovery is bounded and cleanup stops it', async ({ page }) => {
  await setup(page, 'fail');
  await page.evaluate(() => { (window as any).cameraTest.state.enabled = false; (window as any).cameraTest.freeze(); });
  await page.waitForTimeout(1100);
  expect((await state(page)).restores).toBe(0);
  await page.evaluate(() => { (window as any).cameraTest.state.enabled = true; document.querySelector('video')!.style.display = 'none'; });
  await page.waitForTimeout(1100);
  expect((await state(page)).restores).toBe(0);
  await page.evaluate(() => { document.querySelector('video')!.style.display = 'block'; });
  await expect.poll(async () => (await state(page)).restores).toBe(2);
  await page.waitForTimeout(1200);
  expect((await state(page)).restores).toBe(2);
  expect((await state(page)).stalled).toBe(true);
  await page.evaluate(() => (window as any).cameraTest.cleanup());
  await page.waitForTimeout(900);
  expect((await state(page)).restores).toBe(2);
});
