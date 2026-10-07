import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const raw = await readFile('.env.preview', 'utf8');
for (const line of raw.split('\n')) { if (!line || line.startsWith('#')) continue; const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i)] ??= line.slice(i + 1); }
const children = [];
const run = (args, extra = {}) => { const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...extra } }); children.push(child); return child; };
const finished = (child) => new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Process exited with ${code}`))); });
if (process.argv.includes('--test')) process.env.NODE_ENV = 'test';
const local = await import('./dev-db.mjs');
let stopping;
const stop = () => stopping ??= (async () => {
  await Promise.all(children.filter((child) => child.exitCode === null && child.signalCode === null).map((child) => new Promise((resolve) => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); })));
  await local.server.stop(); await local.db.close();
})();
process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
try {
  await finished(run(['--import', 'tsx', 'scripts/seed-preview.ts']));
  run(['--import', 'tsx', 'apps/api/src/index.ts'], { HOST: '127.0.0.1', NODE_ENV: 'test' });
  run(['node_modules/next/dist/bin/next', process.argv.includes('--test') ? 'start' : 'dev', 'apps/web', '-H', '127.0.0.1', '-p', '3000', ...(process.argv.includes('--test') ? [] : ['--webpack'])], { NODE_ENV: process.argv.includes('--test') ? 'production' : 'development', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000' });
  for (const url of ['http://127.0.0.1:4000/api/ready', 'http://127.0.0.1:3000']) {
    const deadline = Date.now() + 60_000;
    while (true) { try { const res = await fetch(url); if (res.ok) break; } catch {} if (Date.now() > deadline) throw new Error(`Preview did not start: ${url}`); await new Promise((r) => setTimeout(r, 300)); }
  }
  console.log('Preview ready: http://127.0.0.1:3000 (local only)');
  if (process.argv.includes('--test')) { const executablePath = await (await import('./chromium.mjs')).chromiumPath(); await finished(run(['node_modules/@playwright/test/cli.js', 'test'], { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath })); await stop(); }
} catch (error) { console.error(error.message); await stop(); process.exitCode = 1; }
