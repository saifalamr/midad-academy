import type { Prisma } from '@prisma/client';
import { setDrawingPermission } from '../ws-server';

// The caller holds the course lock. Only the session actually completed may
// clear grants; a duplicate/delayed webhook must not affect the next classroom.
export async function completeClassroom(
  tx: Prisma.TransactionClient,
  courseId: string,
  sessionIds: string[]
) {
  const endedAt = new Date();
  const completed = await tx.classSession.updateMany({
    where: { id: { in: sessionIds }, courseId, status: 'LIVE' },
    data: { status: 'COMPLETED', endedAt },
  });
  if (!completed.count) return;
  await tx.classroomVisit.updateMany({
    where: { sessionId: { in: sessionIds }, leftAt: null },
    data: { leftAt: endedAt, exitSource: 'SESSION_END' },
  });
  await tx.sessionSpeakingPermission.deleteMany({ where: { sessionId: { in: sessionIds } } });
  const grants = await tx.drawingPermission.findMany({ where: { courseId } });
  await tx.drawingPermission.deleteMany({ where: { courseId } });
  grants.forEach((grant) => setDrawingPermission(courseId, grant.userId, false));
}
