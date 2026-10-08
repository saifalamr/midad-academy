# Free development preview on Render

Use `render.yaml` from branch `fix/client-ready`. This creates only a free API
and a new free PostgreSQL database in Frankfurt. The frontend stays on Vercel.
It does not touch the previous Railway services or any production database.

1. Open https://dashboard.render.com/blueprint/new?repo=https://github.com/saifalamr/midad-academy
2. Connect GitHub and allow access to this repository if prompted.
3. Choose branch `fix/client-ready` and Blueprint path `render.yaml`.
4. Before Apply, enter the same stable Vercel preview HTTPS origin for
   `FRONTEND_URL` and `CORS_ORIGIN`, without a trailing slash or path. Obtain
   the actual frontend URL first; do not enter localhost or a made-up URL.
5. Verify both resources show Free, then Apply. Generated JWT/invitation
   secrets and the internal database URL are wired by Render; do not paste
   those secrets into chat. The database rejects external connections.
6. Confirm `/api/ready` returns 200. Set the real API origin in the frontend's
   `NEXT_PUBLIC_API_URL`, then rebuild the Vercel preview and test CORS/login.

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. The start command derives
`API_URL` from the latter, validates configuration, applies tracked migrations,
then replaces the shell with the compiled API process for graceful shutdown.
Migrations run at startup because Free services have no pre-deploy phase.
Never point this startup configuration at an existing customer database.
No local seed passwords are created in the hosted database.

Auto-deployment is disabled. Deploy tested updates manually between test
classes. Use one API instance: in-memory whiteboard rooms and rate limits do
not support multiple instances or overlapping old/new versions. Reconnection
and saved-board recovery must be checked after each restart.

Free services sleep after inactivity. This is temporary test infrastructure,
not an uptime commitment. Free Render PostgreSQL expires after 30 days;
export needed test data or move to suitable hosting before expiry. Render may
request account/card verification; do not choose a paid resource without an
explicit budget decision.

Initial credentials for LiveKit, Stripe, Cloudinary and SMTP are omitted.
Core account/course/quiz/board checks can begin independently. Add separate
test provider credentials in Render's Environment screen before checking
real calls, test checkout/webhooks, uploads or email. Configure both LiveKit
and Stripe callbacks against the actual API URL. A healthy API alone does
not verify those integrations.

References: https://render.com/docs/blueprint-spec and https://render.com/docs/free
