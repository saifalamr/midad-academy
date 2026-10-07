import type { Prisma } from '@prisma/client';
import { setDrawingPermission } from '../ws-server';

// The caller holds the course lock. Only the session actually completed may
// clear grants; a duplicate/delayed webhook must not affect the next classroom.
export async function completeClassroom(tx: Prisma.TransactionClient, courseId: string, sessionIds: string[]) {
  const completed = await tx.classSession.updateMany({
    where: { id: { in: sessionIds }, courseId, status: 'LIVE' }, data: { status: 'COMPLETED' },
  });
  if (!completed.count) return;
  const grants = await tx.drawingPermission.findMany({ where: { courseId } });
  await tx.drawingPermission.deleteMany({ where: { courseId } });
  grants.forEach(grant => setDrawingPermission(courseId, grant.userId, false));
}
