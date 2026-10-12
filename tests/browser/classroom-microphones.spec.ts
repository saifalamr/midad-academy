import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
const script = buildSync({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {Room,RoomEvent} from 'livekit-client';import {ParticipantPermission} from '@livekit/protocol';import {RoomContext} from '@livekit/components-react';import Controls,{useSpeakingPermission} from './apps/web/src/components/ClassroomMicrophones';const room=new Room();Object.defineProperty(room,'name',{value:'class-fixture'});let enabled=false,stops=0;Object.defineProperty(room.localParticipant,'isMicrophoneEnabled',{get:()=>enabled});room.localParticipant.setMicrophoneEnabled=async value=>{enabled=value;if(!value)stops++;};function Guard(){const allowed=useSpeakingPermission(false,false);return <button id='student-microphone' disabled={!allowed}>مايك الطالب</button>;}window.controlTest={grant:()=>room.localParticipant.setPermissions(new ParticipantPermission({canPublish:true,canSubscribe:true,canPublishData:true,canPublishSources:[1,2,3,4]})),revoke:()=>{enabled=true;room.localParticipant.setPermissions(new ParticipantPermission({canPublish:true,canSubscribe:true,canPublishData:true,canPublishSources:[1,3]}));},spoof:()=>room.emit(RoomEvent.DataReceived,new TextEncoder().encode(JSON.stringify({type:'microphonePermission',allowed:true}))),state:()=>({enabled,stops})};createRoot(document.getElementById('controls-root')).render(<RoomContext.Provider value={room}><Guard/><Controls courseId='fixture'/></RoomContext.Provider>);`,
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
test('teacher controls are clear across screens and only authenticated SDK permissions unlock or stop the student microphone', async ({
  page,
}) => {
  let version = 0,
    allowed = false,
    fail = false;
  await page.route('**/api/sessions/microphones/fixture**', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.version).toBe(version);
      expect(body.sessionId).toBe('session-fixture');
      allowed = body.allowed;
      version++;
      if (fail) {
        await route.fulfill({ status: 502, json: { error: 'حُفظ الإذن، لكن تعذر تأكيد تطبيقه' } });
        return;
      }
      await route.fulfill({ json: { message: 'تم تطبيق الإذن' } });
      return;
    }
    await route.fulfill({
      json: {
        data: {
          sessionId: 'session-fixture',
          version,
          providerAvailable: true,
          students: [
            { userId: 'pupil', name: 'الطالب التجريبي', allowed, connected: true, applied: !fail },
          ],
        },
      },
    });
  });
  await page.route('**/microphone-test-harness', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div class="midad classroom-v2" id="controls-root"></div>',
    })
  );
  await page.goto('/microphone-test-harness');
  await page.addStyleTag({
    content:
      '*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}' +
      readFileSync('apps/web/src/components/classroom-microphones.css', 'utf8'),
  });
  await page.addScriptTag({ content: script });
  const microphone = page.locator('#student-microphone');
  await expect(microphone).toBeDisabled();
  await page.evaluate(() => (window as any).controlTest.spoof());
  await expect(microphone).toBeDisabled();
  await page.getByRole('button', { name: 'مايكات الطلاب' }).click();
  const dialog = page.getByRole('dialog', { name: 'إدارة مايكات الطلاب' });
  await dialog
    .getByRole('button', { name: 'السماح بالكلام لـ الطالب التجريبي', exact: true })
    .click();
  await expect(dialog).toContainText('مسموح له بتشغيل المايك');
  await page.evaluate(() => (window as any).controlTest.grant());
  await expect(microphone).toBeEnabled();
  expect(await page.evaluate(() => (window as any).controlTest.state().enabled)).toBe(false);
  await dialog.getByRole('button', { name: 'قفل مايكات الجميع' }).click();
  await expect(
    dialog.getByRole('button', { name: 'السماح بالكلام لـ الطالب التجريبي' })
  ).toBeEnabled();
  await page.evaluate(() => (window as any).controlTest.revoke());
  await expect(microphone).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as any).controlTest.state().stops)).toBe(1);
  fail = true;
  await dialog.getByRole('button', { name: 'السماح بالكلام لـ الطالب التجريبي' }).click();
  await expect(dialog.getByRole('alert')).toContainText('تعذر تأكيد');
  await expect(dialog).toContainText('بانتظار تأكيد تطبيق الإذن');
  for (const width of [320, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
    ).toBeTruthy();
    await page.screenshot({ path: `test-results/microphone-controls-${width}.png` });
  }
  await dialog.getByRole('button', { name: 'إغلاق إدارة المايكات' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'مايكات الطلاب' })).toBeFocused();
});
