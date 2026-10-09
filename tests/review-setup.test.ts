import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { prepareReview } from '../apps/api/src/lib/prepare-review';

process.env.NODE_ENV = 'test';
test('review preparation refuses other deployments and paid data, cleans dependencies atomically, and preserves later reviewer work', async () => {
  const local = await import('../scripts/dev-db.mjs');
  const { prisma } = await import('../apps/api/src/lib/prisma');
  try {
    const teacher = await prisma.user.create({ data: { name: 'Old preview teacher', email: 'old-teacher@midad.test', passwordHash: 'unused', role: 'TEACHER', teacherProfile: { create: { bio: '', qualifications: [], hourlyRate: 0 } } }, include: { teacherProfile: true } });
    const student = await prisma.user.create({ data: { name: 'Old preview student', email: 'old-student@midad.test', passwordHash: 'unused', role: 'STUDENT', studentProfile: { create: { age: 10, totalPoints: 20 } } }, include: { studentProfile: true } });
    const course = await prisma.course.create({ data: { title: 'Old course', description: 'Old preview course', level: 'beginner', ageGroup: '8–10', price: 0, teacherId: teacher.teacherProfile!.id,
      lessons: { create: { title: 'Old lesson', description: '', scheduledAt: new Date(), durationMinutes: 30 } },
      content: { create: { title: 'Old quiz', description: '', order: 0, type: 'EXERCISE', contentUrl: 'https://example.com', duration: 10, quiz: { create: { title: 'Old quiz', questions: { create: { text: 'Old question', options: ['A', 'B'], correctAnswer: 'A' } } } } } },
      enrollments: { create: { studentId: student.studentProfile!.id } },
      whiteboard: { create: { state: Buffer.from('old drawing') } },
      classroomState: { create: { sharedDoc: { name: 'Old shared file' } } },
      drawingPermissions: { create: { userId: student.id } },
      classSessions: { create: { teacherId: teacher.teacherProfile!.id, title: 'Old session', scheduledAt: new Date(), attendance: { create: { studentId: student.studentProfile!.id } } } },
    }, include: { content: { include: { quiz: true } } } });
    await prisma.studentQuizResult.create({ data: { quizId: course.content[0].quiz!.id, studentId: student.studentProfile!.id, score: 100, passed: true, answers: {} } });
    await prisma.learningState.create({ data: { contentId: course.content[0].id, studentId: student.studentProfile!.id, note: 'Private test note' } });
    const payment = await prisma.payment.create({ data: { userId: student.id, courseId: course.id, amount: 0, provider: 'test', status: 'COMPLETED' } });
    const hash = await bcrypt.hash('PrivateReviewPassword!', 10);
    const env = { RENDER_SERVICE_ID: 'srv-db3m9ad9fdbs73ed597g', RENDER_EXTERNAL_URL: 'https://midad-preview-api.onrender.com', DATABASE_URL: 'postgresql://unused@dpg-db3m90l9fdbs73ed4ct0-a/midad_preview', PREVIEW_REVIEW_SETUP: JSON.stringify({ confirm: 'clear-midad-preview-for-review-20261009', hashes: [hash, hash, hash] }) };
    assert.equal((await prepareReview(prisma, {})).status, 'disabled');
    await assert.rejects(prepareReview(prisma, { ...env, RENDER_SERVICE_ID: 'different-deployment' }), /not the authorized/);
    await assert.rejects(prepareReview(prisma, env), /paid transactions/);
    assert.equal(await prisma.course.count(), 1);
    assert.equal(await prisma.user.count({ where: { email: { endsWith: '.review@midad.test' } } }), 0);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    const result = await prepareReview(prisma, env);
    assert.equal(result.status, 'prepared');
    for (const table of ['course', 'lesson', 'courseContent', 'quiz', 'studentQuizResult', 'enrollment', 'classSession', 'sessionAttendance', 'whiteboardDocument', 'classroomState', 'drawingPermission', 'learningState', 'payment'] as const) assert.equal(await (prisma[table] as any).count(), 0, table);
    const reviewer = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher.review@midad.test' }, include: { teacherProfile: true } });
    assert.equal(await bcrypt.compare('PrivateReviewPassword!', reviewer.passwordHash), true);
    assert.equal(await prisma.user.count({ where: { email: { endsWith: '.review@midad.test' } } }), 3);
    assert.equal((await prisma.studentProfile.findUniqueOrThrow({ where: { userId: student.id } })).totalPoints, 0);
    await prisma.course.create({ data: { teacherId: reviewer.teacherProfile!.id, title: 'Reviewer work', description: '', level: 'beginner', ageGroup: '8–10', price: 0 } });
    assert.equal((await prepareReview(prisma, env)).status, 'already-prepared');
    assert.equal(await prisma.course.count(), 1);
  } finally { await prisma.$disconnect(); await local.server.stop(); await local.db.close(); }
});
