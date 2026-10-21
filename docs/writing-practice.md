# Arabic writing practice

The feature lives at Session details → Activities → Writing, in the teacher's upcoming-session tools, in homework lists, and in a dialog within the existing classroom. The in-call frame leaves the original media room mounted, uses the same authenticated account, and never asks for device permissions. Embedded navigation stays within writing activities. Actual behavior with a particular device/provider still needs a real call acceptance check.

## Teacher workflow

Create any Arabic word (up to 40 characters including diacritics/spaces), preview its size, and save it in a private reusable library. Simple mode supplies a faint word and manual teacher review. Guided mode requires the teacher to draw each stroke/dot in order, test the reference, and confirm the direction, order and dots. No arbitrary-font stroke order is auto-generated and no library is silently seeded on the hosted database.

Assign a saved word as an in-class activity (visible when the session is LIVE or COMPLETED), or as homework (visible after COMPLETED). Assignments copy word, size, mode and reference paths. Later library changes cannot alter previous assignments or student work. Only the assigned session teacher or an administrator can create/remove assignments or review work. An empty assignment can be removed; one with submissions is retained.

## Pupil/family workflow

The pupil draws with mouse, touch or a pen through Pointer Events on a fixed SVG viewBox. Coordinates remain vectors when the layout changes; browser zoom is not disabled. Undo, clear and an ordered path demonstration are available. A per-user/task draft is kept in sessionStorage in the current browser tab for up to seven days, with a visible storage-failure message. Pointer cancellation discards only the incomplete stroke. Palm rejection follows the browser's pointer arbitration; physical stylus/device behavior is not certified by emulation.

A pupil may practice and check guidance repeatedly before submitting one final attempt. Lost-response retries return the original saved attempt, not a duplicate or replacement. Submission requires active enrollment; previous attempts remain readable after withdrawal. Parents can see only their currently linked children and cannot submit for them. Another teacher or family cannot read or assess the attempts.

The teacher publishes an ACHIEVED/PRACTICE verdict plus feedback using versioned updates. This assessment is visible to the pupil and linked parent. Writing feedback is separate from session reports, curriculum-skill progress, points and numeric homework grades.

## Guidance limits

Assessment runs on the server and ignores any client-provided score. It uses uniform arc-length samples, bidirectional geometric coverage, path length, starting/ending points, traversal alignment (including closed loops), stroke order, missing dots/strokes and extra strokes. A small positional tolerance permits ordinary motor variation.

The output is advisory ON_TRACK/PRACTICE feedback against the teacher's reference, never a numeric grade or independent proof of Arabic correctness, legibility or calligraphic quality. It cannot establish that the teacher prepared a pedagogically correct reference or detect copying. Tolerances are an initial heuristic, not a calibrated educational assessment. Validate references and tolerances with the academy's teachers and actual pupils before relying on automatic guidance.

## Data and verification

Migration 20261021030000_writing_practice creates three tables and their relations; it drops no existing data. Stored paths have strict coordinate, stroke and total-point limits. Assignment/submission/review mutations share the existing course lock, preserve history and write audit entries.

Validation includes independent geometry checks, API ownership/history/idempotency/concurrency tests, and a browser journey through word creation, pen/touch input emulation, draft recovery, submission with a lost response, teacher review and parent reading across phone/tablet/desktop widths. Local tests use an isolated database, not customer data. No hosted test accounts or exercises are created by deployment.
