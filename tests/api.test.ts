import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as sync from 'y-protocols/sync';
import { once } from 'node:events';
import type { FastifyInstance } from 'fastify';

process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_preview';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_preview';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';
// Provider-independent API tests; real media is covered by the separate classroom test.
let createdRoomCapacity = 0;
let createdRooms: string[] = [];
let deletedRooms: string[] = [];
RoomServiceClient.prototype.createRoom = async options => { createdRoomCapacity = options?.maxParticipants ?? 0; createdRooms.push(options?.name ?? ''); return {} as any; };
RoomServiceClient.prototype.listRooms = async names => (names ?? []).map(name => ({ name } as any));
RoomServiceClient.prototype.deleteRoom = async name => { deletedRooms.push(name); };
RoomServiceClient.prototype.updateRoomMetadata = async () => ({} as any);
process.env.LIVEKIT_API_KEY = 'preview-key';
process.env.LIVEKIT_API_SECRET = 'preview-secret-at-least-32-characters';
let app: FastifyInstance; let prisma: any; let local: any; let whiteboard: any;
const actors: Record<string, { id: string; token: string; email: string }> = {};
let freeId: string; let paidId: string; let quizId: string; let questionId: string; let writtenId: string; let resultId: string; let sessionId: string;
// Independent scenarios represent different client IPs; keep production rate limiting enabled.
let scenario = 0;
let remoteAddress = '10.0.0.1';
beforeEach(() => { remoteAddress = `10.0.1.${++scenario}`; });
const call = (method: any, url: string, role?: string, payload?: any) => app.inject({ method, url, remoteAddress, headers: role ? { authorization: `Bearer ${actors[role].token}` } : {}, ...(payload ? { payload } : {}) });

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
  assert.equal(createdRoomCapacity, 11); // Ten students plus the teacher.
  const payload = JSON.stringify({ event: 'participant_joined', room: { name: `class-${sessionId}` }, participant: { identity: actors.student.id } });
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET); token.sha256 = createHash('sha256').update(payload).digest('base64');
  const auth = await token.toJwt();
  const send = () => app.inject({ method: 'POST', url: '/api/sessions/webhook', payload, headers: { 'content-type': 'application/webhook+json', authorization: auth } });
  for (let i = 0; i < 2; i++) { const res = await send(); assert.equal(res.statusCode, 200, res.body); }
  await prisma.classSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } });
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
  assert.equal((await call('POST', '/api/sessions/drawing-permission', 'teacher', { roomName: freeId, studentId: actors.student.id, canDraw: true })).statusCode, 200);
  const granted = once(teacher, 'message'); student.send(update('studentAllowed')); await granted;
  assert.equal((await call('POST', '/api/sessions/drawing-permission', 'teacher', { roomName: freeId, studentId: actors.student.id, canDraw: false })).statusCode, 200);
  student.send(update('revokedWhileConnected'));
  const marker = once(teacher, 'message'); teacher.send(update('afterRevocation')); await marker;
  const closedStudent = once(student, 'close'); student.close(); await closedStudent;
  const closedTeacher = once(teacher, 'close'); teacher.close(); await closedTeacher;
  await whiteboard.close(); whiteboard = undefined;
  const saved = await prisma.whiteboardDocument.findUniqueOrThrow({ where: { courseId: freeId } });
  const restored = new Y.Doc(); Y.applyUpdate(restored, saved.state);
  assert.equal(restored.getMap('drawing').get('allowed'), true);
  assert.equal(restored.getMap('drawing').get('blocked'), undefined);
  assert.equal(restored.getMap('drawing').get('studentAllowed'), true);
  assert.equal(restored.getMap('drawing').get('revokedWhileConnected'), undefined);
  assert.equal(restored.getMap('drawing').get('afterRevocation'), true); restored.destroy();
});


test('shared material and drawing grants survive re-entry and only the course teacher can change them', async () => {
  const path = `/api/sessions/state/${freeId}`;
  assert.equal((await call('GET', path, 'outsider')).statusCode, 401);
  assert.equal((await call('PATCH', path, 'student', { pdfPage: 2 })).statusCode, 403);
  assert.equal((await call('PATCH', path, 'otherTeacher', { pdfPage: 2 })).statusCode, 403);
  assert.equal((await call('PATCH', path, 'teacher', { sharedDoc: { url: 'javascript:alert(1)', name: 'Invalid', docType: 'pdf' } })).statusCode, 400);
  assert.equal((await call('PATCH', path, 'teacher', { sharedDoc: { url: 'https://example.com/lesson.pdf', name: 'درس', docType: 'pdf' }, pdfPage: 3 })).statusCode, 200);
  const state = (await call('GET', path, 'student')).json().data;
  assert.equal(state.pdfPage, 3); assert.equal(state.sharedDoc.name, 'درس'); assert.equal(state.canDraw, false);
  assert.equal((await call('POST', '/api/sessions/drawing-permission', 'teacher', { roomName: freeId, studentId: actors.student.id, canDraw: true })).statusCode, 200);
  assert.equal((await call('GET', path, 'student')).json().data.canDraw, true);
  assert.equal((await call('POST', '/api/sessions/drawing-permission', 'teacher', { roomName: freeId, studentId: actors.student.id, canDraw: false })).statusCode, 200);
  assert.equal((await call('GET', path, 'student')).json().data.canDraw, false);
});

test('a delayed room-finished webhook cannot close a later class in the same course', async () => {
  const teacher = await prisma.teacherProfile.findUnique({ where: { userId: actors.teacher.id } });
  const later = await prisma.classSession.create({ data: { courseId: freeId, teacherId: teacher.id, title: 'Later class', scheduledAt: new Date(), status: 'LIVE', liveKitRoomId: 'class-later' } });
  const payload = JSON.stringify({ event: 'room_finished', room: { name: `class-${sessionId}` } });
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  token.sha256 = createHash('sha256').update(payload).digest('base64');
  assert.equal((await app.inject({ method: 'POST', url: '/api/sessions/webhook', headers: { 'content-type': 'application/webhook+json', authorization: await token.toJwt() }, payload })).statusCode, 200);
  assert.equal((await prisma.classSession.findUnique({ where: { id: later.id } })).status, 'LIVE');
});

test('learning completion and private notes persist without XP, leaking to reports or bypassing enrollment', async () => {
  const content = await prisma.courseContent.findFirstOrThrow({ where: { courseId: freeId } });
  const path = `/api/learning/lessons/${content.id}`;
  const list = `/api/learning/courses/${freeId}`;
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.student.id } });
  const beforePoints = student.totalPoints;
  assert.equal((await call('PATCH', path, undefined, { note: 'anonymous' })).statusCode, 401);
  assert.equal((await call('GET', list, 'teacher')).statusCode, 403);
  assert.equal((await call('GET', list, 'parent')).statusCode, 403);
  assert.equal((await call('PATCH', path, 'teacher', { completed: true })).statusCode, 403);
  assert.equal((await call('PATCH', path, 'student', { note: 'x'.repeat(5001) })).statusCode, 400);
  assert.equal((await call('PATCH', path, 'student', { studentId: 'other', note: 'attempt' })).statusCode, 400);
  assert.equal((await call('PATCH', path, 'student', {})).statusCode, 400);
  const note = 'ملاحظة خاصة لا تظهر للمعلم أو ولي الأمر';
  assert.equal((await call('PATCH', path, 'student', { note })).statusCode, 200);
  assert.equal((await call('PATCH', path, 'student', { completed: true })).statusCode, 200);
  assert.equal((await call('PATCH', path, 'student', { completed: true })).statusCode, 200);
  const saved = (await call('GET', list, 'student')).json().data;
  assert.equal(saved.length, 1); assert.equal(saved[0].note, note); assert.ok(saved[0].completedAt);
  const own = (await call('GET', '/api/students/me', 'student')).json().data.materialProgress.find(course => course.courseId === freeId);
  assert.equal(own.completed, 1); assert.equal(own.total, 1); assert.equal(own.nextLesson, null);
  const teacher = await call('GET', '/api/teacher/students', 'teacher');
  assert.equal(teacher.json().data.find(row => row.email === actors.student.email && row.courseId === freeId).materialsCompleted, 1);
  assert.ok(!teacher.body.includes(note));
  const parent = await call('GET', '/api/parent/overview', 'parent');
  assert.ok(!parent.body.includes(note));
  assert.equal(parent.json().data.children[0].materialProgress.find(course => course.courseId === freeId).completed, 1);
  assert.equal((await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.id } })).totalPoints, beforePoints);
  await prisma.enrollment.update({ where: { courseId_studentId: { courseId: freeId, studentId: student.id } }, data: { status: 'PAUSED' } });
  assert.equal((await call('GET', list, 'student')).statusCode, 403);
  assert.equal((await call('PATCH', path, 'student', { note: 'should not change' })).statusCode, 403);
  await prisma.enrollment.update({ where: { courseId_studentId: { courseId: freeId, studentId: student.id } }, data: { status: 'ACTIVE' } });
  assert.equal((await call('PATCH', path, 'student', { completed: false })).statusCode, 200);
  assert.equal((await call('GET', list, 'student')).json().data[0].note, note);
  const changed = (await call('GET', '/api/students/me', 'student')).json().data.materialProgress.find(course => course.courseId === freeId);
  assert.equal(changed.completed, 0); assert.equal(changed.nextLesson.id, content.id);
  const registered = await call('POST', '/api/auth/register', undefined, { name: 'Another student', email: 'private-notes-other@midad.test', password: 'TestingPassword2026!', role: 'STUDENT', age: 11 });
  assert.equal(registered.statusCode, 201, registered.body);
  const login = (await call('POST', '/api/auth/login', undefined, { email: 'private-notes-other@midad.test', password: 'TestingPassword2026!' })).json().data;
  actors.noteStudent = { id: login.user.id, token: login.token, email: login.user.email };
  assert.equal((await call('GET', list, 'noteStudent')).statusCode, 403);
  assert.equal((await call('POST', '/api/enrollments', 'noteStudent', { courseId: freeId })).statusCode, 201);
  assert.deepEqual((await call('GET', list, 'noteStudent')).json().data, []);
  assert.equal((await call('PATCH', path, 'noteStudent', { note: 'other student note' })).statusCode, 200);
  assert.equal((await call('GET', list, 'student')).json().data[0].note, note);
});

test('the last free seat cannot be oversold across the two enrollment endpoints', async () => {
  const teacher = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: actors.teacher.id } });
  const course = await prisma.course.create({ data: { teacherId: teacher.id, title: 'Single seat', description: 'Concurrency test', ageGroup: '8-10', level: 'beginner', price: 0, maxStudents: 1 } });
  const [one, two] = await Promise.all([
    call('POST', '/api/enrollments', 'student', { courseId: course.id }),
    call('POST', '/api/payments/create-checkout', 'noteStudent', { courseId: course.id }),
  ]);
  assert.equal([one, two].filter(r => r.statusCode === 409).length, 1);
  assert.equal(await prisma.enrollment.count({ where: { courseId: course.id, status: 'ACTIVE' } }), 1);
  const active = await prisma.enrollment.findFirstOrThrow({ where: { courseId: course.id } });
  await prisma.enrollment.update({ where: { id: active.id }, data: { status: 'CANCELLED' } });
  const actor = one.statusCode === 201 ? 'student' : 'noteStudent';
  assert.equal((await call('POST', '/api/enrollments', actor, { courseId: course.id })).statusCode, 201);
  assert.equal(await prisma.enrollment.count({ where: { courseId: course.id } }), 1);
});

test('course counters include active students only and full courses expose zero available seats', async () => {
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.student.id } });
  const other = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.noteStudent.id } });
  const teacher = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: actors.teacher.id } });
  const course = await prisma.course.create({ data: { teacherId: teacher.id, title: 'Counter fixture', description: 'Counts test', ageGroup: '8-10', level: 'beginner', price: 0, maxStudents: 1 } });
  await prisma.enrollment.createMany({ data: [{ courseId: course.id, studentId: student.id, status: 'ACTIVE' }, { courseId: course.id, studentId: other.id, status: 'PAUSED' }] });
  const browse = (await call('GET', '/api/courses/browse', 'student')).json().data.find(c => c.id === course.id);
  assert.equal(browse.studentCount, 1); assert.equal(browse.availableSeats, 0);
  assert.equal((await call('GET', '/api/courses', 'teacher')).json().data.find(c => c.id === course.id)._count.enrollments, 1);
  assert.equal((await call('POST', '/api/payments/create-checkout', 'noteStudent', { courseId: course.id })).statusCode, 409);
  await prisma.enrollment.updateMany({ where: { courseId: course.id, status: 'ACTIVE' }, data: { status: 'COMPLETED' } });
  assert.equal((await call('GET', '/api/courses/browse', 'student')).json().data.find(c => c.id === course.id).studentCount, 0);
  assert.equal((await call('POST', '/api/enrollments', 'noteStudent', { courseId: course.id })).statusCode, 201);
});

test('only completed post-enrollment classes count toward attendance, consistently for student and parent', async () => {
  const teacher = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: actors.teacher.id } });
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.student.id } });
  const course = await prisma.course.create({ data: { teacherId: teacher.id, title: 'Attendance fixture', description: 'Attendance test', ageGroup: '8-10', level: 'beginner', price: 0 } });
  await prisma.enrollment.create({ data: { courseId: course.id, studentId: student.id, enrolledAt: new Date(Date.now() - 86400000) } });
  for (const status of ['SCHEDULED', 'LIVE', 'CANCELLED', 'COMPLETED'] as const) await prisma.classSession.create({ data: { courseId: course.id, teacherId: teacher.id, title: status, status, scheduledAt: new Date(Date.now() - 60000) } });
  await prisma.classSession.create({ data: { courseId: course.id, teacherId: teacher.id, title: 'Before enrollment', status: 'COMPLETED', scheduledAt: new Date(Date.now() - 172800000) } });
  const own = (await call('GET', '/api/students/me', 'student')).json().data;
  const counts = own.courseProgress.find(c => c.courseId === course.id);
  assert.equal(counts.total, 1); assert.equal(counts.completed, 0);
  assert.deepEqual(own.recentSessions.filter(s => s.courseTitle === course.title).map(s => s.title), ['COMPLETED']);
  const parent = (await call('GET', '/api/parent/overview', 'parent')).json().data.children[0].courseProgress.find(c => c.courseId === course.id);
  assert.equal(parent.total, 1); assert.equal(parent.completed, 0);
});

test('paid checkout holds the last seat, releases on signed expiry and never reactivates cancelled access on replay', async () => {
  const { startPaidCheckout, fulfillCheckout } = await import('../apps/api/src/routes/payments');
  const teacher = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: actors.teacher.id } });
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.student.id } });
  const other = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.noteStudent.id } });
  const course = await prisma.course.create({ data: { teacherId: teacher.id, title: 'Paid last seat', description: 'Paid capacity test', ageGroup: '8-10', level: 'beginner', price: 19, maxStudents: 1 } });
  let requested: any;
  await startPaidCheckout(course, student.id, actors.student.id, actors.student.email, async params => { requested = params; return { id: 'cs_seat_expire', url: 'https://checkout.stripe.test/seat' } as any; });
  assert.ok(requested.expires_at > Date.now() / 1000 + 30 * 60);
  await assert.rejects(startPaidCheckout(course, other.id, actors.noteStudent.id, actors.noteStudent.email, async () => { throw new Error('Provider must not be called'); }), (e: any) => e.statusCode === 409);
  const payload = JSON.stringify({ id: 'evt_expired', object: 'event', type: 'checkout.session.expired', data: { object: { id: 'cs_seat_expire', object: 'checkout.session' } } });
  const signature = new Stripe('sk_test_preview').webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  assert.equal((await app.inject({ method: 'POST', url: '/api/payments/webhook', payload, headers: { 'content-type': 'application/json', 'stripe-signature': 'invalid' } })).statusCode, 400);
  assert.equal(await prisma.seatReservation.count({ where: { courseId: course.id } }), 1);
  assert.equal((await app.inject({ method: 'POST', url: '/api/payments/webhook', payload, headers: { 'content-type': 'application/json', 'stripe-signature': signature } })).statusCode, 200);
  await assert.rejects(startPaidCheckout(course, other.id, actors.noteStudent.id, actors.noteStudent.email, async () => { throw new Error('Provider unavailable'); }));
  assert.equal(await prisma.seatReservation.count({ where: { courseId: course.id } }), 0);
  await startPaidCheckout(course, other.id, actors.noteStudent.id, actors.noteStudent.email, async () => ({ id: 'cs_seat_paid', url: 'https://checkout.stripe.test/seat' } as any));
  const paid = { id: 'cs_seat_paid', payment_status: 'paid', amount_total: 1900, currency: 'usd', client_reference_id: actors.noteStudent.id, metadata: { courseId: course.id, userId: actors.noteStudent.id, studentId: other.id } } as any;
  const result = await fulfillCheckout(paid); assert.equal(result.requiresReview, false);
  assert.equal(await prisma.seatReservation.count({ where: { courseId: course.id } }), 0);
  await prisma.enrollment.update({ where: { id: result.enrollment!.id }, data: { status: 'CANCELLED' } });
  await fulfillCheckout(paid);
  assert.equal((await prisma.enrollment.findUniqueOrThrow({ where: { id: result.enrollment!.id } })).status, 'CANCELLED');
  assert.equal(await prisma.payment.count({ where: { providerPaymentId: paid.id } }), 1);
});

test('a legacy paid checkout without a seat is recorded for review instead of overselling', async () => {
  const { fulfillCheckout } = await import('../apps/api/src/routes/payments');
  const teacher = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: actors.teacher.id } });
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.student.id } });
  const other = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: actors.noteStudent.id } });
  const course = await prisma.course.create({ data: { teacherId: teacher.id, title: 'Legacy paid full', description: 'Legacy checkout test', ageGroup: '8-10', level: 'beginner', price: 19, maxStudents: 1 } });
  await prisma.enrollment.create({ data: { courseId: course.id, studentId: student.id } });
  const result = await fulfillCheckout({ id: 'cs_legacy_full', payment_status: 'paid', amount_total: 1900, currency: 'usd', client_reference_id: actors.noteStudent.id, metadata: { courseId: course.id, userId: actors.noteStudent.id, studentId: other.id } } as any);
  assert.equal(result.requiresReview, true); assert.equal(result.enrollment, null);
  assert.equal(await prisma.enrollment.count({ where: { courseId: course.id, status: 'ACTIVE' } }), 1);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { providerPaymentId: 'cs_legacy_full' } })).requiresReview, true);
});

test('teachers can set capacity and payment review alerts remain scoped to the course owner', async () => {
  const body = { title: 'Configured capacity', description: 'Capacity through API', ageGroup: '8-10', price: 0, maxStudents: 2 };
  const created = await call('POST', '/api/courses', 'teacher', body);
  assert.equal(created.statusCode, 201); assert.equal(created.json().data.maxStudents, 2);
  assert.equal((await call('POST', '/api/courses', 'teacher', { ...body, maxStudents: 0 })).statusCode, 400);
  const reviews = (await call('GET', '/api/teacher/payment-reviews', 'teacher')).json().data;
  assert.equal(reviews.length, 1); assert.equal(reviews[0].providerPaymentId, 'cs_legacy_full');
  assert.deepEqual((await call('GET', '/api/teacher/payment-reviews', 'otherTeacher')).json().data, []);
  assert.equal((await call('GET', '/api/teacher/payment-reviews', 'student')).statusCode, 403);
});


test('room completion clears grants once, keeps the saved board and ignores delayed events', async () => {
  const course = (await call('POST', '/api/courses', 'teacher', { title: 'Class lifecycle', description: 'Class lifecycle integration', ageGroup: '8-10', price: 0 })).json().data;
  assert.equal((await call('POST', '/api/enrollments', 'student', { courseId: course.id })).statusCode, 201);
  const schedule = async () => (await call('POST', '/api/sessions/schedule', 'teacher', { courseId: course.id, title: 'Lifecycle session', scheduledAt: new Date().toISOString() })).json().data;
  const first = await schedule(); const second = await schedule();
  const started = await Promise.all([call('PATCH', `/api/sessions/${first.id}/start`, 'teacher', {}), call('PATCH', `/api/sessions/${second.id}/start`, 'teacher', {})]);
  assert.deepEqual(started.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal(createdRooms.filter(name => [first.id, second.id].some(id => name === `class-${id}`)).length, 1);
  const live = started.find(r => r.statusCode === 200)!.json().data;
  const waiting = live.id === first.id ? second : first;
  assert.equal((await call('PATCH', `/api/sessions/${live.id}/cancel`, 'teacher', {})).statusCode, 409);
  assert.equal((await call('PATCH', `/api/sessions/${live.id}/start`, 'teacher', {})).statusCode, 200);
  assert.equal(createdRooms.filter(name => name === live.liveKitRoomId).length, 1); // Re-entry never recreates a room.
  await call('POST', '/api/sessions/drawing-permission', 'teacher', { roomName: course.id, studentId: actors.student.id, canDraw: true });
  await prisma.whiteboardDocument.create({ data: { courseId: course.id, state: Buffer.from([0, 0]) } });
  const payload = JSON.stringify({ event: 'room_finished', room: { name: live.liveKitRoomId } });
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  token.sha256 = createHash('sha256').update(payload).digest('base64');
  const authorization = await token.toJwt();
  const notify = (auth: string) => app.inject({ method: 'POST', url: '/api/sessions/webhook', headers: { 'content-type': 'application/webhook+json', authorization: auth }, payload });
  assert.equal((await notify('invalid')).statusCode, 401);
  assert.equal((await prisma.classSession.findUniqueOrThrow({ where: { id: live.id } })).status, 'LIVE');
  assert.equal((await notify(authorization)).statusCode, 200);
  assert.equal((await prisma.classSession.findUniqueOrThrow({ where: { id: live.id } })).status, 'COMPLETED');
  { const res = await call('GET', `/api/sessions/state/${course.id}`, 'student'); assert.equal(res.statusCode, 200, res.body); assert.equal(res.json().data.canDraw, false); }
  assert.equal(await prisma.whiteboardDocument.count({ where: { courseId: course.id } }), 1);
  assert.equal((await call('POST', '/api/sessions/join', 'student', { roomName: course.id })).statusCode, 409);
  assert.equal((await call('PATCH', `/api/sessions/${live.id}/start`, 'teacher', {})).statusCode, 409);
  assert.equal((await call('PATCH', `/api/sessions/${waiting.id}/start`, 'teacher', {})).statusCode, 200);
  await call('POST', '/api/sessions/drawing-permission', 'teacher', { roomName: course.id, studentId: actors.student.id, canDraw: true });
  assert.equal((await notify(authorization)).statusCode, 200);
  assert.equal((await prisma.classSession.findUniqueOrThrow({ where: { id: waiting.id } })).status, 'LIVE');
  assert.equal((await call('GET', `/api/sessions/state/${course.id}`, 'student')).json().data.canDraw, true);
  assert.equal((await call('POST', '/api/sessions/end', 'otherTeacher', { roomName: course.id })).statusCode, 403);
  assert.equal((await call('POST', '/api/sessions/end', 'teacher', { roomName: course.id })).statusCode, 200);
  assert.equal(deletedRooms.filter(name => name === `class-${waiting.id}`).length, 1);
  { const res = await call('GET', `/api/sessions/state/${course.id}`, 'student'); assert.equal(res.statusCode, 200, res.body); assert.equal(res.json().data.canDraw, false); }
  await call('POST', '/api/sessions/end', 'teacher', { roomName: course.id });
  assert.equal(deletedRooms.filter(name => name === `class-${waiting.id}`).length, 1);
});


test('provider failures do not mark a scheduled class live or recreate an expired live room', async () => {
  const course = (await call('POST', '/api/courses', 'teacher', { title: 'Provider failure', description: 'Provider failure integration', ageGroup: '8-10', price: 0 })).json().data;
  const session = (await call('POST', '/api/sessions/schedule', 'teacher', { courseId: course.id, title: 'Provider test', scheduledAt: new Date().toISOString() })).json().data;
  const create = RoomServiceClient.prototype.createRoom;
  try {
    RoomServiceClient.prototype.createRoom = async () => { throw new Error('Provider unavailable'); };
    assert.equal((await call('PATCH', `/api/sessions/${session.id}/start`, 'teacher', {})).statusCode, 500);
    assert.equal((await prisma.classSession.findUniqueOrThrow({ where: { id: session.id } })).status, 'SCHEDULED');
  } finally { RoomServiceClient.prototype.createRoom = create; }
  assert.equal((await call('PATCH', `/api/sessions/${session.id}/start`, 'teacher', {})).statusCode, 200);
  const before = createdRooms.length;
  const list = RoomServiceClient.prototype.listRooms;
  try {
    RoomServiceClient.prototype.listRooms = async () => [];
    assert.equal((await call('PATCH', `/api/sessions/${session.id}/start`, 'teacher', {})).statusCode, 409);
    assert.equal(createdRooms.length, before);
    assert.equal((await call('POST', '/api/sessions/join', 'student', { roomName: course.id })).statusCode, 403);
  } finally { RoomServiceClient.prototype.listRooms = list; }
});


test('quiz submission validates every answer and snapshots survive teacher edits, concurrent grading and replay', async () => {
  const content = (await call('POST', `/api/courses/${freeId}/lessons`, 'teacher', { title: 'Snapshot lesson', description: 'Quiz snapshot verification', type: 'EXERCISE', contentUrl: 'https://example.com/snapshot', duration: 10 })).json().data;
  const quiz = (await call('POST', `/api/content/${content.id}/quiz`, 'teacher', { title: 'Original quiz', passingScore: 70 })).json().data;
  const create = async (body: any) => (await call('POST', `/api/quiz/${quiz.id}/questions`, 'teacher', body)).json().data;
  const mcq = await create({ text: 'Original choice', options: ['A', 'B'], correctAnswer: 'A', points: 2 });
  const one = await create({ text: 'Original written one', questionType: 'WRITTEN', points: 2 });
  const two = await create({ text: 'Original written two', questionType: 'WRITTEN', points: 2 });
  const answers = { [mcq.id]: 'A', [one.id]: '  مرحباً  ', [two.id]: 'جواب ثان' };
  const initial = (await call('GET', `/api/quiz/${quiz.id}`, 'student')).json().data;
  for (const invalid of [{}, { ...answers, [one.id]: '  ' }, { ...answers, foreign: 'answer' }, { ...answers, [mcq.id]: 'invented' }, { ...answers, [one.id]: 'x'.repeat(10001) }]) {
    assert.equal((await call('POST', `/api/quiz/${quiz.id}/submit`, 'student', { answers: invalid })).statusCode, 400);
  }
  assert.equal(await prisma.studentQuizResult.count({ where: { quizId: quiz.id } }), 0);
  const submissionKey = randomUUID();
  const payload = { answers, submissionKey, quizRevision: initial.revision };
  const [first, repeat] = await Promise.all([call('POST', `/api/quiz/${quiz.id}/submit`, 'student', payload), call('POST', `/api/quiz/${quiz.id}/submit`, 'student', payload)]);
  assert.equal(first.statusCode, 201, first.body); assert.equal(repeat.statusCode, 201, repeat.body);
  const result = first.json().data; assert.equal(result.id, repeat.json().data.id);
  assert.equal(await prisma.studentQuizResult.count({ where: { quizId: quiz.id } }), 1);
  assert.equal((await call('POST', `/api/quiz/${quiz.id}/submit`, 'student', { ...payload, answers: { ...answers, [two.id]: 'different' } })).statusCode, 409);
  assert.equal((await call('PATCH', `/api/quiz/${quiz.id}/questions/${one.id}`, 'teacher', { text: 'Changed to choice', questionType: 'MCQ', options: ['X', 'Y'], correctAnswer: 'Y', points: 20 })).statusCode, 200);
  assert.equal((await call('PATCH', `/api/quiz/${quiz.id}`, 'teacher', { title: 'Changed quiz', passingScore: 90 })).statusCode, 200);
  assert.equal((await call('DELETE', `/api/quiz/${quiz.id}/questions/${one.id}`, 'teacher')).statusCode, 409);
  assert.equal((await call('POST', `/api/quiz/${quiz.id}/submit`, 'student', { ...payload, submissionKey: randomUUID() })).statusCode, 409);
  const pending = (await call('GET', '/api/teacher/pending-reviews', 'teacher')).json().data.filter(a => a.resultId === result.id);
  assert.equal(pending.length, 2); assert.equal(pending.find(a => a.questionText === 'Original written one').points, 2);
  const beforePoints = (await call('GET', '/api/students/me', 'student')).json().data.totalPoints;
  const grades = await Promise.all(pending.map((a, i) => call('PATCH', `/api/teacher/answers/${a.id}/grade`, 'teacher', { pointsAwarded: i + 1, feedback: 'ملاحظة محفوظة' })));
  grades.forEach(r => assert.equal(r.statusCode, 200, r.body));
  const saved = (await call('GET', '/api/students/results', 'student')).json().data.find(r => r.id === result.id);
  assert.equal(saved.score, 83); assert.equal(saved.passed, true); assert.equal(saved.status, 'COMPLETE');
  assert.equal(saved.quizTitle, 'Original quiz'); assert.equal(saved.passingScore, 70);
  const original = saved.answers.find(a => a.questionId === one.id);
  assert.equal(original.text, 'Original written one'); assert.equal(original.points, 2); assert.equal(original.questionType, 'WRITTEN'); assert.equal(original.answerText, 'مرحباً');
  const replay = (await call('POST', `/api/quiz/${quiz.id}/submit`, 'student', payload)).json().data;
  assert.equal(replay.score, 83); assert.equal(replay.status, 'COMPLETE'); assert.equal(replay.id, result.id);
  assert.equal((await call('PATCH', `/api/teacher/answers/${pending[0].id}/grade`, 'teacher', { pointsAwarded: 1, feedback: 'ملاحظة محفوظة' })).statusCode, 200);
  assert.equal((await call('PATCH', `/api/teacher/answers/${pending[0].id}/grade`, 'teacher', { pointsAwarded: 2, feedback: 'changed' })).statusCode, 409);
  assert.equal((await call('GET', '/api/students/me', 'student')).json().data.totalPoints, beforePoints + 20);
  const parent = (await call('GET', '/api/parent/overview', 'parent')).json().data.children[0].quizResults.find(r => r.id === result.id);
  assert.equal(parent.score, 83); assert.equal(parent.status, 'COMPLETE'); assert.equal(parent.quizTitle, 'Original quiz'); assert.equal(parent.answers, undefined);
  assert.ok(!(await call('GET', '/api/students/results', 'noteStudent')).json().data.some(r => r.id === result.id));
});

test('ambiguous answer choices and excessive question points are rejected; unanswered draft questions can be deleted', async () => {
  const content = (await call('POST', `/api/courses/${freeId}/lessons`, 'teacher', { title: 'Validation lesson', description: 'Validation quiz', type: 'EXERCISE', contentUrl: 'https://example.com/validation', duration: 5 })).json().data;
  const quiz = (await call('POST', `/api/content/${content.id}/quiz`, 'teacher', { title: 'Validation quiz' })).json().data;
  const body = { text: 'Choice', options: ['A', 'A'], correctAnswer: 'A' };
  assert.equal((await call('POST', `/api/quiz/${quiz.id}/questions`, 'teacher', body)).statusCode, 400);
  assert.equal((await call('POST', `/api/quiz/${quiz.id}/questions`, 'teacher', { ...body, options: ['A', 'B'], points: 1001 })).statusCode, 400);
  const question = (await call('POST', `/api/quiz/${quiz.id}/questions`, 'teacher', { ...body, options: ['A', 'B'] })).json().data;
  assert.equal((await call('DELETE', `/api/quiz/${quiz.id}/questions/${question.id}`, 'otherTeacher')).statusCode, 404);
  assert.equal((await call('DELETE', `/api/quiz/${quiz.id}/questions/${question.id}`, 'teacher')).statusCode, 204);
});


test('verified users sharing one network have separate request limits; forged tokens and auth routes retain IP limits', async () => {
  const Fastify = (await import('fastify')).default;
  const jwt = (await import('@fastify/jwt')).default;
  const limiter = (await import('@fastify/rate-limit')).default;
  const { rateLimitKey } = await import('../apps/api/src/lib/rate-limit');
  const server = Fastify();
  await server.register(jwt, { secret: 'rate-limit-test-secret' });
  await server.register(limiter, { max: 2, timeWindow: '1 minute', keyGenerator: req => rateLimitKey(req, token => server.jwt.verify<{ id: string }>(token)) });
  server.get('/protected', async () => ({ ok: true }));
  server.get('/api/auth/check', async () => ({ ok: true }));
  const one = server.jwt.sign({ id: 'one' }); const two = server.jwt.sign({ id: 'two' });
  const send = (token?: string, path = '/protected', remoteAddress = '10.5.5.1') => server.inject({ method: 'GET', url: path, remoteAddress, headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    assert.equal((await send(one)).statusCode, 200); assert.equal((await send(one)).statusCode, 200); assert.equal((await send(one)).statusCode, 429);
    assert.equal((await send(two)).statusCode, 200);
    assert.equal((await send()).statusCode, 200); assert.equal((await send()).statusCode, 200);
    const forged = one.slice(0, one.lastIndexOf('.') + 1) + 'invalid';
    assert.equal((await send(forged)).statusCode, 429);
    assert.equal((await send(server.jwt.sign({ id: 'expired' }, { expiresIn: -1 }))).statusCode, 429);
    assert.equal((await send(one, '/api/auth/check', '10.5.5.2')).statusCode, 200); assert.equal((await send(one, '/api/auth/check', '10.5.5.2')).statusCode, 200);
    assert.equal((await send(two, '/api/auth/check', '10.5.5.2')).statusCode, 429);
  } finally { await server.close(); }
});
