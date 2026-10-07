import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
type CheckoutParams = NonNullable<Parameters<InstanceType<typeof Stripe>['checkout']['sessions']['create']>[0]>;
type CheckoutSession = Awaited<ReturnType<InstanceType<typeof Stripe>['checkout']['sessions']['retrieve']>>;
type StripeEvent = ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']>;
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { httpError } from '../lib/access';
import { config } from '../config';
import { availableSeat, enrollFree, lockCourse } from '../lib/enrollment';

const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

// Unique checkout ID + one transaction make browser/webhook retries atomic.
export async function fulfillCheckout(session: CheckoutSession) {
  if (session.payment_status !== 'paid') throw httpError(402, 'Payment has not completed yet');
  const { courseId, userId, studentId } = session.metadata ?? {};
  if (!courseId || !userId || !studentId || session.client_reference_id !== userId) throw httpError(400, 'Checkout information is invalid');
  return prisma.$transaction(async (tx) => {
    const course = await lockCourse(tx, courseId);
    const student = await tx.studentProfile.findUnique({ where: { id: studentId } });
    if (!student || student.userId !== userId) throw httpError(400, 'Purchase information is invalid');
    const courseInfo = { id: course.id, title: course.title, price: course.price, currency: course.currency };
    const enrollment = await tx.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId } } });
    const recorded = await tx.payment.findUnique({ where: { providerPaymentId: session.id } });
    // Replayed events must not reactivate a cancelled/paused enrollment.
    if (recorded) return { enrollment, course: courseInfo, requiresReview: recorded.requiresReview, payment: { amount: recorded.amount, currency: recorded.currency } };
    const reservation = await tx.seatReservation.findUnique({ where: { checkoutSessionId: session.id } });
    if (reservation && (reservation.studentId !== studentId || reservation.courseId !== courseId)) throw httpError(400, 'Seat reservation does not match checkout');
    const hasSeat = enrollment?.status !== 'ACTIVE' && await availableSeat(tx, courseId, course.maxStudents, reservation?.id);
    // A late/legacy checkout without a seat is still recorded as paid, but never
    // silently exceeds capacity. Surface it for academy review/refund.
    const payment = await tx.payment.create({ data: { userId, courseId, amount: (session.amount_total ?? 0) / 100,
      currency: (session.currency ?? course.currency).toUpperCase(), status: 'COMPLETED', provider: 'stripe', providerPaymentId: session.id, requiresReview: !hasSeat } });
    const activated = hasSeat ? await tx.enrollment.upsert({ where: { courseId_studentId: { courseId, studentId } }, create: { courseId, studentId }, update: { status: 'ACTIVE' } }) : enrollment;
    if (reservation) await tx.seatReservation.delete({ where: { id: reservation.id } });
    return { enrollment: activated, course: courseInfo, requiresReview: !hasSeat, payment: { amount: payment.amount, currency: payment.currency } };
  });
}

export async function startPaidCheckout(course: { id: string; title: string; price: number; currency: string }, studentId: string, userId: string, email: string, createSession: (params: CheckoutParams) => Promise<CheckoutSession>) {
    const courseId = course.id;
    const expiresAt = new Date(Date.now() + 35 * 60_000);
    const reservation = await prisma.$transaction(async tx => {
      const current = await lockCourse(tx, courseId);
      const enrollment = await tx.enrollment.findUnique({ where: { courseId_studentId: { courseId, studentId: studentId } } });
      if (enrollment?.status === 'ACTIVE') throw httpError(409, 'You are already enrolled in this course');
      if (await tx.seatReservation.findUnique({ where: { courseId_studentId: { courseId, studentId: studentId } } })) throw httpError(409, 'لديك طلب دفع قيد التنفيذ. أكمله أو انتظر انتهاءه.');
      if (!await availableSeat(tx, courseId, current.maxStudents)) throw httpError(409, 'اكتملت مقاعد الدورة. لا يمكن الدفع حاليًا.');
      return tx.seatReservation.create({ data: { courseId, studentId: studentId, expiresAt } });
    });
    let session: CheckoutSession;
    try {
      session = await createSession({ mode: 'payment', payment_method_types: ['card'], customer_email: email,
        expires_at: Math.floor(expiresAt.getTime() / 1000), client_reference_id: userId,
        line_items: [{ quantity: 1, price_data: { currency: course.currency.toLowerCase(), unit_amount: Math.round(course.price * 100), product_data: { name: course.title } } }],
        metadata: { courseId, userId: userId, studentId: studentId },
        success_url: `${config.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.FRONTEND_URL}/payment/cancel` });
    } catch (error) {
      await prisma.seatReservation.deleteMany({ where: { id: reservation.id } });
      throw error;
    }
    await prisma.seatReservation.update({ where: { id: reservation.id }, data: { checkoutSessionId: session.id } });
    return { type: 'checkout', url: session.url };
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
      return reply.send({ data: { type: 'enrolled', enrollment: await enrollFree(courseId, student.id) } });
    }
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) return reply.status(503).send({ error: 'Paid enrollment and its signed webhook must be configured. Please contact the academy.' });
    return reply.send({ data: await startPaidCheckout(course, student.id, request.user.id, request.user.email, params => stripe.checkout.sessions.create(params)) });
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
        if (session.payment_status === 'paid') {
          const result = await fulfillCheckout(session);
          if (result.requiresReview) app.log.warn({ checkoutId: session.id }, 'Paid checkout requires academy review');
        }
      }
      if (event.type === 'checkout.session.expired') {
        const session = event.data.object as CheckoutSession;
        const reservation = await prisma.seatReservation.findUnique({ where: { checkoutSessionId: session.id } });
        if (reservation) await prisma.$transaction(async tx => {
          await lockCourse(tx, reservation.courseId);
          await tx.seatReservation.deleteMany({ where: { id: reservation.id, checkoutSessionId: session.id } });
        });
      }
      return reply.send({ received: true });
    });
  });
}
