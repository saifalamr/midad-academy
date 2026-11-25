import { prisma } from './prisma';
import { RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config';

export type Actor = { id: string; role: string };

export async function canAccessCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role === 'ADMIN')
    return !!(await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } }));
  if (actor.role === 'TEACHER') {
    return !!(await prisma.course.findFirst({
      where: { id: courseId, teacher: { userId: actor.id } },
      select: { id: true },
    }));
  }
  if (actor.role === 'STUDENT') {
    return !!(await prisma.enrollment.findFirst({
      where: { courseId, status: 'ACTIVE', student: { userId: actor.id } },
      select: { id: true },
    }));
  }
  return false;
}

export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

// Observation is limited to live classrooms, not general child course data.
export async function canObserveCourse(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role !== 'PARENT') return false;
  return !!(await prisma.enrollment.findFirst({
    where: { courseId, status: 'ACTIVE', student: { parent: { userId: actor.id } } },
    select: { id: true },
  }));
}
export async function parentHasChildInRoom(parentUserId: string, courseId: string, identities: string[]) {
  if (!identities.length) return false;
  return !!(await prisma.studentProfile.findFirst({
    where: {
      userId: { in: identities },
      parent: { userId: parentUserId },
      enrollments: { some: { courseId, status: 'ACTIVE' } },
    },
    select: { id: true },
  }));
}
export async function canReadClassroom(actor: Actor, courseId: string): Promise<boolean> {
  if (actor.role === 'ADMIN')
    return !!(await prisma.classSession.findFirst({
      where: { courseId, status: 'LIVE' },
      select: { id: true },
    }));
  if (actor.role !== 'PARENT') return canAccessCourse(actor, courseId);
  if (!(await canObserveCourse(actor, courseId))) return false;
  const live = await prisma.classSession.findFirst({
    where: { courseId, status: 'LIVE' },
    select: { liveKitRoomId: true },
  });
  if (!live?.liveKitRoomId || !config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
    return false;
  const service = new RoomServiceClient(
    config.LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
    config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET
  );
  const participants = await service.listParticipants(live.liveKitRoomId);
  return parentHasChildInRoom(actor.id, courseId, participants.map((person) => person.identity));
}
