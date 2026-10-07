# Midad Academy

Arabic learning platform with teacher, student and parent accounts. Next.js web app, Fastify API, Prisma/PostgreSQL, LiveKit classrooms, persistent Yjs whiteboards, Cloudinary materials and Stripe course checkout.

## Local preview (no production services or data)

Requires Node 20.9+ and npm. From the repository root:

```bash
npm ci
npx prisma generate --schema packages/database/prisma/schema.prisma
cp .env.preview.example .env.preview
npm run preview
```

Open http://127.0.0.1:3000. This command starts a local PostgreSQL-compatible PGlite database, seeds preview accounts, and starts both the API and web app. Local database port 5433 is intentionally bound to loopback and must not be exposed publicly. Data persists in ignored `.dev-db/`.

Preview accounts: `teacher@preview.midad.test`, `student@preview.midad.test`, `parent@preview.midad.test`. Their shared **local-only** password is `MidadPreview2026!`. Teacher registration invitation code: `local-preview-teacher`. Never use these credentials on a hosted preview or production.

The preview includes a free Arabic course with a multiple-choice and written quiz. It supports enrollment, teacher review, parent linking and reports without third-party keys. Video/audio, uploads, paid checkout and email require **test service credentials**, configured in `.env.preview`; they return a clear error when unavailable. There is no fake successful payment or simulated classroom.

## Supported workflows

- Teachers register with an invitation, create courses and materials, manage quizzes, grade written answers and schedule/start/end sessions.
- Students enroll free or through Stripe, access enrolled-course materials and quizzes, join live classes and track attendance and quiz activity.
- Students generate a one-time linking code in Account. Parents use it with the student's email to link accounts and download recent learning reports.
- Password reset uses a hashed, single-use, 30-minute token sent by SMTP and invalidates old login sessions.
- Attendance is recorded from a signed LiveKit `participant_joined` event, rather than assumed from class completion.
- Quiz XP is awarded once per student/quiz; perfect-score badges are earned from graded results.

## Checks

```bash
npm run lint
npm run type-check
npm run build
npm run test:api
npm run test:e2e
npm audit --omit=dev
```

API tests start their own in-memory local database, apply tracked migrations and verify access control, free/paid enrollment, quiz review, parent linking, signed payment webhooks, signed attendance and single-use password reset, and authenticated whiteboard edit permissions/persistence. Browser tests start a fresh in-memory database and the complete preview and use bundled Chromium on Linux. `test:e2e` requires a successful production build first. On another OS, run `npm run preview` and `npx playwright install chromium && npx playwright test` instead.

## Hosted preview and final deployment

Final launch remains a separate step. Use a **separate PostgreSQL database** and test provider keys for hosted preview. Do not point preview at the old production database. Set explicit API/web URLs and exact comma-separated `CORS_ORIGIN` values; do not use a wildcard. The browser receives only `NEXT_PUBLIC_` config.

Copy the variable names from `apps/api/.env.example` and `apps/web/.env.example` into the chosen hosting provider. Use a strong JWT secret (32+ characters), a private teacher invitation code, and set `NODE_ENV=production` for the API. The web URL is `FRONTEND_URL`; the API must remain available for WebSockets. Run a **single API instance** until shared whiteboard synchronization and drawing permissions are moved to shared infrastructure. Whiteboard snapshots survive restart, but drawing permissions reset on restart.

Build API: `npm run build -w @arabic-platform/api`; start: `npm run start -w @arabic-platform/api`. Build web: `npm run build -w @arabic-platform/web`; start: `npm run start -w @arabic-platform/web`. Generate Prisma and apply migrations with `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma` against the intended database **after backup and migration review**.

The new migration adds password reset, parent invitation, attendance, whiteboard persistence and idempotency indexes. Before applying it to an existing database, check for duplicate non-null `Payment.providerPaymentId` values; reconcile them deliberately, rather than automatically deleting payments.

Configure provider callbacks:

- Stripe: `POST /api/payments/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`, with `STRIPE_WEBHOOK_SECRET`.
- LiveKit: `POST /api/sessions/webhook`, content type `application/webhook+json`, signed by the configured LiveKit key.
- Health: `/api/health` (process) and `/api/ready` (database).

## Client acceptance before handover

1. Provide academy support email, teacher invitation process and client-approved policy/refund text. The included Terms/Privacy pages describe platform behavior and are **not a finalized legal agreement**.
2. Verify a real preview class on two devices: teacher/student video and audio, PDF navigation, drawing permission, reconnect and End class.
3. Upload an actual PDF/image to the client's test Cloudinary account.
4. Complete Stripe test checkout, close the success page, and confirm enrollment still arrives through the webhook; replay a webhook to verify no duplicate payment.
5. Receive a real password reset email and verify the expired/used link fails.
6. Review mobile layout and the parent report with the client, then authorize final hosting and production credentials.

Current purchase model is **one-time course enrollment**, not recurring monthly plans. Classroom recordings, certificates, automated weekly email reports and social login are not offered by this version. Marketing copy does not advertise them.
