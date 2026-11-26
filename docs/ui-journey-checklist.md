# Medad screen review checklist

Review one screen at a time on TEST. A checked item means its screen was reviewed, deployed, and offered for human acceptance; it does not approve the next screen.

## Shared entry, in visitor order

- [ ] `/` — public homepage; first explanation, live lesson, roles, course catalog, enrollment actions. **Current screen.**
- [ ] `/login` — entry for parent, admin, student, and teacher; sign in and recovery links.
- [ ] `/register` — parent account creation; terms, contact details, registration errors.
- [ ] `/academy?start=1` — parent onboarding: add child, choose a course, submit request, wait for approval.
- [ ] `/forgot-password`, `/reset-password` — account recovery and expired or invalid links.
- [ ] `/about`, `/curriculum`, `/teachers`, `/lesson-sample`, `/help`, `/contact`, `/terms`, `/privacy` — public explanations and policies.
- [ ] `/payment/success`, `/payment/cancel` — payment outcomes.

## Parent, after login

- [ ] `/parent` — child switcher; empty state, next class, attendance, writing progress, teacher reports.
- [ ] `/academy` — next step; children and sign-in; registration and renewal; applications and payment; requests and conversation; schedule; skills; notices; policy.
- [ ] `/parent/homework` — each child's homework, pending and published results.
- [ ] `/parent/notifications` — notification history and unread state.
- [ ] `/sessions/[id]` — class details, materials, report, and eligible live observation.
- [ ] `/courses`, `/courses/[id]/lessons`, `/courses/[id]/content`, `/courses/[id]/board` — assigned learning content.
- [ ] `/account` — profile and notification preferences.

## Student, after login

- [ ] `/student` — next class, joining, courses, progress, empty states.
- [ ] `/classroom/[roomId]` — lobby, call, lesson materials, whiteboard, writing activity, end state.
- [ ] `/sessions/[id]`, `/sessions/[id]/writing`, `/writing/[id]` — class details, writing list, draft, submission, feedback.
- [ ] `/student/homework`, `/student/homework/[sessionId]` — assignment, mixed question types, draft, submission, result.
- [ ] `/courses`, `/courses/[id]/lessons`, `/courses/[id]/content`, `/courses/[id]/board`, `/account` — learning and account.

## Teacher, after login

- [ ] `/teacher` — next class, assigned courses, quick tools.
- [ ] `/classroom/[roomId]` — lobby, time division, media controls, materials, whiteboard and student picture-in-picture, end state.
- [ ] `/teacher/sessions/[sessionId]/materials`, `/sessions/[id]` — assigned materials and class detail.
- [ ] `/teacher/homework`, `/teacher/homework/[sessionId]`, `/teacher/review-answers` — submissions and grading.
- [ ] `/teacher/reports`, `/teacher/students`, `/sessions/[id]/writing`, `/writing/[id]` — reports, roster and writing reviews.
- [ ] `/courses`, `/courses/[id]/lessons`, `/courses/[id]/content`, `/courses/[id]/board`, `/account` — course content and account.

## Admin, after login

- [ ] `/admin` — courses and schedules; families and students; teachers; empty and edit states.
- [ ] `/admin/sessions/[sessionId]/details`, `/admin/sessions/[sessionId]/materials`, `/admin/sessions/[sessionId]/homework` — session oversight, assigned materials, assignment editor.
- [ ] `/academy` — registration and payment; family requests and replies; schedule; skills; notices; policy; audit log.
- [ ] `/admin/notifications`, `/courses`, `/courses/[id]/lessons`, `/courses/[id]/content`, `/courses/[id]/board`, `/account` — messages, curriculum and account.

## Four-role entry proposal for the `/login` review

All four roles sign in from `/login`. A parent may create their own account at `/register` and then request enrollment through `/academy`. Admin accounts are provisioned privately; admin creates teacher accounts and assigns their courses. Student accounts are linked to a parent and provisioned through the existing family/admin workflow. Teacher and student use the issued credentials. Public registration remains parent-only; no permission or registration change is part of the homepage review.

## Human-test issue kept for a separate stage

- [ ] Matching homework is displayed but its controls did not respond to clicks in human testing. Automated passing tests do **not** close this issue. Reproduce on TEST with the affected device and account, then fix and retest after the homepage is accepted.
