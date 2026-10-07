import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
type CheckoutSession = Awaited<ReturnType<InstanceType<typeof Stripe>['checkout']['sessions']['retrieve']>>;
type StripeEvent = ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']>;
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { config } from '../config';

const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

// Unique checkout ID + one transaction make browser/webhook retries atomic.
export async function fulfillCheckout(session: CheckoutSession) {
  if (session.payment_status !== 'paid') throw httpError(402, 'Payment has not completed yet');
  const { courseId, userId, studentId } = session.metadata ?? {};
  if (!courseId || !userId || !studentId || session.client_reference_id !== userId) throw httpError(400, 'Checkout information is invalid');
  return prisma.$transaction(async (tx) => {
    const student = await tx.studentProfile.findUnique({ where: { id: studentId } });
    const course = await tx.course.findUnique({ where: { id: courseId } });
    if (!student || student.userId !== userId || !course) throw httpError(400, 'Purchase information is invalid');
    await tx.payment.upsert({ where: { providerPaymentId: session.id }, update: {},
      create: { userId, courseId, amount: (session.amount_total ?? 0) / 100,
        currency: (session.currency ?? course.currency).toUpperCase(), status: 'COMPLETED', provider: 'stripe', providerPaymentId: session.id } });
    const enrollment = await tx.enrollment.upsert({ where: { courseId_studentId: { courseId, studentId } },
      create: { courseId, studentId }, update: { status: 'ACTIVE' } });
    return { enrollment, course: { id: course.id, title: course.title, price: course.price, currency: course.currency } };
  });
}

export async function paymentRoutes(app: FastifyInstance) {
  app.post('/create-checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'STUDENT') return reply.status(403).send({ error: 'Only students can enroll in courses' });
    const { courseId } = z.object({ courseId: z.string().min(1) }).parse(request.body);
    const student = await prisma.studentProfile.findUnique({ where: { userId: request.user.id } });
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!student || !course) return reply.status(404).send({ error: 'Student or course not found' });
    const existing = await prisma.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId: student.id } } });
    if (existing?.status === 'ACTIVE') return reply.status(409).send({ error: 'You are already enrolled in this course' });
    if (course.price === 0) {
      const enrollment = await prisma.enrollment.upsert({ where: { courseId_studentId: { courseId, studentId: student.id } },
        create: { courseId, studentId: student.id }, update: { status: 'ACTIVE' } });
      return reply.send({ data: { type: 'enrolled', enrollment } });
    }
    if (!stripe) return reply.status(503).send({ error: 'Paid enrollment is not configured. Please contact the academy.' });
    const session = await stripe.checkout.sessions.create({ mode: 'payment', payment_method_types: ['card'], customer_email: request.user.email,
      client_reference_id: request.user.id,
      line_items: [{ quantity: 1, price_data: { currency: course.currency.toLowerCase(), unit_amount: Math.round(course.price * 100), product_data: { name: course.title } } }],
      metadata: { courseId, userId: request.user.id, studentId: student.id },
      success_url: `${config.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.FRONTEND_URL}/payment/cancel` });
    return reply.send({ data: { type: 'checkout', url: session.url } });
  });
  app.post('/confirm', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'STUDENT') return reply.status(403).send({ error: 'Only students can confirm purchases' });
    if (!stripe) return reply.status(503).send({ error: 'Payment service is not configured' });
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(request.body);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== request.user.id) return reply.status(403).send({ error: 'This checkout session does not belong to you' });
    return reply.send({ data: await fulfillCheckout(session) });
  });
  await app.register(async (webhooks) => {
    webhooks.removeContentTypeParser('application/json');
    webhooks.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    webhooks.post('/webhook', { config: { rateLimit: false } }, async (request, reply) => {
      if (!stripe || !config.STRIPE_WEBHOOK_SECRET) return reply.status(503).send({ error: 'Webhook is not configured' });
      let event: StripeEvent;
      try { event = stripe.webhooks.constructEvent(request.body as string, request.headers['stripe-signature'] as string, config.STRIPE_WEBHOOK_SECRET); }
      catch { return reply.status(400).send({ error: 'Invalid webhook signature' }); }
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as CheckoutSession;
        if (session.payment_status === 'paid') await fulfillCheckout(session);
      }
      return reply.send({ received: true });
    });
  });
}
