import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { AccessToken } from 'livekit-server-sdk';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { once } from 'node:events';
import type { FastifyInstance } from 'fastify';

process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_preview';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_preview';
process.env.LIVEKIT_API_KEY = 'preview-key';
process.env.LIVEKIT_API_SECRET = 'preview-secret-at-least-32-characters';
let app: FastifyInstance; let prisma: any; let local: any; let whiteboard: any;
const actors: Record<string, { id: string; token: string; email: string }> = {};
let freeId: string; let paidId: string; let quizId: string; let questionId: string; let writtenId: string; let resultId: string; let sessionId: string;
const call = (method: any, url: string, role?: string, payload?: any) => app.inject({ method, url, headers: role ? { authorization: `Bearer ${actors[role].token}` } : {}, ...(payload ? { payload } : {}) });

before(async () => {
  local = await import('../scripts/dev-db.mjs');
  prisma = (await import('../apps/api/src/lib/prisma')).prisma;
  app = await (await import('../apps/api/src/index')).buildApp();
  for (const [key, role] of [['teacher', 'TEACHER'], ['otherTeacher', 'TEACHER'], ['student', 'STUDENT'], ['outsider', 'STUDENT'], ['parent', 'PARENT']] as const) {
    const email = `${key}@midad.test`;
    const registered = await call('POST', '/api/auth/register', undefined, { name: key, email, password: 'TestingPassword2026!', role, inviteCode: process.env.TEACHER_INVITE_CODE });
    assert.equal(registered.statusCode, 201, registered.body);
    const login = await call('POST', '/api/auth/login', undefined, { email: email.toUpperCase(), password: 'TestingPassword2026!' });
    assert.equal(login.statusCode, 200, login.body);
    actors[key] = { id: login.json().data.user.id, token: login.json().data.token, email };
  }
}, { timeout: 30000 });

after(async () => { await whiteboard?.close(); await app?.close(); await prisma?.$disconnect(); if (local) { await local.server.stop(); await local.db.close(); } });

test('anonymous requests and uninvited teachers are rejected', async () => {
  assert.equal((await call('GET', '/api/courses')).statusCode, 401);
  assert.equal((await call('POST', '/api/auth/register', undefined, { name: 'Uninvited', email: 'uninvited@midad.test', password: 'TestingPassword2026!', role: 'TEACHER' })).statusCode, 403);
  assert.equal((await app.inject({ method: 'OPTIONS', url: '/api/courses', headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'GET' } })).headers['access-control-allow-origin'], undefined);
});

test('teacher creates courses; student cannot create or enroll in a paid course for free', async () => {
  const body = { title: 'Arabic foundations', description: 'An Arabic learning course for children.', ageGroup: '8–10', price: 0 };
  assert.equal((await call('POST', '/api/courses', 'student', body)).statusCode, 403);
  freeId = (await call('POST', '/api/courses', 'teacher', body)).json().data.id;
  paidId = (await call('POST', '/api/courses', 'teacher', { ...body, price: 19 })).json().data.id;
  assert.equal((await call('POST', '/api/enrollments', 'student', { courseId: paidId })).statusCode, 402);
  assert.equal((await call('GET', `/api/courses/${freeId}/lessons`, 'student')).statusCode, 403);
  assert.equal((await call('POST', '/api/payments/create-checkout', 'student', { courseId: freeId })).json().data.type, 'enrolled');
});

test('course material and quiz ownership are enforced and written answers reach teacher review', async () => {
  const content = await call('POST', `/api/courses/${freeId}/lessons`, 'teacher', { title: 'Arabic words', description: 'Practice words', type: 'EXERCISE', contentUrl: 'https://example.com', duration: 10 });
  assert.equal(content.statusCode, 201, content.body);
  quizId = (await call('POST', `/api/content/${content.json().data.id}/quiz`, 'teacher', { title: 'Words quiz' })).json().data.id;
  questionId = (await call('POST', `/api/quiz/${quizId}/questions`, 'teacher', { text: 'Meaning of مرحباً?', options: ['Hello', 'Goodbye'], correctAnswer: 'Hello', points: 1 })).json().data.id;
  writtenId = (await call('POST', `/api/quiz/${quizId}/questions`, 'teacher', { text: 'Write an Arabic word', questionType: 'WRITTEN', points: 1 })).json().data.id;
  assert.equal((await call('GET', `/api/quiz/${quizId}`, 'outsider')).statusCode, 403);
  assert.equal((await call('GET', `/api/quiz/${quizId}`, 'otherTeacher')).statusCode, 403);
  const visible = (await call('GET', `/api/quiz/${quizId}`, 'student')).json().data;
  assert.equal(visible.questions[0].correctAnswer, undefined);
  const submitted = await call('POST', `/api/quiz/${quizId}/submit`, 'student', { answers: { [questionId]: 'Hello', [writtenId]: 'مرحباً' } });
  assert.equal(submitted.statusCode, 201, submitted.body); resultId = submitted.json().data.id;
  assert.equal(submitted.json().data.status, 'PENDING_REVIEW');
  const pending = (await call('GET', '/api/teacher/pending-reviews', 'teacher')).json().data;
  assert.equal(pending.length, 1);
  assert.equal((await call('PATCH', `/api/teacher/answers/${pending[0].id}/grade`, 'otherTeacher', { pointsAwarded: 1 })).statusCode, 404);
  const graded = await call('PATCH', `/api/teacher/answers/${pending[0].id}/grade`, 'teacher', { pointsAwarded: 1, feedback: 'Well done' });
  assert.equal(graded.json().data.score, 100); assert.equal(graded.json().data.status, 'COMPLETE');
});

test('parent linking requires a valid one-time student code', async () => {
  assert.equal((await call('POST', '/api/parent/link-child', 'parent', { childEmail: actors.student.email, linkCode: 'wrong' })).statusCode, 400);
  const code = (await call('POST', '/api/account/parent-link-code', 'student', {})).json().data.linkCode;
  assert.equal((await call('POST', '/api/parent/link-child', 'parent', { childEmail: actors.student.email.toUpperCase(), linkCode: code })).statusCode, 200);
  assert.equal((await call('POST', '/api/parent/link-child', 'parent', { childEmail: actors.outsider.email, linkCode: code })).statusCode, 400);
  assert.equal((await call('GET', '/api/parent/overview', 'parent')).json().data.children.length, 1);
});

test('signed Stripe webhooks grant paid access once without a browser redirect', async () => {
  const student = await prisma.studentProfile.findUnique({ where: { userId: actors.student.id } });
  const payload = JSON.stringify({ id: 'evt_preview', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_preview', object: 'checkout.session', payment_status: 'paid', amount_total: 1900, currency: 'usd', client_reference_id: actors.student.id, metadata: { courseId: paidId, userId: actors.student.id, studentId: student.id } } } });
  const stripe = new Stripe('sk_test_preview');
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  const send = (sig: string) => app.inject({ method: 'POST', url: '/api/payments/webhook', payload, headers: { 'content-type': 'application/json', 'stripe-signature': sig } });
  assert.equal((await send('invalid')).statusCode, 400);
  for (let i = 0; i < 2; i++) { const res = await send(signature); assert.equal(res.statusCode, 200, res.body); }
  assert.equal(await prisma.payment.count({ where: { providerPaymentId: 'cs_test_preview' } }), 1);
  assert.equal((await call('GET', `/api/courses/${paidId}/lessons`, 'student')).statusCode, 200);
});

test('classroom creation is restricted and actual signed attendance is recorded once', async () => {
  assert.equal((await call('POST', '/api/sessions/create', 'student', { roomName: freeId })).statusCode, 403);
  assert.equal((await call('POST', '/api/sessions/create', 'otherTeacher', { roomName: freeId })).statusCode, 403);
  const scheduled = await call('POST', '/api/sessions/schedule', 'teacher', { courseId: freeId, title: 'First live class', scheduledAt: new Date().toISOString(), durationMinutes: 30 });
  assert.equal(scheduled.statusCode, 201, scheduled.body); sessionId = scheduled.json().data.id;
  assert.equal((await call('PATCH', `/api/sessions/${sessionId}/start`, 'teacher', {})).statusCode, 200);
  const payload = JSON.stringify({ event: 'participant_joined', room: { name: freeId }, participant: { identity: actors.student.id } });
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET); token.sha256 = createHash('sha256').update(payload).digest('base64');
  const auth = await token.toJwt();
  const send = () => app.inject({ method: 'POST', url: '/api/sessions/webhook', payload, headers: { 'content-type': 'application/webhook+json', authorization: auth } });
  for (let i = 0; i < 2; i++) { const res = await send(); assert.equal(res.statusCode, 200, res.body); }
  const me = (await call('GET', '/api/students/me', 'student')).json().data;
  assert.equal(me.lessonsCompleted, 1); assert.ok(me.totalPoints >= 10);
  assert.equal((await call('GET', '/api/students/me', 'outsider')).json().data.lessonsCompleted, 0);
  assert.equal(await prisma.sessionAttendance.count(), 1);
});

test('password reset is single-use and revokes previous sessions', async () => {
  const token = 'a'.repeat(64);
  await prisma.passwordReset.create({ data: { userId: actors.outsider.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
  assert.equal((await call('POST', '/api/auth/reset-password', undefined, { token, password: 'NewTestingPassword2026!' })).statusCode, 200);
  assert.equal((await call('GET', '/api/auth/me', 'outsider')).statusCode, 401);
  assert.equal((await call('POST', '/api/auth/reset-password', undefined, { token, password: 'NewTestingPassword2026!' })).statusCode, 400);
});


test('whiteboard rejects unauthorized viewers, blocks student edits and persists teacher drawings', { timeout: 15000 }, async () => {
  await app.listen({ host: '127.0.0.1', port: 0 });
  whiteboard = (await import('../apps/api/src/ws-server')).startWhiteboardWebSocketServer(app.server, app);
  const address = app.server.address() as { port: number };
  const url = `ws://127.0.0.1:${address.port}/whiteboard-${freeId}`;
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('unexpected-response', (_req, res) => { try { assert.equal(res.statusCode, 401); res.destroy(); ws.terminate(); resolve(); } catch (error) { reject(error); } });
    ws.on('open', () => { ws.terminate(); reject(new Error('Anonymous whiteboard connection accepted')); });
    ws.on('error', () => {});
  });
  const connect = async (token: string) => {
    const ws = new WebSocket(`${url}?token=${token}`);
    await once(ws, 'message'); // Server handshake means permissions and document are loaded.
    return ws;
  };
  const student = await connect(actors.student.token);
  const teacher = await connect(actors.teacher.token);
  const update = (key: string) => {
    const doc = new Y.Doc(); doc.getMap('drawing').set(key, true);
    const enc = encoding.createEncoder(); encoding.writeVarUint(enc, 0); sync.writeUpdate(enc, Y.encodeStateAsUpdate(doc)); doc.destroy(); return encoding.toUint8Array(enc);
  };
  student.send(update('blocked'));
  const broadcast = once(teacher, 'message'); teacher.send(update('allowed')); await broadcast;
  const closedStudent = once(student, 'close'); student.close(); await closedStudent;
  const closedTeacher = once(teacher, 'close'); teacher.close(); await closedTeacher;
  await whiteboard.close(); whiteboard = undefined;
  const saved = await prisma.whiteboardDocument.findUniqueOrThrow({ where: { courseId: freeId } });
  const restored = new Y.Doc(); Y.applyUpdate(restored, saved.state);
  assert.equal(restored.getMap('drawing').get('allowed'), true);
  assert.equal(restored.getMap('drawing').get('blocked'), undefined); restored.destroy();
});
