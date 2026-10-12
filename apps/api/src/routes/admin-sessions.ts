import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { roomService, syncPresence } from '../lib/classroom-control';
export async function adminSessionRoutes(app: FastifyInstance) {
  // Inherits the administration-only authentication hook from /api/admin.
  app.get<{ Params: { id: string } }>('/sessions/:id/details', async (request) => {
    const initial = await prisma.classSession.findUnique({ where: { id: request.params.id } });
    if (!initial) throw httpError(404, 'الحصة غير موجودة');
    let currentIds: Set<string> | null = null;
    let snapshotAt: Date | null = null;
    if (initial.status === 'LIVE' && initial.liveKitRoomId) {
      try {
        const participants = await roomService().listParticipants(initial.liveKitRoomId);
        snapshotAt = new Date();
        await syncPresence(initial, participants, snapshotAt);
        currentIds = new Set(participants.filter((p) => p.sid).map((p) => p.identity));
      } catch {
        request.log.warn({ sessionId: initial.id }, 'Live attendance snapshot unavailable');
      }
    }
    const session = await prisma.classSession.findUniqueOrThrow({
      where: { id: initial.id },
      include: {
        teacher: { select: { user: { select: { id: true, name: true } } } },
        course: {
          select: {
            title: true,
            timeZone: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              select: {
                student: {
                  select: { id: true, user: { select: { id: true, name: true, username: true } } },
                },
              },
            },
          },
        },
        reports: {
          select: {
            student: {
              select: { id: true, user: { select: { id: true, name: true, username: true } } },
            },
          },
        },
        attendance: {
          select: {
            joinedAt: true,
            student: {
              select: { id: true, user: { select: { id: true, name: true, username: true } } },
            },
          },
        },
        visits: {
          orderBy: { joinedAt: 'asc' },
          select: {
            id: true,
            userId: true,
            role: true,
            joinedAt: true,
            lastSeenAt: true,
            leftAt: true,
            exitSource: true,
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                studentProfile: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    const present = (userId: string) =>
      session.status !== 'LIVE' ? false : currentIds ? currentIds.has(userId) : null;
    const activity = (userId: string, legacyJoin?: Date) => {
      const visits = session.visits
        .filter((v) => v.userId === userId)
        .map(({ user: _user, role: _role, userId: _userId, ...visit }) => visit);
      const entries = visits.filter((v) => v.joinedAt);
      const joinedTimes = [
        ...entries.map((v) => v.joinedAt!.getTime()),
        ...(legacyJoin ? [legacyJoin.getTime()] : []),
      ];
      const firstJoinedAt = joinedTimes.length ? new Date(Math.min(...joinedTimes)) : null;
      const lastLeftAt = visits.some((v) => !v.leftAt)
        ? null
        : visits.length
          ? new Date(Math.max(...visits.filter((v) => v.leftAt).map((v) => v.leftAt!.getTime())))
          : null;
      return {
        hasJoined: !!firstJoinedAt || visits.length > 0 || present(userId) === true,
        present: present(userId),
        firstJoinedAt,
        lastLeftAt,
        visits,
        entryCount: entries.length || (legacyJoin ? 1 : 0),
      };
    };
    const roster = new Map<
      string,
      { id: string; user: { id: string; name: string; username: string | null } }
    >();
    // The frozen starting roster and historical attendees survive later enrollment cancellation.
    const baseline = session.status === 'SCHEDULED' ? session.course.enrollments : session.reports;
    for (const item of [...baseline, ...session.attendance])
      roster.set(item.student.id, item.student);
    for (const visit of session.visits)
      if (visit.role === 'STUDENT' && visit.user.studentProfile)
        roster.set(visit.user.studentProfile.id, {
          id: visit.user.studentProfile.id,
          user: visit.user,
        });
    if (session.status === 'LIVE')
      for (const e of session.course.enrollments) roster.set(e.student.id, e.student);
    const students = [...roster.values()]
      .map((student) => ({
        id: student.id,
        userId: student.user.id,
        name: student.user.name,
        username: student.user.username,
        ...activity(
          student.user.id,
          session.attendance.find((a) => a.student.id === student.id)?.joinedAt
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return {
      data: {
        id: session.id,
        courseId: session.courseId,
        title: session.title,
        courseTitle: session.course.title,
        timeZone: session.course.timeZone,
        scheduledAt: session.scheduledAt,
        durationMinutes: session.durationMinutes,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        snapshotAt,
        livePresenceAvailable: session.status === 'LIVE' ? !!currentIds : true,
        teacher: { name: session.teacher.user.name, ...activity(session.teacher.user.id) },
        students,
        summary: {
          registered: students.length,
          attended: students.filter((s) => s.hasJoined).length,
          present:
            session.status === 'LIVE' && !currentIds
              ? null
              : students.filter((s) => s.present === true).length,
          notJoined: students.filter((s) => !s.hasJoined).length,
        },
      },
    };
  });
}
