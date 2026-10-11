import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { dispatchNotifications, notificationConfiguration } from '../lib/notifications';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/preferences', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'PARENT')
      return reply.status(403).send({ error: 'Parent access required' });
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.user.id },
      select: { whatsappOptIn: true, whatsappPhone: true },
    });
    return { data: user };
  });
  app.put('/preferences', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'PARENT')
      return reply.status(403).send({ error: 'Parent access required' });
    const body = z.object({ whatsappOptIn: z.boolean() }).parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
    if (body.whatsappOptIn && !/^\+?[1-9]\d{7,14}$/.test(user.whatsappPhone ?? ''))
      return reply.status(400).send({ error: 'أضف رقم واتساب صالحًا في حسابك أولًا.' });
    await prisma.user.update({ where: { id: user.id }, data: body });
    if (!body.whatsappOptIn)
      await prisma.whatsAppNotification.updateMany({
        where: { recipientUserId: user.id, status: 'PENDING' },
        data: { status: 'SKIPPED', lastError: 'أوقف ولي الأمر الرسائل.' },
      });
    return { data: { ...body, whatsappPhone: user.whatsappPhone } };
  });
  app.get('/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN')
      return reply.status(403).send({ error: 'Admin access required' });
    const notifications = await prisma.whatsAppNotification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        acceptedAt: true,
        recipient: { select: { name: true } },
      },
    });
    return { data: { ...notificationConfiguration(), notifications } };
  });
  let running = false;
  async function run() {
    if (running) return { busy: true };
    running = true;
    try {
      return await dispatchNotifications();
    } finally {
      running = false;
    }
  }
  app.post('/dispatch', async (request, reply) => {
    const supplied = request.headers['x-cron-secret'];
    const expected = config.NOTIFICATIONS_CRON_SECRET;
    if (
      typeof supplied !== 'string' ||
      expected.length < 32 ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return reply.status(401).send({ error: 'Unauthorized' });
    return run();
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    const state = notificationConfiguration();
    if (state.enabled && state.configured)
      timer = setInterval(() => {
        void run().catch(() => app.log.error('Notification dispatch failed'));
      }, 30_000);
    timer?.unref();
  });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
  });
}
