// Read-only gate for the hosted human-test environment.
import assert from 'node:assert/strict';

const api = new URL(process.env.API_URL || 'https://midad-test-api.onrender.com');
const web = new URL(process.env.WEB_URL || 'https://midad-academy-preview.vercel.app');
const expected = process.env.EXPECTED_COMMIT;

async function get(base, path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(70_000) });
  assert.equal(response.status, 200, `${base.origin}${path}: HTTP ${response.status}`);
  return response;
}

const ready = await (await get(api, '/api/ready')).json();
assert.equal(ready.status, 'ready', 'The API cannot query its database.');
if (expected) assert.equal(ready.revision, expected, 'The API is not at the expected commit.');
const proxy = await (await get(web, '/api/ready')).json();
assert.equal(proxy.status, 'ready', 'The web-to-API connection is not ready.');
assert.equal(proxy.revision, ready.revision, 'The web proxy is pointing at a different API.');
await get(web, '/');

const catalog = await (await get(api, '/api/courses/catalog')).json();
const free = (catalog.data ?? []).filter((course) => course.price === 0);
assert.ok(
  free.length,
  'No free course appears in the public catalog. Run staging:prepare with the test administrator credentials before inviting a tester.'
);

console.log(`Human-test entry ready at ${ready.revision ?? 'unknown revision'}.`);
for (const course of free)
  console.log(`Free course: ${course.title} (${course.month}); ID ${course.id}`);
console.log(`${web.origin}/#monthly-courses`);
