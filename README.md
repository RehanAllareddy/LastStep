# LastStep

**Stop scrolling. Start finishing.** LastStep is a student accountability app. A student commits to an assignment with a real deadline and opts in to SMS (and, separately, voice) reminders. They finish the work and upload a screenshot, which stops all reminders.

Stack: Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, Radix primitives, Supabase (Postgres, Auth, Storage, RLS), Twilio (SMS, Verify, Voice), Inngest (durable cron), Zod, Vitest, and Playwright.

---

## Contents

1. [Quick start (local)](#quick-start-local)
2. [Architecture](#architecture)
3. [Accountability engine](#accountability-engine)
4. [Security & privacy model](#security--privacy-model)
5. [Environment variables](#environment-variables)
6. [Supabase setup](#supabase-setup)
7. [Twilio setup](#twilio-setup)
8. [Scheduler & webhooks](#scheduler--webhooks)
9. [Testing](#testing)
10. [Deploying to Vercel](#deploying-to-vercel)
11. [Operations](#operations)
12. [Known limitations](#known-limitations)
13. [Pre-launch legal & compliance checklist](#pre-launch-legal--compliance-checklist)

---

## Quick start (local)

Prerequisites: Node 20.9+ (22 recommended), the [Supabase CLI](https://supabase.com/docs/guides/cli), and a Docker-compatible runtime (Docker Desktop, OrbStack, or Colima).

```bash
npm install
npm run db:start            # starts local Supabase and applies supabase/migrations
cp .env.example .env.local  # then fill in the values printed by `supabase status`
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "Publishable key"
#   SUPABASE_SERVICE_ROLE_KEY            = "Secret key"
#   PHONE_HASH_SECRET=$(openssl rand -hex 32)
#   CRON_SECRET=$(openssl rand -hex 24)
npm run dev                 # http://localhost:3000
npm run scheduler:dev       # (second terminal) runs a scheduler tick every 60s
```

In development no real texts are sent. With `NOTIFICATION_PROVIDER=simulated` (the default outside production), every "message" is written to the `dev_outbox` table. That includes phone verification codes. You can view it at **http://localhost:3000/dev/outbox**, where each entry is labeled **SIMULATED**.

Confirmation and password-reset emails go to the local Mailpit inbox at **http://127.0.0.1:54324**. Supabase Studio is at **http://127.0.0.1:54323**.

To grant yourself the operations dashboard after signing up, run `npm run admin:grant -- you@example.com ops`. Use `reviewer` instead of `ops` for the review queue.

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` / `lint` | `tsc --noEmit` / ESLint |
| `npm test` | Unit tests (pure logic) |
| `npm run test:integration` | Integration tests against the local Supabase stack |
| `npm run test:e2e` | Playwright scenarios A–F (builds into `.next-e2e`, serves on :3100) |
| `npm run test:all` | All of the above |
| `npm run db:reset` | Re-create the local DB from migrations |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local schema |
| `npm run scheduler:dev` | Local scheduler loop (calls `/api/internal/dispatch`) |
| `npm run inngest:dev` | Inngest Dev Server alternative to `scheduler:dev` |

---

## Architecture

```
src/
  app/
    (marketing)/          landing, privacy, terms, sms-terms, contact
    (auth)/               sign-in, sign-up (welcome step), forgot/reset password
    (dashboard)/          overview, assignments (list/new/[id]/edit/submit), completed,
                          progress, settings/{notifications,account}, admin
    onboarding/           phone → notification agreement → preferences
    auth/confirm/         email-link handler (PKCE code or token hash)
    dev/outbox/           simulated-notification viewer (non-production only)
    api/
      assignments/[id]/submissions   screenshot upload (multipart, same-origin)
      submissions/[id]/evidence      owner → 60s signed URL
      admin/submissions/[id]/evidence reviewer → audited signed URL
      account/export                 JSON data export
      inngest                        Inngest handler (signed)
      internal/dispatch              cron fallback (Bearer CRON_SECRET)
      webhooks/twilio/{inbound,status,voice-status}  signed, deduped
  components/   ui/ (design system) · layout/ · assignments/ · dashboard/ · submissions/ · notifications/ · marketing/ · brand/
  lib/
    assignments/   state machine, service (writes), queries (RLS reads), progress metrics
    scheduler/     policy, plan (pure), eligibility (pure), retry, dispatcher, store, sync, run
    notifications/ provider interface, twilio, simulated, messages, keywords, webhooks, phone verification, summaries
    submissions/   image validation & re-encoding, workflow
    storage/       private evidence bucket helpers
    security/      phone normalization + HMAC, DB-backed rate limits, origin check
    time/          time-zone and quiet-hours math (Intl, DST-aware)
    consent/       versioned agreements
    account/       deletion, export, profile actions
    admin/         audited ops actions
    supabase/      browser / server (RLS) / admin (service role) clients, session proxy
supabase/migrations/   schema, functions, RLS, storage policies
tests/{unit,integration,e2e}
```

**Design principles**

- **Postgres is the source of truth.** Every privileged write goes through a SQL function that only `service_role` may execute. These include claiming jobs, submissions, consent, opt-outs, deletion, and admin retry. The Next.js server authenticates the user (`auth.getClaims()`), then passes the verified id explicitly.
- **Reads use the user's session**, so RLS applies to every dashboard query.
- **Pure core, thin shell.** Reminder planning, quiet hours, dispatch eligibility, and retry classification are pure functions with unit tests. SQL handles atomicity.
- **Pluggable infrastructure.** Notifications go through a `NotificationProvider` interface (Twilio or simulated). The scheduler is just "call `dispatchDueReminders()` every minute", so Inngest, Vercel Cron, GitHub Actions, or pg_cron can drive it.

---

## Accountability engine

### Assignment state machine

Enforced by a database trigger (`assignment_transitions` table). It is mirrored in `src/lib/assignments/state-machine.ts`, and a unit test asserts the two match exactly.

| From | Allowed to |
| --- | --- |
| draft | active, canceled |
| active | submitted, paused, overdue, canceled |
| overdue | submitted, paused, canceled, active (rescheduled to a future deadline) |
| paused | active (resume, future deadline), overdue (resume, past deadline), submitted, canceled |
| submitted | completed (self-attested), under_review (review required) |
| under_review | completed (accepted), active / overdue (rejected) |
| completed, canceled | — (terminal) |

- **Overdue.** Every scheduler tick moves `active` assignments past their deadline to `overdue`. Overdue assignments still receive the planned overdue follow-ups.
- **Late submissions** are allowed (`overdue → submitted`) and count as completed but not on time.
- **Past deadlines at creation.** The UI explains the deadline has passed and asks for a recovery target. The assignment is stored with `original_due_at` and `is_recovery_plan = true`, and reminders aim at the new target.
- **Completion policies.**
  - *Self-attested* (default): upload, confirm, accepted immediately, reminders canceled.
  - *Review required*: the assignment goes to `under_review` and reminders stay canceled during review. An app reviewer accepts it (→ completed) or rejects it (→ reopened with reminders rescheduled).

### Reminder planning (`lib/scheduler/plan.ts`)

| Intensity | Before deadline | At deadline | Check-ins | After deadline |
| --- | --- | --- | --- | --- |
| gentle | 24h | ✓ | — | 1 × every 24h |
| standard | 24h, 3h | ✓ | every 72h | 2 × every 12h |
| intensive | 48h, 24h, 6h, 1h | ✓ | every 24h | 3 × every 6h |

- Users can override the first lead time, the check-in interval, the overdue interval, and the voice-call lead in Settings. Admins can adjust global caps on the Operations page.
- **Quiet hours** (default 21:30–08:00 local):
  - A pre-deadline reminder that falls inside them moves earlier, to just before quiet hours start. A moved "deadline is here" reminder is relabeled so its wording stays true.
  - An overdue reminder moves later, to when quiet hours end.
- **Caps and gaps.**
  - Defaults: at most 12 texts and 1 call per assignment, a 45-minute minimum gap between reminders, and a per-user daily maximum (default 4, user-adjustable up to 12).
  - Selection is priority-aware, so the due-time reminder survives the cap.
- **Occurrence keys** are `assignment:scheduleVersion:channel:kind:time`. Any edit, deadline change, pause, resume, or submission bumps `schedule_version`, and the sync cancels jobs from older versions. Keys are unique in the DB, so re-running a sync never duplicates jobs. A canceled-but-never-sent job is revived when an identical plan returns, for example after consent is re-granted.

### Dispatch pipeline (`lib/scheduler/dispatcher.ts`)

Each tick runs these steps:

1. `mark_overdue_assignments()`.
2. `claim_due_reminder_jobs()` (`FOR UPDATE SKIP LOCKED`). This also:
   - **skips superseded jobs**: when several reminders for the same assignment and channel are due (after an outage or deferral), only the latest is kept, so there is no burst.
   - **dead-letters stale locks**: a job stuck in `processing` past its 5-minute lock has an unknown outcome and is never blindly resent.
3. For each job, `get_dispatch_context()` takes a snapshot, then `evaluateDispatch()` makes a pure decision:
   - **cancel** if the assignment is not active or overdue, consent is missing, the channel is disabled, the phone is unverified, the number is suppressed, or the account is deleted;
   - **skip** for the daily cap, the voice cap, the minimum gap, or a reminder more than 6 hours late;
   - **defer** to the end of quiet hours (or skip if that lands past the deadline).
4. `confirm_job_sendable()` re-checks status, consent, and suppression atomically immediately before contacting the provider. This narrows the race with a submission or a STOP to milliseconds. Submissions also cancel jobs that are mid-dispatch.
5. Send through the provider, then `finalize_reminder_job()`. Finalize is idempotent: only a `processing` job changes state, and a send that raced a cancellation is still recorded as sent so it can never be revived.

**Retries.**

- Retried only when the provider *provably* did not accept the request: HTTP 429, 502/503/504, or pre-connect network errors.
- Exponential backoff with jitter: 1, 2, 4… minutes, capped at 30, with up to 4 attempts, then `failed: retry_exhausted:*`.
- Timeouts, connection resets, and generic 500s are recorded as `unknown_outcome` and **not** retried, so a student is never double-texted.
- Twilio error 21610 (opted out) suppresses the number.

Statuses: `scheduled → processing → sent → delivered | failed`, plus `canceled` and `skipped`. **"Sent" means the provider accepted the message, not that it was received or read.** Delivery is reconciled from status callbacks.

**Morning summary** (opt-in): an hourly job sends one text around 8 AM local listing what's due in the next 48 hours. It applies the same consent, suppression, quiet-hours, and daily-cap checks, with an atomic once-per-day guard.

---

## Security & privacy model

- **RLS on every table.**
  - Users can `SELECT` only their own rows.
  - They have **no** insert, update, or delete rights except `profiles.display_name` and `time_zone`, enforced by column grants.
  - They cannot change status, create submissions or jobs, or grant consent directly, and every privileged RPC returns `42501` for them. All of this is covered by integration tests.
  - Ops tables (`webhook_events`, `phone_suppressions`, `app_admins`, `admin_audit_log`, `system_settings`, `dev_outbox`, `phone_verifications`, `rate_limit_hits`) have RLS enabled with no policies, so they are service-role only.
- **Consent is authoritative.**
  - SMS and voice consent are separate, unchecked, versioned ledger rows. Each records the timestamp, source, agreement version, IP, and user-agent.
  - Accepting the Terms never implies messaging consent, and a preference flag alone never authorizes a message.
  - Revocation cancels pending jobs server-side in the same transaction.
- **Phone numbers.**
  - Normalized to E.164 with libphonenumber; landlines are rejected.
  - Each number gets an HMAC fingerprint (`PHONE_HASH_SECRET`) so inbound webhooks can find it, and a STOP suppression can outlive account deletion without retaining the number.
  - OTPs are never stored. Twilio Verify holds them; the simulated provider stores only an HMAC.
  - Sending a code is rate-limited per user and per number, attempts are capped at 5, codes expire after 10 minutes, and responses never reveal whether another account owns a number.
- **Screenshots.**
  - Upload limit is 4 MB, sized for serverless body limits.
  - The real format is detected from magic bytes, then decoded and re-encoded with `sharp` to WebP at most 2400px. This strips EXIF, GPS, and XMP and neutralizes polyglots.
  - Files are stored in a **private** bucket under `{user}/{assignment}/{submission}.webp` and reached only through 60-second signed URLs.
  - Reviewers can open only *pending-review* evidence, and every view is audited. Ops admins cannot browse screenshots.
- **Webhooks.** Every webhook validates `X-Twilio-Signature` against the public URL and is deduplicated through `webhook_events`. A failed processing attempt is re-processed when Twilio retries.
- **Scheduler endpoints.** Inngest requests are signed (`INNGEST_SIGNING_KEY`). `/api/internal/dispatch` requires `Bearer CRON_SECRET`, compared in constant time.
- **Other protections.**
  - Rate limits are stored in Postgres and enforced atomically with advisory locks, so they hold across serverless instances. They cover auth, OTP, assignment writes, uploads, consent, preferences, and export.
  - Server Actions have Next.js's built-in origin check, and the upload route enforces a same-origin `Origin` header.
  - Security headers are set in `next.config.ts`.
  - Errors map to safe user messages, internal details are never returned, and logs contain no phone numbers or message bodies.
- **Account deletion** runs in this order:
  1. Flag the account, revoke all consents, cancel scheduled *and* in-flight jobs, and deactivate phone numbers. From this point the final SQL check refuses sends, so retries and late webhooks can't message the account.
  2. Delete storage objects.
  3. Delete the auth user, which cascades to every row.
- **Retention.**
  - Evidence is deleted after `EVIDENCE_RETENTION_DAYS` (default 365), or sooner by the user.
  - Webhook receipts: 90 days. Rate-limit hits: 2 days. Dev outbox: 14 days.
  - What survives deletion: phone suppression fingerprints, and audit rows with the actor set to null.

---

## Environment variables

See `.env.example` for the annotated list.

| Variable | Scope | Required | Notes |
| --- | --- | --- | --- |
| `APP_ENV` | server | prod | `production` forbids the simulated provider |
| `NEXT_PUBLIC_APP_URL` | public | ✓ | Canonical origin; used for email links and webhook signature validation |
| `NEXT_PUBLIC_SUPABASE_URL` | public | ✓ | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | ✓ | or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | public | – | Shown on /contact |
| `SUPABASE_SERVICE_ROLE_KEY` | **server** | ✓ | Secret key; bypasses RLS |
| `SUPABASE_STORAGE_BUCKET` | server | – | default `submissions` |
| `PHONE_HASH_SECRET` | **server** | ✓ | ≥ 32 chars; don't rotate casually |
| `CRON_SECRET` | **server** | ✓ | ≥ 32 chars |
| `NOTIFICATION_PROVIDER` | server | prod | `twilio` or `simulated` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | **server** | with twilio | Auth token also validates webhooks |
| `TWILIO_VERIFY_SERVICE_SID` | server | with twilio | |
| `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` | server | with twilio | Messaging Service recommended |
| `TWILIO_VOICE_FROM_NUMBER` | server | – | Enables voice reminders |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | **server** | prod (if Inngest) | |
| `EVIDENCE_RETENTION_DAYS` | server | – | default 365 |

Server variables are validated with Zod on first use (`src/lib/env.ts`). A misconfiguration fails loudly, and production never silently falls back to simulated notifications.

---

## Supabase setup

**Local.** `npm run db:start` applies `supabase/migrations/*`. The local config (`supabase/config.toml`) enables email confirmation and requires 10-character passwords. `npm run db:reset` rebuilds from scratch. The seed file is intentionally empty: there are no fake users or analytics.

**Hosted.**

1. Create a project, then run `supabase link --project-ref <ref>` and `supabase db push`. This creates the tables, functions, RLS, the private `submissions` bucket, and its storage policy.
2. **Auth → URL configuration:**
   - Site URL: `https://your-domain`.
   - Redirect URLs: `https://your-domain/auth/confirm`.
3. **Auth → Providers → Email:**
   - Enable "Confirm email".
   - Set the minimum password length to 10 or more.
   - Configure custom SMTP; the built-in sender is rate-limited and not meant for production.
4. Copy the URL, publishable key, and secret key into Vercel env vars.
5. Verify that the `submissions` bucket is **private** (Storage → submissions → not public).

---

## Twilio setup

1. **Messaging Service** (recommended). Create a Messaging Service with a sender:
   - Register the US A2P 10DLC brand and campaign, describing it as "accountability reminders the user opted into". Unregistered US traffic is filtered.
   - Keep **Advanced Opt-Out** enabled so Twilio handles STOP/START/HELP replies.
   - Integration → Incoming messages: **Send a webhook** to `https://your-domain/api/webhooks/twilio/inbound` (POST).
   - Set `TWILIO_MESSAGING_SERVICE_SID`.
2. **Verify.** Create a Verify Service with the SMS channel and set `TWILIO_VERIFY_SERVICE_SID`. Configure Verify's own fraud guard and geo permissions.
3. **Voice** (optional). Buy a voice-capable number and set `TWILIO_VOICE_FROM_NUMBER`. Calls use inline TwiML (`<Say>`); status goes to `/api/webhooks/twilio/voice-status`. If it's unset, voice is hidden and the rest of the app works normally.
4. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `NOTIFICATION_PROVIDER=twilio`.
5. Delivery-status callbacks are attached per message automatically when `NEXT_PUBLIC_APP_URL` is HTTPS. They go to `/api/webhooks/twilio/status`.

**Testing real SMS without messaging real users.**

- Use a Twilio **trial** account, which can only text Verified Caller IDs. Add only your own phone.
- Point a separate **staging** deployment at it (`APP_ENV=staging`, its own Supabase project).
- For local testing with real webhooks, expose port 3000 with a tunnel (e.g. `ngrok http 3000`). Set `NEXT_PUBLIC_APP_URL` to the tunnel URL, because signature validation uses it.
- Never point a dev environment at the production database.

---

## Scheduler & webhooks

**Production (recommended): Inngest.**

1. Create an Inngest app and set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel.
2. Deploy, then sync the app at `https://your-domain/api/inngest` (or install the Inngest Vercel integration for automatic syncs).
3. These functions run:
   - `dispatch-due-reminders`: every minute, concurrency 1.
   - `morning-summaries`: hourly.
   - `daily-maintenance`: 04:15 UTC; evidence retention and log purge.

Jobs live in Postgres, so nothing is lost across deploys, and reminders keep working after the browser is closed.

**Alternatives.** Anything that can POST every minute with `Authorization: Bearer $CRON_SECRET` to `/api/internal/dispatch` works:

- add `?task=summaries` hourly and `?task=maintenance` daily;
- options include pg_cron + pg_net, a GitHub Action (`.github/workflows/scheduler-fallback.yml`, disabled by default), or Vercel Cron on a plan that allows per-minute crons.

**Local.** Run `npm run scheduler:dev`, or `INNGEST_DEV=1` with `npm run inngest:dev`. Operations → "Run scheduler tick now" also works.

| Endpoint | Configure in | Auth |
| --- | --- | --- |
| `/api/webhooks/twilio/inbound` | Messaging Service → Incoming messages | X-Twilio-Signature |
| `/api/webhooks/twilio/status` | automatic (per message) | X-Twilio-Signature |
| `/api/webhooks/twilio/voice-status` | automatic (per call) | X-Twilio-Signature |
| `/api/inngest` | Inngest dashboard | Inngest signing key |
| `/api/internal/dispatch` | your cron | Bearer CRON_SECRET |

---

## Testing

| Suite | Count | Covers |
| --- | --- | --- |
| Unit (`tests/unit`) | 54 | State machine (incl. SQL parity), DST/time zones, quiet hours, planning, eligibility, retry classification, dispatcher idempotency, keywords, messages, progress metrics, deadline resolution, image validation & metadata stripping |
| Integration (`tests/integration`) | 42 | Real Supabase: RLS & privilege boundaries (Scenario D), assignment CRUD & rescheduling (B), job caps, submissions & concurrency (A), review workflow, dispatch (C, E, F, G), webhook signature/STOP/START/dedupe/delivery status, account deletion, export, phone verification |
| E2E (`tests/e2e`) | 6 | Playwright against a production build: Scenarios A–F through the real UI (sign-up via Mailpit, onboarding, consent, creation, upload, settings) |

Scenario G (provider outage) runs in the integration suite, which injects a failing provider into the real dispatcher and database. The production server deliberately has no outage-injection hook.

Integration and E2E tests require the local Supabase stack (`npm run db:start`).

`CAPTURE_SCREENS=1 npx playwright test visual` saves light/dark × desktop/mobile screenshots to `test-results/screens` for design review.

---

## Deploying to Vercel

1. Push the repo and import it into Vercel (framework: Next.js, Node 20+).
2. Create the hosted Supabase project and run `supabase db push` (see [Supabase setup](#supabase-setup)).
3. Set every env var from the table above, with `APP_ENV=production` and `NOTIFICATION_PROVIDER=twilio`. Use fresh random values for `PHONE_HASH_SECRET` and `CRON_SECRET`.
4. Deploy.
5. Sync Inngest at `https://your-domain/api/inngest`.
6. Configure the Twilio inbound webhook (see [Twilio setup](#twilio-setup)).
7. Set Supabase Auth URLs and SMTP.
8. Grant yourself `ops`. Run this locally, pointed at production env values:
   `NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run admin:grant -- you@x ops`.
9. **Verification checklist:**
   - [ ] Sign up and the confirmation email arrives (custom SMTP).
   - [ ] Verify your phone via Twilio Verify; the code arrives.
   - [ ] Consent to SMS and create an assignment due in about 2 hours. Reminders appear on the detail page.
   - [ ] Operations → Integration status shows the Twilio and Inngest keys present. "Run scheduler tick now" works, and Inngest shows runs every minute.
   - [ ] Temporarily set the job due in Supabase Studio (`reminder_jobs.scheduled_at`) and a real text arrives. The job goes `sent → delivered` via the status callback.
   - [ ] Reply **STOP**: the number is suppressed, consent is revoked, pending jobs are canceled, and webhook events show `processed`. Reply **START** to resubscribe.
   - [ ] Upload a screenshot: the assignment completes and the remaining reminders are canceled.
   - [ ] Delete the test account: the user, rows, and storage objects are gone.

---

## Operations

`/admin` is visible only to users in `app_admins`, granted via the CLI (`npm run admin:grant`). There is no UI to self-grant roles.

- **ops** can see integration status, aggregate usage, delivery health (jobs by status, failures by category, backlog), webhook processing, and failed jobs. It can retry failed jobs that never reached the provider (consent is rechecked at dispatch), run a scheduler tick, and edit global reminder limits. It sees **no** assignment titles, phone numbers, or screenshots.
- **reviewer** sees the review queue for review-required submissions. Viewing evidence is audited, and accept/reject actions are recorded in `admin_audit_log`.

---

## Known limitations

- **Legal documents are drafts.** The Privacy Policy, Terms, and SMS Terms describe actual behavior but have not been reviewed by counsel.
- **Credentials not configured here.** This repository was built and tested with the simulated provider. The Twilio, Twilio Verify, Twilio Voice, and Inngest integrations are implemented against their current SDKs (twilio 6.x, inngest 4.x) and covered with mocked providers, but **have not been exercised against live accounts**. Do that in staging first, using the checklist above.
- **Voice calls** use synthesized `<Say>` TwiML. There's no answering-machine handling or keypad opt-out. Calls are capped at 1 per assignment and 1 per day by default.
- **Marketing messaging** is intentionally not implemented. The consent category exists so it can never be bundled with reminders.
- **Review-required completion** assumes your organization designates reviewers. There's no teacher or parent role.
- **Upload limit** is 4 MB, sized for Vercel's request-body limit. Larger uploads would need direct-to-storage signed uploads.
- **Email change** relies on Supabase's double-confirmation emails. There's no in-app "pending email change" indicator.
- **Inbound HELP** is answered by Twilio's Advanced Opt-Out defaults; customize the HELP text in the Messaging Service.
- **Status callbacks** that arrive before the send is recorded are ignored, because callbacks are only matched once the provider message id is stored. Delivery status then stays at `sent`.
- **The CI workflow** (`.github/workflows/ci.yml`) is provided but has not been run on GitHub Actions.

---

## Pre-launch legal & compliance checklist

LastStep may be used by minors. Before public launch, have qualified counsel review:

- [ ] **Children's privacy.** COPPA (US, under 13: currently excluded by an age confirmation, which is not age *verification*), state laws (e.g. CA AADC, CCPA/CPRA), GDPR/UK GDPR Art. 8 if serving the EU/UK, and FERPA if partnering with schools.
- [ ] **Parental consent for 13–17-year-olds**, especially for SMS and automated calls.
- [ ] **TCPA / automated calls and texts.** The prior express written consent language, the record-keeping (implemented: timestamp, version, IP, UA), quiet-hour rules by state (e.g. FL, OK), and reassigned-numbers database checks.
- [ ] **CTIA and carrier guidelines, A2P 10DLC registration**, and STOP/HELP handling.
- [ ] **Data retention periods**, the processor agreements (Supabase, Twilio, Inngest, Vercel), breach-response plans, and data-subject request procedures.
- [ ] Final versions of the Privacy Policy, Terms, and SMS Terms. Bump the versions in `src/lib/consent/agreements.ts` when the text changes.
