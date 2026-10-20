# Academy workflow release — 20 October 2026

The release extends existing accounts, courses, sessions, reports and homework; it does not reset, seed or remove hosted data. Migration `20261020023000_academy_operations` creates six operation tables plus the policy table and adds nullable makeup fields to ClassSession. No existing columns or tables are dropped. Earlier course enrollment and classroom routes remain compatible.

## Family journey

The catalogue links to `/academy?course=<id>`. A logged-out parent returns to that course after login or account creation. Add a child with name and age; the account is linked immediately and receives a unique username with an unguessable initial password hash. The parent explicitly sets a child password (10+ characters) when independent login is needed. Resetting it invalidates previous child sessions; another family cannot reset it. Parent classroom access remains observer-only. No parent-to-student token impersonation or access to private student learning notes is added.

Apply for a monthly course, recording prior knowledge, preferred time and optional assessment request. Pending requests do not reserve a seat and do not collect payment. Full courses create WAITLIST applications. Repeated submission of the same child/course returns the existing request. Approval locks the course and checks active seats and payable reservations together; two admins cannot approve the last seat twice. A paid course needs an actual payment reference or an explicitly justified waiver. The recorded price and currency are captured when the application is sent. This is an operator-maintained payment record, not a new card checkout, bank transfer or automatic refund service. Older manual enrollments without applications remain visible in the course list; no historical payment evidence is fabricated.

Renewal chooses a separate course for the next month. Existing records and materials are retained. Month-end labels are informative; they do not promise automatic recurring billing or delete historical access. A cancelled/rejected application remains visible; the family contacts administration to reopen rather than destroying its history. Existing over-capacity enrollments are not removed automatically.

## Daily operation

`/sessions/<id>` combines local and academy time, live entry, material titles, homework submission/review state and published per-child reports. Parents see only their linked children and published reports, never report drafts or answer keys. Student/parent joins still use the existing signed classroom authorization. Course skill tracking is assessed by the owning teacher/admin, versioned and separate from self-reported material completion. Optional intake level notes flag a placement conversation; no standardized placement test is claimed.

Parent requests cover upcoming absence, makeup, withdrawal, refund and help. Withdrawal approval cancels enrollment while retaining records. Resolving a refund request does not execute or confirm a financial transfer; an operator must separately record the completed refund and its reference. Rescheduling serializes teacher scheduling and rejects collisions. Makeup classes link to the original and prevent two concurrent upcoming makeups for one class. Completed records cannot be rescheduled. In-app notices are durable and record explicit acknowledgement by each recipient, visible to administration on the class page; no WhatsApp delivery claim is made. Existing WhatsApp report/homework/reminder delivery remains dependent on provider configuration.

Administration sees pending registrations, service requests, unreported classes, grading backlog and recent absences. The latest 100 audit events identify the actor and change. New workflow mutations log in their transaction; legacy administration endpoints log after successful responses and log a server error if auditing fails. Credentials and request bodies are excluded from legacy audit events. Password-reset events contain no password. This is an operational trace, not an immutable compliance archive.

Academy management edits and publishes its own absence, compensation, cancellation and refund policy in `/academy`. Drafts stay private. No legal terms, refund deadlines or eligibility policies are invented or auto-published by this release. Publish approved text before accepting real payments.

## Recovery and acceptance

Local integration tests include data snapshot restoration and relationship counts on an isolated PostgreSQL-compatible database. This validates application-data preservation; it does not establish that hosted PostgreSQL backups exist or that a hosted archive has been restored.

For real PostgreSQL, install compatible `pg_dump`, `pg_restore` and `psql` clients. Set DATABASE_URL (or DIRECT_DATABASE_URL for a direct connection) privately and run:

```
node scripts/database-backup.mjs create /private/path/midad.dump
```

To verify, privately set RESTORE_DATABASE_URL to a separate **empty** database with a name ending in `restore_check`, then run:

```
node scripts/database-backup.mjs verify /private/path/midad.dump
```

The verifier refuses a non-empty target and never drops or deletes databases. Backups are sensitive data; store outside the repository with restricted access and establish the owner's retention/schedule separately. No old test-data backups or automatic hosted backup jobs are created by this release.

Before final production handover: accept a new family through the request UI; test real child login recovery, live calls/observer behavior and delivery with configured providers; approve policy text; verify an actual hosted PostgreSQL backup restore; confirm the payment reconciliation procedure and the next-month course schedule. This remains the existing preview release, not a production launch.
