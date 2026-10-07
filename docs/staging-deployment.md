# Midad staging: Vercel web + Railway API

This prepares the existing academy application for staging. It does not implement multi-academy tenancy or recurring SaaS billing. Keep `fix/client-ready` as the review branch; leave production unchanged until acceptance.

## Railway API

Create a separate staging environment and PostgreSQL database. Connect `saifalamr/midad-academy`, branch `fix/client-ready`. Use the **repository root**, not `apps/api`: npm needs the workspace lockfile and the Prisma schema in `packages/database`.

| Setting | Value |
| --- | --- |
| Builder | Railpack |
| Build command | `npm run build:api` |
| Start command | `npm run start:api` |
| Pre-deploy command, new staging DB only | `npm run db:migrate:deploy` |
| Healthcheck | `/api/ready` |
| Replicas / regions | One replica in one region |
| Serverless / sleeping | Disabled |
| Drain time | 30 seconds |

Copy variable names from `.env.api.staging.example` into Railway Variables. Set `DATABASE_URL` to the staging database connection reference, generate a random private JWT secret, and set a private teacher invitation code. Use test Stripe credentials and separate provider resources. Let Railway provide `PORT`; the API listens on `0.0.0.0`. Generate a public HTTPS domain targeting that port. REST and authenticated whiteboard WebSockets share the same port.

Prisma CLI must be available for pre-deploy migrations: keep `RAILPACK_PRUNE_DEPS=false` with this configuration. The API build generates Prisma and builds its workspace dependencies. Start runs compiled JavaScript directly, so SIGTERM reaches the application.

Use dashboard settings for this first service. Do not introduce legacy `railway.json`/`railway.toml`: current Railway docs deprecate those for new services. A future infrastructure-as-code plan should be validated against the actual linked project before applying it.

### Whiteboard release constraint

The current Yjs rooms, presence and permission cache live in one process. Database snapshots do **not** coordinate multiple active instances. One replica and zero overlap do not fully prevent old/new process overlap during a rolling deployment. Deploy between classes: stop the old API gracefully, confirm it has stopped and flushed board state, then start the replacement. Expect a short maintenance interruption and reconnect. Do not enable automatic rolling API releases during live classes. Shared pub/sub and coordinated persistence are prerequisites for multiple replicas or seamless releases.

## Vercel web

Create a project for the same repository, with Root Directory **`apps/web`**, Next.js preset, Node **24.x**, and access to source outside the root directory. `apps/web/vercel.json` installs at the repository root and runs the web-only Turbo build including shared UI/types, without building the API. Output directory stays framework default.

Set public values from `.env.web.staging.example` in **Preview** environment. `NEXT_PUBLIC_API_URL` points to the Railway API, without `/api`. The whiteboard override can remain empty; it derives `wss://` from the API URL. Never place database, JWT, provider secrets or teacher invitation codes in public variables or Vercel frontend config.

Use an exact, stable preview URL for `NEXT_PUBLIC_APP_URL`, API `FRONTEND_URL`, and `CORS_ORIGIN`. List additional reviewed origins explicitly, separated by commas; no wildcard. Changing public variables requires rebuilding the web app. Turbo hashes public values and the LiveKit CSP URL to avoid reusing bundles from another environment.

Keep a staged web project separate from any existing production project. Before enabling Git auto-deployment, set the intended staging branch and verify its latest commit; do not accidentally release `main` as production. A protected Vercel preview may require authentication; test payment return and password-reset links on the intended devices with that protection in place.

## Configuration and acceptance

For local checks, copy the templates to ignored `.env.api.staging` and `.env.web.staging`, configure privately, then run:

```bash
node --env-file=.env.api.staging scripts/check-deploy.mjs api
node --env-file=.env.web.staging scripts/check-deploy.mjs web
node --env-file=.env.api.staging scripts/check-deploy.mjs api --full
node --env-file=.env.web.staging scripts/check-deploy.mjs web --full
npm run test:deploy
```

These checks validate configuration only. They do not authenticate with providers or verify delivery. Missing optional services are allowed for initial staging; `--full` requires all credentials for acceptance. Never seed hosted staging with the public local-preview passwords. Register private staging accounts through the real API.

After deployment, verify `/api/ready`, HTTPS login and CORS, enrollment and teacher grading, two-participant whiteboard edits/text/both erasers, reconnect and restart persistence, parent linking, signed Stripe webhook enrollment, a real reset email, actual PDF upload, and a two-device LiveKit class including End class. Configure callbacks at `/api/payments/webhook` and `/api/sessions/webhook` using their separate signed test credentials.

The local real-media test remains unpassed because this execution host blocks LiveKit network-interface discovery. A ready healthcheck does not prove that calls, uploads, payments or email work.

## Final production release

After staging acceptance, prepare a distinct production database and provider configuration. Review migrations and back up existing data before applying them. Verify restoration, support/policy text, monitoring and client access. Build with production URLs, repeat integration acceptance, then assign the production domain. Rolling back code does not roll back database migrations; use backward-compatible changes and a reviewed recovery plan.

References: [Vercel Turborepo](https://vercel.com/docs/monorepos/turborepo), [Railpack Node](https://railpack.com/languages/node), [Railway config changes](https://docs.railway.com/config-as-code), [Railway teardown](https://docs.railway.com/deployments/deployment-teardown).
