import { prisma } from './prisma';
export async function awardQuiz(resultId: string) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.studentQuizResult.findUnique({ where: { id: resultId } });
    if (!result?.passed || result.status !== 'COMPLETE') return;
    const awarded = await tx.pointTransaction.createMany({ data: { studentId: result.studentId, points: 20, event: 'Quiz passed', eventKey: `quiz:${result.quizId}:${result.studentId}` }, skipDuplicates: true });
    if (awarded.count) await tx.studentProfile.update({ where: { id: result.studentId }, data: { totalPoints: { increment: 20 } } });
    if (result.score === 100) {
      const badge = await tx.badge.upsert({ where: { name: 'Perfect Score' }, update: {}, create: { name: 'Perfect Score', description: 'Scored 100% on a quiz', iconUrl: '/badges/perfect-score.svg' } });
      await tx.achievement.upsert({ where: { studentId_badgeId: { studentId: result.studentId, badgeId: badge.id } }, update: {}, create: { studentId: result.studentId, badgeId: badge.id } });
    }
  });
}
