// Disposable staging-only journey. Never run against a production database.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

if (process.env.HOSTED_TEST_MODE !== 'staging')
  throw new Error('Set HOSTED_TEST_MODE=staging to acknowledge disposable test accounts.');
const api = new URL(process.env.API_URL || '');
const web = new URL(process.env.WEB_URL || '');
if (api.protocol !== 'https:' || web.protocol !== 'https:' || api.origin === web.origin)
  throw new Error('Use separate HTTPS staging API_URL and WEB_URL origins.');
if (api.pathname !== '/' || web.pathname !== '/')
  throw new Error('Provide origin URLs without paths.');

const expected = process.env.EXPECTED_COMMIT;
const deadline = Date.now() + 8 * 60_000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(base, path, options = {}) {
  return fetch(new URL(path, base), {
    redirect: 'manual',
    signal: AbortSignal.timeout(70_000),
    ...options,
  });
}
async function json(response) {
  try { return await response.json(); }
  catch { throw new Error(`Expected JSON, received HTTP ${response.status}`); }
}
function status(response, expectedStatus, label) {
  assert.equal(response.status, expectedStatus, `${label}: HTTP ${response.status}`);
}
let ready;
while (Date.now() < deadline) {
  try {
    const response = await request(api, '/api/ready');
    if (response.status === 200) {
      const body = await json(response);
      if (body.status === 'ready' && (!expected || body.revision === expected)) {
        ready = body;
        break;
      }
    }
  } catch (error) {
    if (Date.now() >= deadline) throw error;
  }
  await pause(12_000);
}
assert.ok(ready, 'Staging API did not become ready at the expected commit.');
console.log('API ready at expected revision.');

const landing = await request(web, '/academy');
assert.ok([200, 301, 302, 307, 308].includes(landing.status), `Web landing: HTTP ${landing.status}`);
const proxied = await request(web, '/api/ready');
status(proxied, 200, 'Web-to-API proxy');
assert.equal((await json(proxied)).status, 'ready');

const unique = randomUUID().slice(0, 12);
const password = `Sm0ke-${randomBytes(20).toString('hex')}!`;
const parents = [];
for (let index = 0; index < 2; index++) {
  const email = `smoke-${unique}-${index}@midad.test`;
  const created = await request(web, '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: web.origin },
    body: JSON.stringify({ name: `اختبار مداد ${index}`, email, role: 'PARENT', password,
      whatsappPhone: '+12025550100', whatsappOptIn: false }),
  });
  status(created, 201, `Register test parent ${index}`);
  const loggedIn = await request(web, '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: web.origin,
      'x-midad-client': 'browser' },
    body: JSON.stringify({ email, password }),
  });
  status(loggedIn, 200, `Login test parent ${index}`);
  assert.equal((await json(loggedIn)).data.token, undefined, 'Browser login exposed a JWT');
  const setCookie = loggedIn.headers.get('set-cookie') || '';
  assert.match(setCookie, /^__Host-midad_session=/);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
    assert.ok(setCookie.includes(attribute), `Session missing ${attribute}`);
  parents.push({ cookie: setCookie.split(';')[0] });
}
const first = parents[0];
const second = parents[1];
const me = await request(web, '/api/auth/me', { headers: { cookie: first.cookie } });
status(me, 200, 'Cookie session');
const child = await request(web, '/api/academy/children', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: web.origin, cookie: first.cookie },
  body: JSON.stringify({ name: 'طفل اختبار الخصوصية', age: 9 }),
});
status(child, 201, 'Create child');
const childId = (await json(child)).data.id;
assert.ok(childId);
const outsider = await request(web, `/api/academy/children/${encodeURIComponent(childId)}/password`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: web.origin, cookie: second.cookie },
  body: JSON.stringify({ password: `Child-${randomBytes(12).toString('hex')}!` }),
});
status(outsider, 404, 'Other parent must not reset child password');
const otherChildren = await request(web, '/api/academy/children', { headers: { cookie: second.cookie } });
status(otherChildren, 200, 'Other parent children');
assert.ok(!(await json(otherChildren)).data.some((item) => item.id === childId));
const crossOrigin = await request(web, '/api/academy/children', {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example', cookie: first.cookie },
  body: JSON.stringify({ name: 'محاولة مرفوضة', age: 9 }),
});
status(crossOrigin, 403, 'Cross-origin cookie write');
const logout = await request(web, '/api/auth/logout', {
  method: 'POST', headers: { origin: web.origin, cookie: first.cookie },
});
status(logout, 200, 'Logout');
assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);
console.log('Hosted parent, child, isolation, CSRF, cookie and logout checks passed.');
