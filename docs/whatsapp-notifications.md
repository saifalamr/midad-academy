# Family WhatsApp notifications

The preview is safe with sending disabled by default. Approving a family enrollment application, manually enrolling a student, or publishing a report or a grade writes an outbox record in the same database transaction; it does not wait for WhatsApp. Parents must opt in, and their phone must be international digits with optional leading `+`. Existing accounts start opted out. `/parent/notifications` controls consent; `/admin/notifications` shows integration status and the latest 50 records.

Required server-only settings:

- `WHATSAPP_ENABLED=true` only when ready to send.
- `WHATSAPP_ACCESS_TOKEN`: a Meta WhatsApp Business Cloud API token.
- `WHATSAPP_PHONE_NUMBER_ID`: the Meta sender's phone number ID, not its phone number.
- `WHATSAPP_API_VERSION`: an explicitly supported Graph API version, e.g. `vNN.N`.
- `WHATSAPP_TEMPLATE_NAME`: an approved template with exactly four body text parameters: child name, course name, update summary, authenticated parent page URL.
- `WHATSAPP_TEMPLATE_LANGUAGE`: language of that approved template (default `ar`).
- `NOTIFICATIONS_CRON_SECRET`: random secret of at least 32 characters.

Configure an approved template for academy updates and reminders. Test with a consenting adult test recipient before activating normal sends. Keep all credentials on Render, never in a browser variable or repository. Preview accounts must not use a real person's phone unless that person explicitly agrees to test messages.

An authenticated external scheduler must POST once per minute to `/api/notifications/dispatch`, with header `X-Cron-Secret: <secret>`. The API also checks its queue every 30 seconds while running. Free Render services sleep, so this interval alone cannot guarantee reminders ten minutes before class. No paid cron service has been provisioned by this change. Without an always-running scheduler, precise reminders remain unconfigured.

The dispatcher rechecks consent, current parent-child association, published state, enrollment, and class cancellation before sending. Reminder deduplication includes session, child, and recipient, so two siblings each have a separate reminder. Report and grade notifications include published content only. Opting out cancels pending messages; it does not retroactively send previously skipped messages when opting in again.

`ACCEPTED` means the provider returned a message ID, not that the recipient received or read it. HTTP rejections (429/5xx) retry with bounded backoff, up to five attempts. Transport timeouts and interrupted sends become `UNKNOWN` and require provider review instead of automatic retransmission. No delivery-status webhook or automatic resend of unknown messages is implemented. The queue records no access tokens or raw provider error payloads.

Audio homework uses authenticated Cloudinary video resources (audio is processed under `resource_type: video`). Audio-only metadata and duration are validated after upload, then the immutable answer record is stored. Owner student, responsible teacher after submission, linked parent after publication, and administration can obtain a two-minute signed download link. Replaced uploads and rejected files are deleted. Bulk retention/deletion policy for historical recordings must be agreed before client production use.

Enrollment confirmations use the enrollment ID and recipient as their durable deduplication key. Repeated approval requests or manual enrollment retries never send a second confirmation. No old enrollment is backfilled. Cancellation, withdrawal, opt-out, or a changed parent-child association before dispatch suppresses the confirmation. The four-parameter summary contains the course and month, with a link to `/academy`; payment evidence is never included. Administration sees a boolean setup checklist without any secret values.
