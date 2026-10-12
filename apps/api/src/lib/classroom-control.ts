import type { ClassSession, Prisma } from '@prisma/client';
import { RoomServiceClient, TrackSource, type ParticipantInfo } from 'livekit-server-sdk';
import { config } from '../config';
import { prisma } from './prisma';
import { httpError } from './access';
import { lockCourse } from './enrollment';
export const studentPublishSources = (allowed: boolean) => [
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  ...(allowed ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE_AUDIO] : []),
];
export function roomService() {
  if (!config.LIVEKIT_URL || !config.LIVEKIT_API_KEY || !config.LIVEKIT_API_SECRET)
    throw httpError(503, 'خدمة الحصة غير مهيأة');
  return new RoomServiceClient(
    config.LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
    config.LIVEKIT_API_KEY,
    config.LIVEKIT_API_SECRET,
    { requestTimeout: 8 }
  );
}
export function providerTime(value: unknown, fallback?: Date): Date | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 && seconds < Date.now() / 1000 + 120
    ? new Date(seconds * 1000)
    : (fallback ?? null);
}
type Identity = { identity: string; sid?: string; joinedAt?: unknown };
// Only provider-verified events/snapshots reach this function. Browser claims are never attendance proof.
export async function recordPresence(
  tx: Prisma.TransactionClient,
  session: ClassSession,
  participant: Identity,
  kind: 'JOIN' | 'LEAVE' | 'SNAPSHOT',
  occurredAt: Date
) {
  const user = await tx.user.findUnique({
    where: { id: participant.identity },
    include: { studentProfile: true, teacherProfile: true },
  });
  if (!user || !['TEACHER', 'STUDENT'].includes(user.role)) return;
  if (user.role === 'TEACHER' && user.teacherProfile?.id !== session.teacherId) return;
  if (user.role === 'STUDENT') {
    if (!user.studentProfile) return;
    const studentId = user.studentProfile.id;
    const eligible =
      (await tx.sessionReport.findUnique({
        where: { sessionId_studentId: { sessionId: session.id, studentId } },
      })) ||
      (await tx.sessionAttendance.findUnique({
        where: { sessionId_studentId: { sessionId: session.id, studentId } },
      })) ||
      (await tx.enrollment.findFirst({
        where: { courseId: session.courseId, studentId, status: 'ACTIVE' },
      }));
    if (!eligible) return;
    if (kind !== 'LEAVE' || providerTime(participant.joinedAt)) {
      const joinedAt = providerTime(participant.joinedAt, occurredAt)!;
      await tx.sessionAttendance.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId } },
        create: { sessionId: session.id, studentId, joinedAt },
        update: {},
      });
      const award = await tx.pointTransaction.createMany({
        data: {
          studentId,
          points: 10,
          event: 'Class attendance',
          eventKey: `attendance:${session.id}:${studentId}`,
        },
        skipDuplicates: true,
      });
      if (award.count)
        await tx.studentProfile.update({
          where: { id: studentId },
          data: { totalPoints: { increment: 10 } },
        });
    }
  }
  if (!participant.sid) return; // Legacy events still record student attendance without inventing a connection ID.
  const where = {
    sessionId_participantSid: { sessionId: session.id, participantSid: participant.sid },
  };
  const old = await tx.classroomVisit.findUnique({ where });
  const joinedAt = providerTime(participant.joinedAt, kind === 'LEAVE' ? undefined : occurredAt);
  const earliest =
    old?.joinedAt && joinedAt
      ? new Date(Math.min(old.joinedAt.getTime(), joinedAt.getTime()))
      : (old?.joinedAt ?? joinedAt);
  let leftAt = old?.leftAt ?? null,
    exitSource = old?.exitSource ?? null;
  if (kind === 'LEAVE' && (!leftAt || occurredAt <= leftAt || exitSource !== 'WEBHOOK')) {
    leftAt = session.endedAt && occurredAt > session.endedAt ? session.endedAt : occurredAt;
    exitSource = session.endedAt && occurredAt > session.endedAt ? 'SESSION_END' : 'WEBHOOK';
  } else if (kind === 'SNAPSHOT' && session.status === 'LIVE' && exitSource === 'OBSERVED') {
    leftAt = null;
    exitSource = null;
  }
  if (!leftAt && session.status === 'COMPLETED' && session.endedAt) {
    leftAt = session.endedAt;
    exitSource = 'SESSION_END';
  }
  await tx.classroomVisit.upsert({
    where,
    create: {
      sessionId: session.id,
      userId: user.id,
      role: user.role,
      participantSid: participant.sid,
      joinedAt: earliest,
      leftAt,
      exitSource,
      lastSeenAt: occurredAt,
    },
    update: {
      joinedAt: earliest,
      leftAt,
      exitSource,
      ...(kind === 'SNAPSHOT' ? { lastSeenAt: occurredAt } : {}),
    },
  });
}
export async function syncPresence(
  session: ClassSession,
  participants: ParticipantInfo[],
  now = new Date(),
  onlyUserId?: string
) {
  await prisma.$transaction(
    async (tx) => {
      await lockCourse(tx, session.courseId);
      const current = await tx.classSession.findUniqueOrThrow({ where: { id: session.id } });
      if (current.status !== 'LIVE' || current.liveKitRoomId !== session.liveKitRoomId) return;
      for (const participant of participants)
        if (
          participant.identity &&
          participant.sid &&
          (!onlyUserId || participant.identity === onlyUserId)
        )
          await recordPresence(tx, current, participant, 'SNAPSHOT', now);
      const present = participants.map((p) => p.sid).filter(Boolean);
      await tx.classroomVisit.updateMany({
        where: {
          sessionId: current.id,
          ...(onlyUserId ? { userId: onlyUserId } : {}),
          leftAt: null,
          lastSeenAt: { lte: now },
          participantSid: { notIn: present },
        },
        data: { leftAt: now, exitSource: 'OBSERVED' },
      });
    },
    { timeout: 20_000 }
  );
}
export async function applySpeakingState(courseId: string, sessionId: string, onlyUserId?: string) {
  // Read the latest committed permission while holding the same lock as moderation/end.
  // Fresh application-issued tokens are microphone-locked; this server grants connected speakers.
  return prisma.$transaction(
    async (tx) => {
      await lockCourse(tx, courseId);
      const session = await tx.classSession.findFirst({
        where: { id: sessionId, courseId, status: 'LIVE' },
      });
      if (!session?.liveKitRoomId) throw httpError(409, 'هذه الحصة انتهت');
      const service = roomService();
      const participants = await service.listParticipants(session.liveKitRoomId);
      const students = await tx.studentProfile.findMany({
        where: {
          user: { role: 'STUDENT' },
          userId: {
            in: participants
              .map((p) => p.identity)
              .filter((id) => !onlyUserId || id === onlyUserId),
          },
        },
        select: {
          userId: true,
          enrollments: { where: { courseId, status: 'ACTIVE' }, select: { id: true } },
        },
      });
      const allowed = await tx.sessionSpeakingPermission.findMany({
        where: { sessionId },
        select: { userId: true },
      });
      const results = await Promise.allSettled(
        students.map(async (student) => {
          const sources = studentPublishSources(
            !!student.enrollments.length && allowed.some((p) => p.userId === student.userId)
          );
          const participant = participants.find((p) => p.identity === student.userId);
          const permission = participant?.permission;
          const matches =
            permission?.canPublish &&
            permission.canSubscribe &&
            permission.canPublishData &&
            !permission.canUpdateMetadata &&
            sources.length === permission.canPublishSources.length &&
            sources.every((source) => permission.canPublishSources.includes(source));
          const operations: Promise<unknown>[] = [];
          if (!sources.includes(TrackSource.MICROPHONE)) {
            for (const track of participant?.tracks ?? []) {
              if (
                [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE_AUDIO].includes(track.source) &&
                !track.muted
              )
                operations.push(
                  service
                    .mutePublishedTrack(session.liveKitRoomId!, student.userId, track.sid, true)
                    .catch((error) => {
                      if ((error as { code?: string }).code !== 'not_found') throw error;
                    })
                );
            }
          }
          if (!matches)
            operations.push(
              service.updateParticipant(session.liveKitRoomId!, student.userId, {
                permission: {
                  canPublish: true,
                  canSubscribe: true,
                  canPublishData: true,
                  canUpdateMetadata: false,
                  canPublishSources: sources,
                },
              })
            );
          const applied = await Promise.allSettled(operations);
          if (applied.some((result) => result.status === 'rejected'))
            throw new Error('Provider did not confirm microphone control');
        })
      );
      if (results.some((result) => result.status === 'rejected'))
        throw httpError(
          502,
          'حُفظ الإذن، لكن تعذر تأكيد تطبيقه على المكالمة. أعد المحاولة؛ لا تعتبر الكتم مؤكّدًا بعد.'
        );
      return session;
    },
    { timeout: 20_000 }
  );
}
