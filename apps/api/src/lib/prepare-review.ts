import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// One-time, operator-enabled preparation of this particular disposable preview.
// No route exposes this operation, and it is disabled unless explicitly armed.
const payloadSchema = z.object({
  confirm: z.literal('clear-midad-preview-for-review-20261009'),
  hashes: z.array(z.string().regex(/^\$2[aby]\$\d{2}\$.{53}$/)).length(3),
});
const accounts = [
  { email: 'teacher.review@midad.test', name: 'مدرس الاختبار', role: 'TEACHER' },
  { email: 'student.review@midad.test', name: 'طالب الاختبار', role: 'STUDENT' },
  { email: 'parent.review@midad.test', name: 'ولي أمر الاختبار', role: 'PARENT' },
] as const;

export async function prepareReview(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  if (!env.PREVIEW_REVIEW_SETUP) return { status: 'disabled' as const };
  const database = new URL(env.DATABASE_URL ?? '');
  if (env.RENDER_SERVICE_ID !== 'srv-db3m9ad9fdbs73ed597g' ||
      database.hostname !== 'dpg-db3m90l9fdbs73ed4ct0-a' ||
      database.pathname !== '/midad_preview' ||
      env.RENDER_EXTERNAL_URL !== 'https://midad-preview-api.onrender.com') {
    throw new Error('Review setup refused: this is not the authorized Midad preview');
  }
  const payload = payloadSchema.parse(JSON.parse(env.PREVIEW_REVIEW_SETUP));
  return db.$transaction(async tx => {
    const existing = await tx.user.findMany({ where: { email: { in: accounts.map(a => a.email) } } });
    if (existing.length === 3 && accounts.every(a => existing.some(u => u.email === a.email && u.role === a.role))) {
      // Do not erase anything the reviewer has created on a subsequent restart.
      return { status: 'already-prepared' as const };
    }
    if (existing.length) throw new Error('Review setup refused: partial or conflicting review accounts');
    if (await tx.payment.count({ where: { status: { in: ['COMPLETED', 'REFUNDED'] } } })) {
      throw new Error('Review setup refused: paid transactions require separate review');
    }
    const count = await tx.course.count();
    if (count > 100) throw new Error('Review setup refused: unexpected preview data volume');
    const lessons = await tx.lesson.count();
    const materials = await tx.courseContent.count();
    const sessions = await tx.classSession.count();

    // Dependencies with no cascade are removed explicitly. Course deletion
    // cascades to quizzes, answers, learning notes, boards and session attendance.
    await tx.payment.deleteMany();
    await tx.enrollment.deleteMany();
    await tx.lesson.deleteMany();
    await tx.course.deleteMany();
    await tx.achievement.deleteMany();
    await tx.pointTransaction.deleteMany();
    await tx.studentProfile.updateMany({ data: { totalPoints: 0, level: 'beginner', parentId: null, parentLinkHash: null, parentLinkExpiresAt: null } });

    for (const [i, account] of accounts.entries()) {
      await tx.user.create({ data: {
        ...account, passwordHash: payload.hashes[i],
        ...(account.role === 'TEACHER' ? { teacherProfile: { create: { bio: '', qualifications: [], hourlyRate: 0 } } } :
          account.role === 'STUDENT' ? { studentProfile: { create: { age: 10 } } } : { parentProfile: { create: {} } }),
      } });
    }
    return { status: 'prepared' as const, removed: { courses: count, lessons, materials, sessions }, accounts: 3 };
  }, { isolationLevel: 'Serializable', timeout: 30000 });
}
