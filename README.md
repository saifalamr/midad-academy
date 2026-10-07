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

Copy the variable names from `apps/api/.env.example` and `apps/web/.env.example` into the chosen hosting provider. Use a strong JWT secret (32+ characters), a private teacher invitation code, and set `NODE_ENV=production` for the API. The web URL is `FRONTEND_URL`; the API must remain available for WebSockets. Run a **single API instance** until shared whiteboard synchronization and drawing permissions are moved to shared infrastructure. Whiteboard snapshots and drawing permissions survive restart. Live synchronization still requires a single API instance.

Build API from the repository root: `npm run build:api`; start: `npm run start:api`. Build web: `npm run build:web`; local start: `npm run start -w @arabic-platform/web`. Generate Prisma and apply migrations with `npx prisma migrate deploy --schema packages/database/prisma/schema.prisma` against the intended database **after backup and migration review**.

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

### Classroom and collaborative board verification

The course lessons page now links to `/courses/<courseId>/board`, an authenticated board that works outside a call. Teacher and authorized students share independent drawing objects, so concurrent additions survive. Undo affects the participant's own edits; erasing supports whole objects and transparent partial erasure; the board can be exported as PNG. Drawing pauses while disconnected. Legacy saved boards migrate on the teacher's next connection.

`npm run test:e2e` includes a two-browser board test (desktop teacher, mobile student). A separate real-media test is available with an official local LiveKit server:

```bash
LIVEKIT_SERVER_BINARY=/absolute/path/livekit-server npm run test:classroom
```

Build the web app first. This starts an isolated database, API, LiveKit and two browser participants, using generated camera/audio tracks. The host must permit normal WebRTC networking and network-interface discovery. In the current execution environment LiveKit stops with `route ip+net: netlinkrib: operation not permitted`, so the real-media test is **not passed**. It remains a handover prerequisite on a suitable staging host and real devices.

LiveKit room names are unique per scheduled class (`class-<sessionId>`). Shared material, PDF page and drawing grants are stored in PostgreSQL; late joiners and reconnecting users retrieve the current state. Apply the new `20261007190000_classroom_state` migration before deploying this code. The owner-private phone preview uses a separate single-user drawing demo and does not verify the production LiveKit/WebSocket integration.

### Vercel + Railway staging

See [the staging runbook](docs/staging-deployment.md) for exact monorepo settings, separate environment templates, readiness checks and release limitations. Run `npm run test:deploy` to verify configuration safeguards. Production remains a separate release.

### Learning workspace

Students can search/filter course materials, mark materials completed or undo completion, and save a private note of up to 5,000 characters per material. Notes are saved explicitly to the account and remain after reload. An unsuccessful save preserves the typed note and displays an error. Completion is self-reported and awards no XP; attendance and graded quiz results remain separate.

The student dashboard links to the next unfinished material. Teachers can search their roster by name/email, filter by course and completion, and see material counts. Linked parents see the same material summary. Neither teachers nor parents receive students' private notes. Active enrollment is required for both reading and editing notes.

Students can download upcoming classes as `.ics` calendar events; timestamps use UTC and preserve the actual session duration. Adding a calendar event does not send an email or push reminder from the academy.

Apply migration `20261007221500_learning_state` before running the updated API against a hosted database. The local preview/test database applies tracked migrations automatically. Run `npm run test:calendar` alongside API and browser checks. These changes have not been deployed to the phone preview while deployment work is paused.
