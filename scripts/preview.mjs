import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const raw = await readFile('.env.preview', 'utf8');
for (const line of raw.split('\n')) { if (!line || line.startsWith('#')) continue; const i = line.indexOf('='); if (i > 0) process.env[line.slice(0, i)] ??= line.slice(i + 1); }
const children = [];
const run = (args, extra = {}) => { const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...extra } }); children.push(child); return child; };
const finished = (child) => new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Process exited with ${code}`))); });
const classroom = process.argv.includes('--classroom');
if (process.argv.includes('--test') || classroom) process.env.NODE_ENV = 'test';
if (classroom) {
  if (!process.env.LIVEKIT_SERVER_BINARY) throw new Error('Set LIVEKIT_SERVER_BINARY to a local LiveKit server binary');
  process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';
  process.env.LIVEKIT_API_KEY = 'preview-key';
  process.env.LIVEKIT_API_SECRET = 'preview-secret-at-least-32-characters';
  process.env.RUN_CLASSROOM_TEST = '1';
  const config = 'port: 7880\nrtc:\n  use_external_ip: false\n  node_ip: 127.0.0.1\n  tcp_port: 7881\n  port_range_start: 50100\n  port_range_end: 50200\nkeys:\n  preview-key: preview-secret-at-least-32-characters\nwebhook:\n  api_key: preview-key\n  urls: [http://127.0.0.1:4000/api/sessions/webhook]\n';
  const server = spawn(process.env.LIVEKIT_SERVER_BINARY, ['--dev', '--bind', '127.0.0.1', '--config-body', config], { stdio: 'inherit' }); children.push(server);
}
const local = await import('./dev-db.mjs');
let stopping;
const stop = () => stopping ??= (async () => {
  await Promise.all(children.filter((child) => child.exitCode === null && child.signalCode === null).map((child) => new Promise((resolve) => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); })));
  await local.server.stop(); await local.db.close();
})();
process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
try {
  if (classroom) {
    const deadline = Date.now() + 10000;
    while (true) { try { if ((await fetch(process.env.LIVEKIT_URL.replace('ws:', 'http:'))).ok) break; } catch {} if (Date.now() > deadline) throw new Error('Local LiveKit could not start. Check host network permissions and server logs.'); await new Promise(r => setTimeout(r, 200)); }
  }
  await finished(run(['--import', 'tsx', 'scripts/seed-preview.ts']));
  run(['--import', 'tsx', 'apps/api/src/index.ts'], { HOST: '127.0.0.1', NODE_ENV: 'test' });
  run(['node_modules/next/dist/bin/next', (process.argv.includes('--test') || classroom) ? 'start' : 'dev', 'apps/web', '-H', '127.0.0.1', '-p', '3000', ...((process.argv.includes('--test') || classroom) ? [] : ['--webpack'])], { NODE_ENV: (process.argv.includes('--test') || classroom) ? 'production' : 'development', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4000' });
  for (const url of ['http://127.0.0.1:4000/api/ready', 'http://127.0.0.1:3000']) {
    const deadline = Date.now() + 60_000;
    while (true) { try { const res = await fetch(url); if (res.ok) break; } catch {} if (Date.now() > deadline) throw new Error(`Preview did not start: ${url}`); await new Promise((r) => setTimeout(r, 300)); }
  }
  console.log('Preview ready: http://127.0.0.1:3000 (local only)');
  if (process.argv.includes('--test') || classroom) { const executablePath = await (await import('./chromium.mjs')).chromiumPath(); await finished(run(['node_modules/@playwright/test/cli.js', 'test', ...(classroom ? ['classroom.spec.ts'] : [])], { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath })); await stop(); }
} catch (error) { console.error(error.message); await stop(); process.exitCode = 1; }
