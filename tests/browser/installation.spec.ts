import { test, expect } from '@playwright/test';

test('home screen metadata points to real square Midad icons and opens the normal app entry', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'مداد');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  for (const [url, size] of [[apple!, 180], ...manifest.icons.map((icon: { src: string; sizes: string }) => [icon.src, Number(icon.sizes.split('x')[0])])] as [string, number][]) {
    const response = await request.get(url);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
    const bytes = await response.body();
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
});
