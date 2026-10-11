import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
const script = buildSync({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AudioAnswer from './apps/web/src/components/AudioAnswer';const root=createRoot(document.getElementById('audio-root'));window.audioTest.unmount=()=>root.unmount();root.render(React.createElement(AudioAnswer,{sessionId:'fixture',questionId:'fixture',maxSeconds:30,disabled:false,onUploaded:()=>{},onBusy:value=>window.audioTest.busy=value}));`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  jsx: 'automatic',
  format: 'iife',
  loader: { '.css': 'empty' },
  alias: { '@': process.cwd() + '/apps/web/src' },
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('http://127.0.0.1:4000'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
}).outputFiles[0].text;
test('cancelling delayed microphone requests does not stop a newer recording, and leaving releases late devices', async ({
  page,
}) => {
  await page.route('**/audio-test-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="audio-root"></div>' })
  );
  await page.goto('/audio-test-harness');
  await page.evaluate(() => {
    const state: any = { busy: false, stops: 0, calls: 0 };
    let rejectFirst: any, resolveLate: any;
    const first = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    const late = new Promise((resolve) => {
      resolveLate = resolve;
    });
    const media = () => ({ getTracks: () => [{ stop: () => state.stops++ }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => {
          state.calls++;
          return state.calls === 1 ? first : state.calls === 2 ? Promise.resolve(media()) : late;
        },
      },
    });
    class Recorder {
      state = 'inactive';
      mimeType = 'audio/mp4';
      ondataavailable: any;
      onstop: any;
      onerror: any;
      static isTypeSupported(mime: string) {
        return mime === 'audio/mp4';
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) });
        queueMicrotask(() => this.onstop?.());
      }
    }
    Object.assign(window, {
      MediaRecorder: Recorder,
      audioTest: Object.assign(state, {
        rejectFirst: () => rejectFirst(Error('old permission failed')),
        resolveLate: () => resolveLate(media()),
      }),
    });
  });
  await page.addScriptTag({ content: script });
  await page.getByRole('button', { name: 'بدء التسجيل', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إلغاء طلب التسجيل' })).toBeVisible();
  await page.getByRole('button', { name: 'إلغاء طلب التسجيل' }).click();
  await page.getByRole('button', { name: 'بدء التسجيل', exact: true }).click();
  await expect(page.getByRole('button', { name: /إيقاف التسجيل/ })).toBeVisible();
  await page.evaluate(() => (window as any).audioTest.rejectFirst());
  await expect.poll(() => page.evaluate(() => (window as any).audioTest.calls)).toBe(2);
  expect(await page.evaluate(() => (window as any).audioTest.stops)).toBe(0);
  await page.getByRole('button', { name: /إيقاف التسجيل/ }).click();
  await expect(page.getByRole('button', { name: 'حفظ التسجيل الصوتي' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).audioTest.busy)).toBe(true);
  await page.getByRole('button', { name: 'تجاهل التسجيل الجديد' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioTest.busy)).toBe(false);
  await page.getByRole('button', { name: 'بدء التسجيل', exact: true }).click();
  await expect(page.getByRole('button', { name: 'إلغاء طلب التسجيل' })).toBeVisible();
  const before = await page.evaluate(() => (window as any).audioTest.stops);
  await page.evaluate(() => {
    (window as any).audioTest.unmount();
    (window as any).audioTest.resolveLate();
  });
  await expect.poll(() => page.evaluate(() => (window as any).audioTest.stops)).toBe(before + 1);
});
