-- LastStep core schema
-- All timestamps are stored as timestamptz (canonical UTC instants). Local
-- interpretation (deadlines, quiet hours) uses the IANA zone stored alongside.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.assignment_status as enum (
  'draft', 'active', 'submitted', 'under_review', 'completed', 'overdue', 'paused', 'canceled'
);
create type public.assignment_priority as enum ('low', 'normal', 'high');
create type public.reminder_intensity as enum ('gentle', 'standard', 'intensive');
create type public.completion_policy as enum ('self_attested', 'review_required');
create type public.notification_channel as enum ('sms', 'voice');
create type public.consent_category as enum ('sms_reminders', 'voice_reminders', 'marketing');
create type public.consent_status as enum ('granted', 'revoked');
create type public.reminder_kind as enum (
  'follow_up', 'before_deadline', 'due_now', 'overdue', 'voice_call'
);
create type public.reminder_job_status as enum (
  'scheduled',   -- waiting for its time
  'processing',  -- claimed by a dispatcher
  'sent',        -- accepted by provider (NOT proof of receipt)
  'delivered',   -- provider reported delivery
  'failed',      -- permanent failure / dead-lettered
  'canceled',    -- no longer applicable (completed, paused, rescheduled, revoked...)
  'skipped'      -- intentionally not sent at dispatch time (quiet hours, caps, superseded)
);
create type public.submission_status as enum ('pending_review', 'accepted', 'rejected', 'withdrawn');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  time_zone text not null default 'UTC' check (char_length(time_zone) between 1 and 64),
  onboarding_completed boolean not null default false,
  terms_version text,
  terms_accepted_at timestamptz,
  age_confirmed_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contact methods (verified phone numbers). phone_hash is an HMAC computed
-- server-side so inbound webhooks can locate a number without scanning
-- plaintext; normalized_value is E.164 and readable only by its owner.
-- ---------------------------------------------------------------------------
create table public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_type text not null default 'phone' check (contact_type in ('phone')),
  normalized_value text not null check (normalized_value ~ '^\+[1-9][0-9]{6,14}$'),
  value_hash text not null,
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contact_methods_one_active_per_type
  on public.contact_methods (user_id, contact_type) where is_active;
create index contact_methods_value_hash_idx on public.contact_methods (value_hash);

-- Pending phone verifications. OTPs are never stored in plaintext: with
-- Twilio Verify the code lives only at the provider; the simulated provider
-- stores an HMAC of the code.
create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  phone_hash text not null,
  code_hash text,
  attempts int not null default 0,
  max_attempts int not null default 5,
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired', 'failed', 'superseded')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Consent ledger. One row per grant episode; revocation closes the row.
-- Terms-of-service acceptance is NOT stored here and never implies consent.
-- ---------------------------------------------------------------------------
create table public.notification_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_method_id uuid references public.contact_methods (id) on delete set null,
  category public.consent_category not null,
  consent_status public.consent_status not null default 'granted',
  agreement_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  consent_source text not null check (consent_source in (
    'onboarding', 'settings', 'inbound_start', 'inbound_stop', 'account_deletion', 'phone_changed', 'admin'
  )),
  revocation_source text check (revocation_source in (
    'onboarding', 'settings', 'inbound_start', 'inbound_stop', 'account_deletion', 'phone_changed', 'admin'
  )),
  -- Audit metadata: truncated user agent and IP captured at grant time.
  metadata jsonb not null default '{}'::jsonb,
  check ((consent_status = 'revoked') = (revoked_at is not null))
);
create unique index notification_consents_one_active
  on public.notification_consents (user_id, category) where consent_status = 'granted';
create index notification_consents_user_idx on public.notification_consents (user_id, granted_at desc);

-- ---------------------------------------------------------------------------
-- Notification preferences. Preferences never authorize messaging on their
-- own: dispatch requires an active consent row as well.
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sms_enabled boolean not null default false,
  voice_calls_enabled boolean not null default false,
  summaries_enabled boolean not null default false,
  completion_messages_enabled boolean not null default true,
  reminder_intensity public.reminder_intensity not null default 'standard',
  quiet_hours_start time not null default '21:30',
  quiet_hours_end time not null default '08:00',
  time_zone text not null default 'UTC',
  max_daily_notifications int not null default 4 check (max_daily_notifications between 1 and 12),
  -- Optional overrides of the intensity preset (null = use preset)
  first_reminder_lead_hours int check (first_reminder_lead_hours between 1 and 168),
  follow_up_interval_hours int check (follow_up_interval_hours between 4 and 168),
  overdue_interval_hours int check (overdue_interval_hours between 2 and 72),
  voice_call_lead_minutes int not null default 60 check (voice_call_lead_minutes between 15 and 1440),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  subject text check (char_length(subject) <= 100),
  due_at timestamptz not null,
  original_due_at timestamptz,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  priority public.assignment_priority not null default 'normal',
  estimated_minutes int check (estimated_minutes between 1 and 10080),
  reminder_intensity public.reminder_intensity not null default 'standard',
  channels public.notification_channel[] not null default '{}',
  commitment text check (char_length(commitment) <= 500),
  status public.assignment_status not null default 'active',
  completion_policy public.completion_policy not null default 'self_attested',
  is_recovery_plan boolean not null default false,
  schedule_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  paused_at timestamptz,
  overdue_at timestamptz
);
create index assignments_user_status_due_idx on public.assignments (user_id, status, due_at);
create index assignments_active_due_idx on public.assignments (due_at) where status = 'active';

-- Assignment state machine. Mirrors src/lib/assignments/state-machine.ts.
create table public.assignment_transitions (
  from_status public.assignment_status not null,
  to_status public.assignment_status not null,
  primary key (from_status, to_status)
);
insert into public.assignment_transitions (from_status, to_status) values
  ('draft', 'active'), ('draft', 'canceled'),
  ('active', 'submitted'), ('active', 'paused'), ('active', 'overdue'), ('active', 'canceled'),
  ('overdue', 'submitted'), ('overdue', 'paused'), ('overdue', 'canceled'), ('overdue', 'active'),
  ('paused', 'active'), ('paused', 'overdue'), ('paused', 'canceled'),
  ('submitted', 'completed'), ('submitted', 'under_review'),
  ('under_review', 'completed'), ('under_review', 'active'), ('under_review', 'overdue');

create table public.assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  from_status public.assignment_status,
  to_status public.assignment_status not null,
  actor text not null default 'system' check (actor in ('user', 'system', 'reviewer', 'scheduler')),
  created_at timestamptz not null default now()
);
create index assignment_events_user_idx on public.assignment_events (user_id, created_at desc);

create or replace function public.enforce_assignment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'active', 'overdue') then
      raise exception 'invalid initial assignment status %', new.status using errcode = 'check_violation';
    end if;
    return new;
  end if;

  new.updated_at := now();
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.assignment_transitions t
      where t.from_status = old.status and t.to_status = new.status
    ) then
      raise exception 'invalid assignment transition % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;
    case new.status
      when 'submitted' then new.submitted_at := coalesce(new.submitted_at, now());
      when 'completed' then new.completed_at := now();
      when 'canceled' then new.canceled_at := now();
      when 'paused' then new.paused_at := now();
      when 'overdue' then new.overdue_at := coalesce(new.overdue_at, now());
      when 'active' then new.paused_at := null;
      else null;
    end case;
    insert into public.assignment_events (assignment_id, user_id, from_status, to_status, actor)
    values (new.id, new.user_id, old.status, new.status,
            coalesce(nullif(current_setting('laststep.actor', true), ''), 'system'));
  end if;
  return new;
end;
$$;

create trigger assignments_enforce_transition
  before insert or update on public.assignments
  for each row execute function public.enforce_assignment_transition();

-- Creation is logged after insert (the row must exist for the foreign key).
create or replace function public.log_assignment_created()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.assignment_events (assignment_id, user_id, from_status, to_status, actor)
  values (new.id, new.user_id, null, new.status, 'user');
  return null;
end;
$$;

create trigger assignments_log_created
  after insert on public.assignments
  for each row execute function public.log_assignment_created();

-- ---------------------------------------------------------------------------
-- Submissions (evidence). storage_path is a private object key; public URLs
-- are never stored.
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/webp', 'image/png', 'image/jpeg')),
  file_size_bytes int not null check (file_size_bytes > 0 and file_size_bytes <= 5242880),
  width int,
  height int,
  self_attested boolean not null default false,
  status public.submission_status not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text check (char_length(review_note) <= 500),
  deleted_at timestamptz
);
create index submissions_assignment_idx on public.submissions (assignment_id, submitted_at desc);
create index submissions_user_idx on public.submissions (user_id, submitted_at desc);
create index submissions_review_queue_idx on public.submissions (submitted_at) where status = 'pending_review';

-- ---------------------------------------------------------------------------
-- Reminder jobs. occurrence_key uniquely identifies one intended notification
-- (assignment + schedule version + kind + channel + slot), preventing
-- duplicates no matter how many times scheduling runs.
-- ---------------------------------------------------------------------------
create table public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel public.notification_channel not null,
  kind public.reminder_kind not null,
  scheduled_at timestamptz not null,
  original_scheduled_at timestamptz not null,
  status public.reminder_job_status not null default 'scheduled',
  occurrence_key text not null unique,
  schedule_version int not null,
  attempt_count int not null default 0,
  max_attempts int not null default 4,
  last_attempt_at timestamptz,
  locked_until timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text,
  failure_category text,
  provider_message_id text,
  simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminder_jobs_due_idx on public.reminder_jobs (scheduled_at) where status = 'scheduled';
create index reminder_jobs_assignment_idx on public.reminder_jobs (assignment_id, status);
create index reminder_jobs_user_sent_idx on public.reminder_jobs (user_id, sent_at) where sent_at is not null;
create unique index reminder_jobs_provider_msg_idx on public.reminder_jobs (provider_message_id)
  where provider_message_id is not null;

-- ---------------------------------------------------------------------------
-- Notification events (history visible to the owner). No message bodies or
-- phone numbers are stored here.
-- ---------------------------------------------------------------------------
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete set null,
  reminder_job_id uuid references public.reminder_jobs (id) on delete set null,
  channel public.notification_channel,
  event_type text not null,
  provider_status text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index notification_events_user_idx on public.notification_events (user_id, occurred_at desc);
create index notification_events_type_idx on public.notification_events (event_type, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Provider webhooks (dedupe + processing status)
-- ---------------------------------------------------------------------------
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  error_category text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index webhook_events_received_idx on public.webhook_events (received_at desc);

-- Numbers that have opted out at the provider level (keyed by HMAC only, so
-- the suppression survives account deletion without retaining the number).
create table public.phone_suppressions (
  phone_hash text primary key,
  reason text not null check (reason in ('stop', 'carrier', 'admin')),
  created_at timestamptz not null default now(),
  lifted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Operations: rate limiting, admin roles, audit, settings, dev outbox
-- ---------------------------------------------------------------------------
create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, created_at desc);

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('ops', 'reviewer')),
  granted_at timestamptz not null default now(),
  granted_by text not null default 'cli'
);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

create table public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.system_settings (key, value) values
  ('reminder_limits', jsonb_build_object(
    'max_reminders_per_assignment', 12,
    'max_voice_calls_per_assignment', 1,
    'max_voice_calls_per_day', 1,
    'min_gap_minutes', 45,
    'max_active_assignments', 100,
    'max_scheduled_jobs_per_user', 600
  ));

-- Development-only outbox for the simulated provider. Never used when a real
-- provider is configured.
create table public.dev_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  channel text not null,
  to_masked text not null,
  body text not null,
  kind text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger contact_methods_touch before update on public.contact_methods
  for each row execute function public.touch_updated_at();
create trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();
create trigger reminder_jobs_touch before update on public.reminder_jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60);
  v_tz text := coalesce(nullif(new.raw_user_meta_data ->> 'time_zone', ''), 'UTC');
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, display_name, time_zone, terms_version, terms_accepted_at, age_confirmed_at)
  values (
    new.id, v_name, v_tz,
    new.raw_user_meta_data ->> 'terms_version',
    case when new.raw_user_meta_data ->> 'terms_version' is not null then now() end,
    case when (new.raw_user_meta_data ->> 'age_confirmed') = 'true' then now() end
  );
  insert into public.notification_preferences (user_id, time_zone) values (new.id, v_tz);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
