import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
const script = buildSync({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AuthProvider,useAuth} from './apps/web/src/components/AuthProvider';import {FeedbackProvider} from './apps/web/src/components/FeedbackProvider';function View(){const {user,status}=useAuth();return status==='loading'?<p>Loading</p>:user?<input aria-label="Unsaved activity" defaultValue=""/>:<p>Signed out</p>;}createRoot(document.getElementById('root')).render(<FeedbackProvider><AuthProvider><View/></AuthProvider></FeedbackProvider>);`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  jsx: 'automatic',
  format: 'iife',
  loader: { '.css': 'empty' },
  alias: {
    '@': process.cwd() + '/apps/web/src',
    'next/navigation': process.cwd() + '/tests/browser/fixtures/navigation.ts',
  },
  define: {
    'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('http://127.0.0.1:4000'),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
}).outputFiles[0].text;

test('embedded writing drafts preserve mounted account views while credential changes and storage clearing still revalidate', async ({
  page,
}) => {
  let reads = 0;
  await page.route('**/api/auth/me', (route) => {
    reads++;
    return route.fulfill({
      json: { data: { id: 'storage-user', name: 'Storage test', role: 'STUDENT' } },
    });
  });
  await page.route('**/auth-storage-parent', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><div id="root"></div><iframe title="activity" src="/auth-storage-child"></iframe>',
    })
  );
  await page.route('**/auth-storage-child', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>activity</title><p>Activity</p>',
    })
  );
  await page.goto('/auth-storage-parent');
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-credential');
    (window as any).storageKeys = [];
    window.addEventListener('storage', (event) => (window as any).storageKeys.push(event.key));
  });
  await page.addScriptTag({ content: script });
  const draft = page.getByRole('textbox', { name: 'Unsaved activity' });
  await draft.fill('Keep the active call and unsaved work');
  expect(reads).toBe(1);
  const activity = page.frameLocator('iframe[title="activity"]');
  await activity
    .locator('body')
    .evaluate(() => sessionStorage.setItem('midad-writing-draft', 'ink'));
  await expect
    .poll(() => page.evaluate(() => (window as any).storageKeys.includes('midad-writing-draft')))
    .toBeTruthy();
  await activity.locator('body').evaluate(() => localStorage.setItem('activity-preference', 'pen'));
  await expect
    .poll(() => page.evaluate(() => (window as any).storageKeys.includes('activity-preference')))
    .toBeTruthy();
  expect(reads).toBe(1);
  await expect(draft).toHaveValue('Keep the active call and unsaved work');
  await activity
    .locator('body')
    .evaluate(() => localStorage.setItem('token', 'changed-credential'));
  await expect.poll(() => reads).toBe(2);
  await expect(draft).toHaveValue('');
  await activity.locator('body').evaluate(() => localStorage.clear());
  await expect(page.getByText('Signed out', { exact: true })).toBeVisible();
});
