import type { Prisma, WhatsAppNotification } from '@prisma/client';
import { config } from '../config';
import { prisma } from './prisma';

type Tx = Prisma.TransactionClient;
export function notificationConfiguration() {
  const configured = !!(
    config.WHATSAPP_ACCESS_TOKEN &&
    /^\d+$/.test(config.WHATSAPP_PHONE_NUMBER_ID) &&
    /^v\d+\.\d+$/.test(config.WHATSAPP_API_VERSION) &&
    config.WHATSAPP_TEMPLATE_NAME
  );
  return {
    enabled: config.WHATSAPP_ENABLED,
    configured,
    schedulerConfigured: config.NOTIFICATIONS_CRON_SECRET.length >= 32,
  };
}
const validPhone = (phone: string | null) => !!phone && /^\+?[1-9]\d{7,14}$/.test(phone);
export async function queueFamilyNotification(
  tx: Tx,
  kind: 'REPORT' | 'GRADE',
  referenceId: string,
  studentId: string
) {
  const student = await tx.studentProfile.findUnique({
    where: { id: studentId },
    include: { parent: { include: { user: true } } },
  });
  const parent = student?.parent?.user;
  if (!parent) return;
  const consent = parent.whatsappOptIn && validPhone(parent.whatsappPhone);
  await tx.whatsAppNotification.upsert({
    where: { key: `${kind}:${referenceId}:${parent.id}` },
    update: {},
    create: {
      key: `${kind}:${referenceId}:${parent.id}`,
      recipientUserId: parent.id,
      studentId,
      kind,
      referenceId,
      status: consent ? 'PENDING' : 'SKIPPED',
      lastError: consent ? '' : 'ولي الأمر لم يوافق على الرسائل أو رقمه غير صالح.',
    },
  });
}
export async function enqueueReminders(now = new Date()) {
  const sessions = await prisma.classSession.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { gt: now, lte: new Date(now.getTime() + 600_000) },
    },
    take: 100,
  });
  for (const session of sessions) {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        courseId: session.courseId,
        status: 'ACTIVE',
        student: { parent: { user: { whatsappOptIn: true } } },
      },
      include: { student: { include: { parent: { include: { user: true } } } } },
    });
    for (const enrollment of enrollments) {
      const parent = enrollment.student.parent!.user;
      if (!validPhone(parent.whatsappPhone)) continue;
      const key = `REMINDER:${session.id}:${enrollment.studentId}:${parent.id}`;
      await prisma.whatsAppNotification.upsert({
        where: { key },
        update: {},
        create: {
          key,
          kind: 'REMINDER',
          referenceId: session.id,
          studentId: enrollment.studentId,
          recipientUserId: parent.id,
          availableAt: new Date(session.scheduledAt.getTime() - 600_000),
        },
      });
    }
  }
}
async function messageFor(item: WhatsAppNotification, now: Date) {
  const child = await prisma.studentProfile.findUnique({
    where: { id: item.studentId },
    include: { user: true, parent: { include: { user: true } } },
  });
  const parent = child?.parent?.user;
  if (
    !child ||
    !parent ||
    parent.id !== item.recipientUserId ||
    !parent.whatsappOptIn ||
    !validPhone(parent.whatsappPhone)
  )
    return null;
  let title: string, update: string, path: string;
  if (item.kind === 'REMINDER') {
    const session = await prisma.classSession.findUnique({
      where: { id: item.referenceId },
      include: { course: true },
    });
    const enrolled =
      session &&
      (await prisma.enrollment.findFirst({
        where: { courseId: session.courseId, studentId: child.id, status: 'ACTIVE' },
      }));
    if (!session || !enrolled || session.status !== 'SCHEDULED' || session.scheduledAt <= now)
      return null;
    title = session.course.title;
    update = `تذكير بحصة ${session.title}: ${session.scheduledAt.toLocaleString('ar', { timeZone: session.course.timeZone })} (${session.course.timeZone})`;
    path = '/parent';
  } else if (item.kind === 'REPORT') {
    const report = await prisma.sessionReport.findUnique({
      where: { id: item.referenceId },
      include: { session: { include: { course: true } } },
    });
    if (!report?.publishedAt || report.studentId !== child.id) return null;
    title = report.session.course.title;
    update = `تقرير حصة ${report.session.title}: ${report.note.slice(0, 700)}`;
    path = '/parent';
  } else if (item.kind === 'GRADE') {
    const grade = await prisma.homeworkSubmission.findUnique({
      where: { id: item.referenceId },
      include: { homework: { include: { session: { include: { course: true } } } } },
    });
    if (!grade?.publishedAt || grade.studentId !== child.id) return null;
    const scores = grade.grades as Record<string, number>;
    const questions = grade.homework.questions as { points: number }[];
    title = grade.homework.session.course.title;
    update = `نتيجة واجب ${grade.homework.title}: ${Object.values(scores).reduce((n, score) => n + score, 0)} / ${questions.reduce((n, q) => n + q.points, 0)}. ${grade.feedback.slice(0, 500)}`;
    path = '/parent/homework';
  } else return null;
  return {
    to: parent.whatsappPhone!.replace(/^\+/, ''),
    parameters: [
      child.user.name,
      title,
      update,
      `${config.FRONTEND_URL.replace(/\/$/, '')}${path}`,
    ].map((text) => text.replace(/\s+/g, ' ').trim().slice(0, 1000)),
  };
}
// Provider acceptance is not proof of delivery. Ambiguous transport failures are
// never retried automatically because the provider might already have sent them.
export async function dispatchNotifications(now = new Date()) {
  const state = notificationConfiguration();
  if (!state.enabled || !state.configured) return { ...state, processed: 0 };
  await enqueueReminders(now);
  await prisma.whatsAppNotification.updateMany({
    where: { status: 'SENDING', lockedAt: { lt: new Date(now.getTime() - 120_000) } },
    data: {
      status: 'UNKNOWN',
      lastError: 'انقطع تأكيد الإرسال. يلزم فحص المزود قبل إعادة المحاولة.',
    },
  });
  let processed = 0;
  for (let i = 0; i < 10; i++) {
    const item = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "WhatsAppNotification" WHERE status = 'PENDING' AND "availableAt" <= (${now.toISOString()}::timestamptz AT TIME ZONE 'UTC') ORDER BY "availableAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!rows[0]) return null;
      return tx.whatsAppNotification.update({
        where: { id: rows[0].id },
        data: { status: 'SENDING', attempts: { increment: 1 }, lockedAt: new Date() },
      });
    });
    if (!item) break;
    processed++;
    try {
      const message = await messageFor(item, new Date());
      if (!message) {
        await prisma.whatsAppNotification.update({
          where: { id: item.id },
          data: { status: 'SKIPPED', lastError: 'الموافقة أو صلة ولي الأمر أو حالة الحصة تغيرت.' },
        });
        continue;
      }
      const response = await fetch(
        `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.to,
            type: 'template',
            template: {
              name: config.WHATSAPP_TEMPLATE_NAME,
              language: { code: config.WHATSAPP_TEMPLATE_LANGUAGE },
              components: [
                {
                  type: 'body',
                  parameters: message.parameters.map((text) => ({ type: 'text', text })),
                },
              ],
            },
          }),
        }
      );
      if (!response.ok) {
        const retry = (response.status === 429 || response.status >= 500) && item.attempts < 5;
        await prisma.whatsAppNotification.update({
          where: { id: item.id },
          data: {
            status: retry ? 'PENDING' : 'FAILED',
            availableAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** item.attempts) * 1000),
            lastError: `المزود رفض الطلب (HTTP ${response.status}).`,
          },
        });
      } else {
        const payload = (await response.json()) as { messages?: { id: string }[] };
        const providerId = payload.messages?.[0]?.id;
        await prisma.whatsAppNotification.update({
          where: { id: item.id },
          data: {
            status: providerId ? 'ACCEPTED' : 'UNKNOWN',
            providerId,
            acceptedAt: providerId ? new Date() : null,
            lastError: providerId ? '' : 'لا يوجد رقم تأكيد من المزود.',
          },
        });
      }
    } catch {
      await prisma.whatsAppNotification.update({
        where: { id: item.id },
        data: {
          status: 'UNKNOWN',
          lastError: 'تعذر تأكيد الإرسال. افحص المزود قبل إعادة المحاولة.',
        },
      });
    }
  }
  return { ...state, processed };
}
