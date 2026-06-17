import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../config';

const stripe = new Stripe(config.STRIPE_SECRET_KEY);

const createCheckoutSchema = z.object({
  courseId: z.string().min(1, 'Course id is required'),
});

const confirmSchema = z.object({
  sessionId: z.string().min(1, 'Session id is required'),
});

// Creates the enrollment row, tolerating the case where the student is
// already enrolled (e.g. they refresh /payment/success after confirming once).
async function enrollStudent(courseId: string, studentId: string) {
  try {
    return await prisma.enrollment.create({ data: { courseId, studentId } });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      return prisma.enrollment.findUniqueOrThrow({
        where: { courseId_studentId: { courseId, studentId } },
      });
    }
    throw err;
  }
}

export async function paymentRoutes(app: FastifyInstance) {
  // ── POST /api/payments/create-checkout ────────────────────────────────────
  // Starts the purchase flow for a course. Free courses skip Stripe entirely
  // and enroll the student immediately; paid courses get a Stripe-hosted
  // Checkout session to redirect the browser to.
  app.post('/create-checkout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can enroll in courses' });
    }

    const { courseId } = createCheckoutSchema.parse(request.body);

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return reply.status(404).send({ error: 'Course not found' });
    }

    const existing = await prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: studentProfile.id } },
    });
    if (existing) {
      return reply.status(409).send({ error: 'You are already enrolled in this course' });
    }

    // Stripe Checkout requires a positive charge amount — free courses just
    // enroll directly with no payment step.
    if (course.price <= 0) {
      const enrollment = await enrollStudent(courseId, studentProfile.id);
      return reply.send({ data: { type: 'enrolled' as const, enrollment } });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: course.currency.toLowerCase(),
            unit_amount: Math.round(course.price * 100),
            product_data: {
              name: course.title,
              description: `Enrollment — ${course.title} (ages ${course.ageGroup})`,
            },
          },
        },
      ],
      metadata: { courseId, userId, studentId: studentProfile.id },
      success_url: `${config.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.FRONTEND_URL}/payment/cancel`,
    });

    if (!session.url) {
      return reply.status(502).send({ error: 'Stripe did not return a checkout URL' });
    }

    return reply.send({ data: { type: 'checkout' as const, url: session.url } });
  });

  // ── POST /api/payments/confirm ─────────────────────────────────────────────
  // Called from /payment/success once Stripe redirects back. Verifies the
  // checkout session actually completed, records the payment, and enrolls
  // the student. (No webhook yet — this confirm step is the source of truth.)
  app.post('/confirm', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: userId, role } = request.user;

    if (role !== 'STUDENT') {
      return reply.status(403).send({ error: 'Only students can confirm enrollments' });
    }

    const { sessionId } = confirmSchema.parse(request.body);

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // The session must belong to the user who's confirming it — otherwise
    // anyone could enroll themselves by guessing/reusing a session id.
    if (session.client_reference_id !== userId) {
      return reply.status(403).send({ error: 'This checkout session does not belong to you' });
    }

    if (session.payment_status !== 'paid') {
      return reply.status(402).send({ error: 'Payment has not completed yet' });
    }

    const courseId = session.metadata?.courseId;
    if (!courseId) {
      return reply.status(400).send({ error: 'Checkout session is missing course information' });
    }

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!studentProfile) {
      return reply.status(404).send({ error: 'Student profile not found' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return reply.status(404).send({ error: 'Course not found' });
    }

    const providerPaymentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.id;

    // Idempotent: re-visiting /payment/success (refresh, back button) must
    // not create duplicate payment rows for the same Stripe session.
    const existingPayment = await prisma.payment.findFirst({ where: { providerPaymentId } });
    if (!existingPayment) {
      await prisma.payment.create({
        data: {
          userId,
          courseId,
          amount: (session.amount_total ?? Math.round(course.price * 100)) / 100,
          currency: (session.currency ?? course.currency).toUpperCase(),
          status: 'COMPLETED',
          provider: 'stripe',
          providerPaymentId,
        },
      });
    }

    const enrollment = await enrollStudent(courseId, studentProfile.id);

    return reply.send({
      data: {
        enrollment,
        course: { id: course.id, title: course.title, price: course.price, currency: course.currency },
      },
    });
  });
}
