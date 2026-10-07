import chromium from '@sparticuz/chromium';
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', timeout: 45000, workers: 1, use: { baseURL: 'http://127.0.0.1:3000', viewport: { width: 390, height: 844 }, headless: true, launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: chromium.args.filter((arg) => !['--single-process', '--disable-web-security', '--allow-running-insecure-content'].includes(arg)) } : undefined }, reporter: 'list' });
