import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentErrors } from '../scripts/check-deploy.mjs';

const web = { NEXT_PUBLIC_API_URL: 'https://api.midad.test', NEXT_PUBLIC_APP_URL: 'https://app.midad.test' };
const api = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:password@db.internal:5432/staging', JWT_SECRET: 'a'.repeat(48), TEACHER_INVITE_CODE: 'private-invite', FRONTEND_URL: 'https://app.midad.test', API_URL: 'https://api.midad.test', CORS_ORIGIN: 'https://app.midad.test' };
test('hosted configuration accepts secure origins and rejects local URLs and public secrets', () => {
  assert.deepEqual(deploymentErrors(web, 'web'), []);
  assert.ok(deploymentErrors({ ...web, NEXT_PUBLIC_API_URL: 'http://localhost:4000' }, 'web').length);
  assert.ok(deploymentErrors({ ...web, NEXT_PUBLIC_JWT_SECRET: 'private' }, 'web').length);
  assert.ok(deploymentErrors({ ...web, NEXT_PUBLIC_WHITEBOARD_WS_URL: 'ws://api.midad.test' }, 'web').length);
});
test('API configuration rejects unsafe secrets, wildcard CORS and mismatched frontend', () => {
  assert.deepEqual(deploymentErrors(api, 'api'), []);
  for (const override of [{ JWT_SECRET: 'dev-secret' }, { CORS_ORIGIN: '*' }, { CORS_ORIGIN: 'https://app.midad.test/path' }, { CORS_ORIGIN: 'https://other.midad.test' }, { NODE_ENV: 'development' }]) assert.ok(deploymentErrors({ ...api, ...override }, 'api').length);
});
test('complete integration check requires provider configuration without leaking values', () => {
  const errors = deploymentErrors(api, 'api', true);
  assert.ok(errors.some(error => error.includes('LIVEKIT_API_KEY')));
  assert.ok(errors.some(error => error.includes('SMTP_HOST')));
  assert.ok(errors.every(error => !error.includes(api.DATABASE_URL) && !error.includes(api.JWT_SECRET)));
});
