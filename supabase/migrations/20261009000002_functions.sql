-- LastStep server-side operations.
-- Every function in this file is executable ONLY by service_role (see the
-- grants at the bottom). The Next.js server authenticates the caller, then
-- passes the verified user id explicitly. Errors raised with SQLSTATE P0001
-- carry a short machine-readable code in the message (e.g. 'not_found').

set check_function_bodies = off;

-- paused -> submitted: a student may finish work while reminders are paused.
insert into public.assignment_transitions (from_status, to_status) values ('paused', 'submitted');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.reminder_limit(p_key text)
returns int language sql stable set search_path = '' as $$
  select (value ->> p_key)::int from public.system_settings where key = 'reminder_limits'
$$;

create or replace function public.is_valid_time_zone(p_tz text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz)
$$;

create or replace function public.consent_category_for(p_channel public.notification_channel)
returns public.consent_category language sql immutable set search_path = '' as $$
  select case p_channel when 'sms' then 'sms_reminders'::public.consent_category
                        else 'voice_reminders'::public.consent_category end
$$;

create or replace function public.is_admin(p_user_id uuid, p_role text default null)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.app_admins
    where user_id = p_user_id and (p_role is null or role = p_role)
  )
$$;

-- Atomic sliding-window rate limiter backed by Postgres (works across
-- serverless instances). Returns true when the hit is allowed.
create or replace function public.consume_rate_limit(p_bucket text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));
  select count(*) into v_count
  from public.rate_limit_hits
  where bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;

-- Cancel not-yet-sent jobs for an assignment. Jobs already claimed by a
-- dispatcher ('processing') are also canceled so the final pre-send check
-- refuses them.
create or replace function public.cancel_pending_jobs(
  p_assignment_id uuid,
  p_reason text,
  p_channel public.notification_channel default null
) returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.reminder_jobs
     set status = 'canceled', canceled_at = now(), cancel_reason = p_reason, locked_until = null
   where assignment_id = p_assignment_id
     and status in ('scheduled', 'processing')
     and (p_channel is null or channel = p_channel);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.cancel_user_jobs(
  p_user_id uuid,
  p_reason text,
  p_channel public.notification_channel default null
) returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.reminder_jobs
     set status = 'canceled', canceled_at = now(), cancel_reason = p_reason, locked_until = null
   where user_id = p_user_id
     and status in ('scheduled', 'processing')
     and (p_channel is null or channel = p_channel);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
create or replace function public.create_assignment(p_user_id uuid, p_payload jsonb)
returns public.assignments
language plpgsql
set search_path = ''
as $$
declare
  v_row public.assignments;
  v_count int;
  v_tz text := p_payload ->> 'time_zone';
begin
  if exists (select 1 from public.profiles where id = p_user_id and deletion_requested_at is not null)
     or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception using errcode = 'P0001', message = 'account_unavailable';
  end if;
  if not public.is_valid_time_zone(v_tz) then
    raise exception using errcode = 'P0001', message = 'invalid_time_zone';
  end if;
  select count(*) into v_count from public.assignments
   where user_id = p_user_id and status in ('active', 'overdue', 'paused', 'submitted', 'under_review');
  if v_count >= public.reminder_limit('max_active_assignments') then
    raise exception using errcode = 'P0001', message = 'too_many_active_assignments';
  end if;

  perform set_config('laststep.actor', 'user', true);
  insert into public.assignments (
    user_id, title, description, subject, due_at, original_due_at, time_zone, priority,
    estimated_minutes, reminder_intensity, channels, commitment, completion_policy,
    is_recovery_plan, status
  ) values (
    p_user_id,
    btrim(p_payload ->> 'title'),
    nullif(btrim(p_payload ->> 'description'), ''),
    nullif(btrim(p_payload ->> 'subject'), ''),
    (p_payload ->> 'due_at')::timestamptz,
    (p_payload ->> 'original_due_at')::timestamptz,
    v_tz,
    coalesce((p_payload ->> 'priority')::public.assignment_priority, 'normal'),
    (p_payload ->> 'estimated_minutes')::int,
    coalesce((p_payload ->> 'reminder_intensity')::public.reminder_intensity, 'standard'),
    coalesce(
      (select array_agg(distinct c::public.notification_channel)
         from jsonb_array_elements_text(coalesce(p_payload -> 'channels', '[]'::jsonb)) c),
      '{}'
    ),
    nullif(btrim(p_payload ->> 'commitment'), ''),
    coalesce((p_payload ->> 'completion_policy')::public.completion_policy, 'self_attested'),
    coalesce((p_payload ->> 'is_recovery_plan')::boolean, false),
    'active'
  ) returning * into v_row;
  return v_row;
end;
$$;

-- Edit an assignment. Any edit bumps schedule_version so the caller rebuilds
-- the reminder plan; jobs from older versions are canceled by sync.
create or replace function public.update_assignment(p_user_id uuid, p_assignment_id uuid, p_payload jsonb)
returns public.assignments
language plpgsql
set search_path = ''
as $$
declare
  v_row public.assignments;
  v_due timestamptz;
  v_tz text;
begin
  select * into v_row from public.assignments
   where id = p_assignment_id and user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if v_row.status not in ('active', 'overdue', 'paused') then
    raise exception using errcode = 'P0001', message = 'not_editable';
  end if;

  v_due := coalesce((p_payload ->> 'due_at')::timestamptz, v_row.due_at);
  v_tz := coalesce(p_payload ->> 'time_zone', v_row.time_zone);
  if not public.is_valid_time_zone(v_tz) then
    raise exception using errcode = 'P0001', message = 'invalid_time_zone';
  end if;
  if v_due is distinct from v_row.due_at and v_due <= now() then
    raise exception using errcode = 'P0001', message = 'deadline_in_past';
  end if;

  perform set_config('laststep.actor', 'user', true);
  update public.assignments set
    title = coalesce(btrim(p_payload ->> 'title'), title),
    description = case when p_payload ? 'description' then nullif(btrim(p_payload ->> 'description'), '') else description end,
    subject = case when p_payload ? 'subject' then nullif(btrim(p_payload ->> 'subject'), '') else subject end,
    commitment = case when p_payload ? 'commitment' then nullif(btrim(p_payload ->> 'commitment'), '') else commitment end,
    estimated_minutes = case when p_payload ? 'estimated_minutes' then (p_payload ->> 'estimated_minutes')::int else estimated_minutes end,
    priority = coalesce((p_payload ->> 'priority')::public.assignment_priority, priority),
    reminder_intensity = coalesce((p_payload ->> 'reminder_intensity')::public.reminder_intensity, reminder_intensity),
    completion_policy = coalesce((p_payload ->> 'completion_policy')::public.completion_policy, completion_policy),
    channels = case when p_payload ? 'channels' then coalesce(
      (select array_agg(distinct c::public.notification_channel)
         from jsonb_array_elements_text(p_payload -> 'channels') c), '{}') else channels end,
    due_at = v_due,
    time_zone = v_tz,
    -- A new future deadline brings an overdue assignment back to active.
    status = case when status = 'overdue' and v_due > now() then 'active'::public.assignment_status else status end,
    overdue_at = case when status = 'overdue' and v_due > now() then null else overdue_at end,
    schedule_version = schedule_version + 1
  where id = p_assignment_id
  returning * into v_row;

  perform public.cancel_pending_jobs(p_assignment_id, 'rescheduled');
  return v_row;
end;
$$;

create or replace function public.transition_assignment(p_user_id uuid, p_assignment_id uuid, p_action text)
returns public.assignments
language plpgsql
set search_path = ''
as $$
declare
  v_row public.assignments;
  v_to public.assignment_status;
begin
  select * into v_row from public.assignments
   where id = p_assignment_id and user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  v_to := case p_action
    when 'pause' then 'paused'
    when 'cancel' then 'canceled'
    when 'resume' then case when v_row.due_at > now() then 'active' else 'overdue' end
    else null
  end::public.assignment_status;
  if v_to is null then
    raise exception using errcode = 'P0001', message = 'invalid_action';
  end if;
  if p_action = 'resume' and v_row.status <> 'paused' then
    raise exception using errcode = 'P0001', message = 'invalid_transition';
  end if;
  if not exists (select 1 from public.assignment_transitions where from_status = v_row.status and to_status = v_to) then
    raise exception using errcode = 'P0001', message = 'invalid_transition';
  end if;

  perform set_config('laststep.actor', 'user', true);
  update public.assignments
     set status = v_to,
         schedule_version = schedule_version + 1
   where id = p_assignment_id
  returning * into v_row;

  perform public.cancel_pending_jobs(p_assignment_id, case p_action when 'pause' then 'paused' when 'cancel' then 'assignment_canceled' else 'rescheduled' end);
  return v_row;
end;
$$;

create or replace function public.mark_overdue_assignments()
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  perform set_config('laststep.actor', 'scheduler', true);
  update public.assignments set status = 'overdue'
   where status = 'active' and due_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reminder jobs
-- ---------------------------------------------------------------------------
-- Replace the pending plan for an assignment with p_jobs (computed in TS).
-- Ignores stale plans (schedule_version mismatch) and inserts idempotently.
create or replace function public.sync_reminder_jobs(p_assignment_id uuid, p_schedule_version int, p_jobs jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_a public.assignments;
  v_canceled int := 0;
  v_inserted int := 0;
  v_user_pending int;
  v_new int;
begin
  select * into v_a from public.assignments where id = p_assignment_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_a.schedule_version <> p_schedule_version then
    return jsonb_build_object('status', 'stale');
  end if;
  if v_a.status not in ('active', 'overdue')
     or exists (select 1 from public.profiles where id = v_a.user_id and deletion_requested_at is not null) then
    v_canceled := public.cancel_pending_jobs(p_assignment_id, 'not_active');
    return jsonb_build_object('status', 'inactive', 'canceled', v_canceled, 'inserted', 0);
  end if;

  update public.reminder_jobs
     set status = 'canceled', canceled_at = now(), cancel_reason = 'rescheduled'
   where assignment_id = p_assignment_id
     and status = 'scheduled'
     and occurrence_key not in (select x ->> 'occurrence_key' from jsonb_array_elements(p_jobs) x);
  get diagnostics v_canceled = row_count;

  select count(*) into v_user_pending from public.reminder_jobs
   where user_id = v_a.user_id and status = 'scheduled' and assignment_id <> p_assignment_id;
  v_new := jsonb_array_length(p_jobs);
  if v_user_pending + v_new > public.reminder_limit('max_scheduled_jobs_per_user') then
    raise exception using errcode = 'P0001', message = 'too_many_scheduled_reminders';
  end if;

  with incoming as (
    select j.channel, j.kind, j.scheduled_at, j.occurrence_key,
           row_number() over (partition by j.channel order by j.scheduled_at) as rn
      from jsonb_to_recordset(p_jobs) as j(
        channel public.notification_channel, kind public.reminder_kind,
        scheduled_at timestamptz, occurrence_key text)
     where j.scheduled_at > now() - interval '1 minute'
       and j.occurrence_key like p_assignment_id::text || ':' || p_schedule_version::text || ':%'
  )
  insert into public.reminder_jobs (
    assignment_id, user_id, channel, kind, scheduled_at, original_scheduled_at, occurrence_key, schedule_version
  )
  select p_assignment_id, v_a.user_id, i.channel, i.kind, i.scheduled_at, i.scheduled_at, i.occurrence_key, p_schedule_version
    from incoming i
   where (i.channel = 'sms' and i.rn <= public.reminder_limit('max_reminders_per_assignment'))
      or (i.channel = 'voice' and i.rn <= public.reminder_limit('max_voice_calls_per_assignment'))
  on conflict (occurrence_key) do update
    -- Revive an identical occurrence that was canceled before it was ever
    -- sent (e.g. consent revoked then re-granted). Sent jobs never revive.
    set status = 'scheduled', canceled_at = null, cancel_reason = null, locked_until = null
    where public.reminder_jobs.status = 'canceled'
      and public.reminder_jobs.sent_at is null
      and public.reminder_jobs.provider_message_id is null;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('status', 'ok', 'canceled', v_canceled, 'inserted', v_inserted);
end;
$$;

-- Claim due jobs for dispatch. Older due jobs for the same assignment and
-- channel are skipped as 'superseded' so an outage or quiet-hours deferral
-- never produces a burst. Jobs stuck in 'processing' past their lock are
-- dead-lettered (outcome unknown -> never blindly resent).
create or replace function public.claim_due_reminder_jobs(p_limit int default 50)
returns setof uuid
language plpgsql
set search_path = ''
as $$
begin
  update public.reminder_jobs
     set status = 'failed', failure_category = 'stale_processing_lock', locked_until = null
   where status = 'processing' and locked_until < now();

  with due as (
    select id, row_number() over (partition by assignment_id, channel order by scheduled_at desc, id) as rn
      from public.reminder_jobs
     where status = 'scheduled' and scheduled_at <= now()
  )
  update public.reminder_jobs r
     set status = 'skipped', cancel_reason = 'superseded'
    from due
   where r.id = due.id and due.rn > 1;

  return query
  with c as (
    select id from public.reminder_jobs
     where status = 'scheduled' and scheduled_at <= now()
     order by scheduled_at
     limit p_limit
     for update skip locked
  )
  update public.reminder_jobs r
     set status = 'processing',
         attempt_count = r.attempt_count + 1,
         last_attempt_at = now(),
         locked_until = now() + interval '5 minutes'
    from c
   where r.id = c.id
  returning r.id;
end;
$$;

-- Claim one specific job. Returns false if it was already claimed, sent,
-- canceled or is not yet due: concurrent triggers of the same occurrence
-- therefore dispatch at most once.
create or replace function public.claim_reminder_job(p_job_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.reminder_jobs
     set status = 'processing',
         attempt_count = attempt_count + 1,
         last_attempt_at = now(),
         locked_until = now() + interval '5 minutes'
   where id = p_job_id and status = 'scheduled' and scheduled_at <= now()
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.get_dispatch_context(p_job_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_job public.reminder_jobs;
  v_a public.assignments;
  v_prefs public.notification_preferences;
  v_contact public.contact_methods;
  v_profile public.profiles;
  v_tz text;
  v_day_start timestamptz;
begin
  select * into v_job from public.reminder_jobs where id = p_job_id;
  if not found then
    return null;
  end if;
  select * into v_a from public.assignments where id = v_job.assignment_id;
  select * into v_profile from public.profiles where id = v_job.user_id;
  select * into v_prefs from public.notification_preferences where user_id = v_job.user_id;
  select * into v_contact from public.contact_methods
   where user_id = v_job.user_id and contact_type = 'phone' and is_active;

  v_tz := coalesce(v_prefs.time_zone, v_profile.time_zone, 'UTC');
  v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;

  return jsonb_build_object(
    'job', jsonb_build_object(
      'id', v_job.id, 'assignment_id', v_job.assignment_id, 'user_id', v_job.user_id,
      'channel', v_job.channel, 'kind', v_job.kind, 'status', v_job.status,
      'scheduled_at', v_job.scheduled_at, 'original_scheduled_at', v_job.original_scheduled_at,
      'attempt_count', v_job.attempt_count, 'max_attempts', v_job.max_attempts,
      'schedule_version', v_job.schedule_version),
    'assignment', case when v_a.id is null then null else jsonb_build_object(
      'id', v_a.id, 'title', v_a.title, 'status', v_a.status, 'due_at', v_a.due_at,
      'time_zone', v_a.time_zone, 'channels', to_jsonb(v_a.channels),
      'schedule_version', v_a.schedule_version) end,
    'account_active', v_profile.id is not null and v_profile.deletion_requested_at is null,
    'preferences', case when v_prefs.user_id is null then null else jsonb_build_object(
      'sms_enabled', v_prefs.sms_enabled, 'voice_calls_enabled', v_prefs.voice_calls_enabled,
      'quiet_hours_start', to_char(v_prefs.quiet_hours_start, 'HH24:MI'),
      'quiet_hours_end', to_char(v_prefs.quiet_hours_end, 'HH24:MI'),
      'time_zone', v_tz, 'max_daily_notifications', v_prefs.max_daily_notifications) end,
    'contact', case when v_contact.id is null then null else jsonb_build_object(
      'id', v_contact.id, 'phone', v_contact.normalized_value, 'phone_hash', v_contact.value_hash,
      'verified', v_contact.verified_at is not null) end,
    'consent', jsonb_build_object(
      'sms', exists (select 1 from public.notification_consents
                      where user_id = v_job.user_id and category = 'sms_reminders' and consent_status = 'granted'),
      'voice', exists (select 1 from public.notification_consents
                        where user_id = v_job.user_id and category = 'voice_reminders' and consent_status = 'granted')),
    'suppressed', v_contact.id is not null and exists (
      select 1 from public.phone_suppressions where phone_hash = v_contact.value_hash and lifted_at is null),
    'sent_today', (select count(*) from public.reminder_jobs
                    where user_id = v_job.user_id and sent_at >= v_day_start),
    'voice_today', (select count(*) from public.reminder_jobs
                     where user_id = v_job.user_id and channel = 'voice' and sent_at >= v_day_start),
    'last_sent_for_assignment', (select max(sent_at) from public.reminder_jobs
                                  where assignment_id = v_job.assignment_id and sent_at is not null),
    'limits', (select value from public.system_settings where key = 'reminder_limits')
  );
end;
$$;

-- Final authoritative check immediately before calling the provider.
create or replace function public.confirm_job_sendable(p_job_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.reminder_jobs j
      join public.assignments a on a.id = j.assignment_id
      join public.profiles p on p.id = j.user_id
      join public.notification_preferences np on np.user_id = j.user_id
      join public.contact_methods c on c.user_id = j.user_id and c.is_active and c.contact_type = 'phone'
     where j.id = p_job_id
       and j.status = 'processing'
       and j.schedule_version = a.schedule_version
       and a.status in ('active', 'overdue')
       and j.channel = any (a.channels)
       and p.deletion_requested_at is null
       and c.verified_at is not null
       and ((j.channel = 'sms' and np.sms_enabled) or (j.channel = 'voice' and np.voice_calls_enabled))
       and exists (select 1 from public.notification_consents nc
                    where nc.user_id = j.user_id
                      and nc.category = public.consent_category_for(j.channel)
                      and nc.consent_status = 'granted')
       and not exists (select 1 from public.phone_suppressions s
                        where s.phone_hash = c.value_hash and s.lifted_at is null)
  )
$$;

-- Record the outcome of a dispatch attempt. Idempotent: only a job that is
-- still 'processing' is changed.
create or replace function public.finalize_reminder_job(p_job_id uuid, p_outcome text, p_details jsonb default '{}'::jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_job public.reminder_jobs;
  v_event text := p_outcome;
begin
  select * into v_job from public.reminder_jobs where id = p_job_id for update;
  if not found then
    return 'not_found';
  end if;
  -- A job canceled while its provider call was in flight must still record
  -- the send, so it can never be revived and sent twice.
  if v_job.status <> 'processing'
     and not (p_outcome = 'sent' and v_job.status = 'canceled' and v_job.provider_message_id is null) then
    return v_job.status::text;
  end if;

  if p_outcome = 'sent' then
    update public.reminder_jobs set status = 'sent', sent_at = now(), locked_until = null,
      provider_message_id = p_details ->> 'provider_message_id',
      simulated = coalesce((p_details ->> 'simulated')::boolean, false),
      failure_category = null
     where id = p_job_id;
  elsif p_outcome = 'retry' then
    if v_job.attempt_count >= v_job.max_attempts then
      update public.reminder_jobs set status = 'failed', locked_until = null,
        failure_category = 'retry_exhausted:' || coalesce(p_details ->> 'failure_category', 'unknown')
       where id = p_job_id;
      v_event := 'failed';
    else
      update public.reminder_jobs set status = 'scheduled', locked_until = null,
        scheduled_at = (p_details ->> 'retry_at')::timestamptz,
        failure_category = p_details ->> 'failure_category'
       where id = p_job_id;
    end if;
  elsif p_outcome = 'deferred' then
    update public.reminder_jobs set status = 'scheduled', locked_until = null,
      scheduled_at = (p_details ->> 'defer_until')::timestamptz,
      attempt_count = greatest(attempt_count - 1, 0)
     where id = p_job_id;
  elsif p_outcome = 'failed' then
    update public.reminder_jobs set status = 'failed', locked_until = null,
      failure_category = coalesce(p_details ->> 'failure_category', 'unknown')
     where id = p_job_id;
  elsif p_outcome = 'skipped' then
    update public.reminder_jobs set status = 'skipped', locked_until = null,
      cancel_reason = p_details ->> 'reason'
     where id = p_job_id;
  elsif p_outcome = 'canceled' then
    update public.reminder_jobs set status = 'canceled', locked_until = null, canceled_at = now(),
      cancel_reason = p_details ->> 'reason'
     where id = p_job_id;
  else
    raise exception using errcode = 'P0001', message = 'invalid_outcome';
  end if;

  insert into public.notification_events (user_id, assignment_id, reminder_job_id, channel, event_type, provider_status, metadata)
  values (v_job.user_id, v_job.assignment_id, v_job.id, v_job.channel, v_event, p_details ->> 'provider_status',
          jsonb_strip_nulls(jsonb_build_object(
            'kind', v_job.kind,
            'reason', p_details ->> 'reason',
            'failure_category', p_details ->> 'failure_category',
            'simulated', (p_details ->> 'simulated')::boolean,
            'attempt', v_job.attempt_count)));
  return (select status::text from public.reminder_jobs where id = p_job_id);
end;
$$;

-- Delivery-status reconciliation from provider callbacks. Only moves forward
-- (sent -> delivered | failed); never resurrects a job.
create or replace function public.record_delivery_status(
  p_provider_message_id text, p_status text, p_provider_status text, p_error_code text default null
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_job public.reminder_jobs;
begin
  select * into v_job from public.reminder_jobs where provider_message_id = p_provider_message_id for update;
  if not found then
    return false;
  end if;
  if p_status = 'delivered' and v_job.status = 'sent' then
    update public.reminder_jobs set status = 'delivered', delivered_at = now() where id = v_job.id;
  elsif p_status = 'failed' and v_job.status in ('sent', 'delivered') then
    update public.reminder_jobs set status = 'failed',
      failure_category = 'provider_' || coalesce(p_error_code, p_provider_status) where id = v_job.id;
  else
    -- intermediate states (queued/sending/ringing...) are logged only
    null;
  end if;
  insert into public.notification_events (user_id, assignment_id, reminder_job_id, channel, event_type, provider_status, metadata)
  values (v_job.user_id, v_job.assignment_id, v_job.id, v_job.channel, 'status_' || p_status, p_provider_status,
          jsonb_strip_nulls(jsonb_build_object('error_code', p_error_code)));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------
create or replace function public.record_consent(
  p_user_id uuid,
  p_category public.consent_category,
  p_grant boolean,
  p_agreement_version text,
  p_source text,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_contact public.contact_methods;
  v_existing public.notification_consents;
  v_row public.notification_consents;
  v_channel public.notification_channel;
begin
  if exists (select 1 from public.profiles where id = p_user_id and deletion_requested_at is not null) then
    raise exception using errcode = 'P0001', message = 'account_unavailable';
  end if;
  v_channel := case p_category when 'sms_reminders' then 'sms' when 'voice_reminders' then 'voice' else null end::public.notification_channel;

  select * into v_existing from public.notification_consents
   where user_id = p_user_id and category = p_category and consent_status = 'granted'
   for update;

  if p_grant then
    if v_channel is not null then
      select * into v_contact from public.contact_methods
       where user_id = p_user_id and contact_type = 'phone' and is_active and verified_at is not null;
      if not found then
        raise exception using errcode = 'P0001', message = 'phone_not_verified';
      end if;
      if exists (select 1 from public.phone_suppressions where phone_hash = v_contact.value_hash and lifted_at is null) then
        raise exception using errcode = 'P0001', message = 'phone_opted_out';
      end if;
    end if;
    if v_existing.id is not null then
      return to_jsonb(v_existing);
    end if;
    insert into public.notification_consents (user_id, contact_method_id, category, consent_status, agreement_version, consent_source, metadata)
    values (p_user_id, v_contact.id, p_category, 'granted', p_agreement_version, p_source, coalesce(p_metadata, '{}'::jsonb))
    returning * into v_row;
    if v_channel = 'sms' then
      update public.notification_preferences set sms_enabled = true where user_id = p_user_id;
    elsif v_channel = 'voice' then
      update public.notification_preferences set voice_calls_enabled = true where user_id = p_user_id;
    end if;
    insert into public.notification_events (user_id, channel, event_type, metadata)
    values (p_user_id, v_channel, 'consent_granted', jsonb_build_object('category', p_category, 'source', p_source));
    return to_jsonb(v_row);
  end if;

  -- revoke
  if v_existing.id is not null then
    update public.notification_consents
       set consent_status = 'revoked', revoked_at = now(), revocation_source = p_source
     where id = v_existing.id
    returning * into v_row;
    insert into public.notification_events (user_id, channel, event_type, metadata)
    values (p_user_id, v_channel, 'consent_revoked', jsonb_build_object('category', p_category, 'source', p_source));
  end if;
  if v_channel = 'sms' then
    update public.notification_preferences set sms_enabled = false where user_id = p_user_id;
  elsif v_channel = 'voice' then
    update public.notification_preferences set voice_calls_enabled = false where user_id = p_user_id;
  end if;
  if v_channel is not null then
    perform public.cancel_user_jobs(p_user_id, 'consent_revoked', v_channel);
  end if;
  return coalesce(to_jsonb(v_row), '{}'::jsonb);
end;
$$;

-- Inbound STOP / START keyword processing for a phone number (by HMAC).
create or replace function public.process_inbound_keyword(p_phone_hash text, p_keyword text, p_agreement_version text)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_users uuid[];
  v_user uuid;
begin
  select coalesce(array_agg(distinct user_id), '{}') into v_users
    from public.contact_methods where value_hash = p_phone_hash and is_active;

  if p_keyword = 'stop' then
    insert into public.phone_suppressions (phone_hash, reason) values (p_phone_hash, 'stop')
    on conflict (phone_hash) do update set reason = 'stop', lifted_at = null, created_at = now();
    foreach v_user in array v_users loop
      update public.notification_consents
         set consent_status = 'revoked', revoked_at = now(), revocation_source = 'inbound_stop'
       where user_id = v_user and category in ('sms_reminders', 'voice_reminders') and consent_status = 'granted';
      update public.notification_preferences set sms_enabled = false, voice_calls_enabled = false where user_id = v_user;
      perform public.cancel_user_jobs(v_user, 'opt_out');
      insert into public.notification_events (user_id, channel, event_type, metadata)
      values (v_user, 'sms', 'opt_out', jsonb_build_object('source', 'inbound_stop'));
    end loop;
    return v_users;
  elsif p_keyword = 'start' then
    update public.phone_suppressions set lifted_at = now() where phone_hash = p_phone_hash and lifted_at is null;
    foreach v_user in array v_users loop
      if exists (select 1 from public.profiles where id = v_user and deletion_requested_at is null)
         and exists (select 1 from public.contact_methods where user_id = v_user and value_hash = p_phone_hash
                       and is_active and verified_at is not null)
         and not exists (select 1 from public.notification_consents
                          where user_id = v_user and category = 'sms_reminders' and consent_status = 'granted') then
        insert into public.notification_consents (user_id, contact_method_id, category, consent_status, agreement_version, consent_source)
        select v_user, c.id, 'sms_reminders', 'granted', p_agreement_version, 'inbound_start'
          from public.contact_methods c where c.user_id = v_user and c.value_hash = p_phone_hash and c.is_active;
        update public.notification_preferences set sms_enabled = true where user_id = v_user;
        insert into public.notification_events (user_id, channel, event_type, metadata)
        values (v_user, 'sms', 'opt_in', jsonb_build_object('source', 'inbound_start'));
      end if;
    end loop;
    return v_users;
  end if;
  raise exception using errcode = 'P0001', message = 'invalid_keyword';
end;
$$;

-- ---------------------------------------------------------------------------
-- Phone verification
-- ---------------------------------------------------------------------------
create or replace function public.create_phone_verification(
  p_user_id uuid, p_phone_e164 text, p_phone_hash text, p_code_hash text, p_ttl_seconds int
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.phone_verifications set status = 'superseded'
   where user_id = p_user_id and status = 'pending';
  insert into public.phone_verifications (user_id, phone_e164, phone_hash, code_hash, expires_at)
  values (p_user_id, p_phone_e164, p_phone_hash, p_code_hash, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_id;
  return v_id;
end;
$$;

-- Registers one verification attempt atomically and returns the state the
-- caller needs to check the code.
create or replace function public.begin_phone_verification_attempt(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.phone_verifications;
begin
  select * into v_row from public.phone_verifications
   where user_id = p_user_id and status = 'pending'
   order by created_at desc limit 1
   for update;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  if v_row.expires_at <= now() then
    update public.phone_verifications set status = 'expired' where id = v_row.id;
    return jsonb_build_object('status', 'expired');
  end if;
  if v_row.attempts >= v_row.max_attempts then
    update public.phone_verifications set status = 'failed' where id = v_row.id;
    return jsonb_build_object('status', 'locked');
  end if;
  update public.phone_verifications set attempts = attempts + 1 where id = v_row.id;
  return jsonb_build_object(
    'status', 'pending', 'id', v_row.id, 'phone_e164', v_row.phone_e164,
    'phone_hash', v_row.phone_hash, 'code_hash', v_row.code_hash,
    'attempts_remaining', v_row.max_attempts - v_row.attempts - 1);
end;
$$;

-- Approve a verification and make the number the user's active, verified
-- phone. Changing numbers revokes consents tied to the previous number.
create or replace function public.approve_phone_verification(p_user_id uuid, p_verification_id uuid)
returns public.contact_methods
language plpgsql
set search_path = ''
as $$
declare
  v_ver public.phone_verifications;
  v_existing public.contact_methods;
  v_row public.contact_methods;
begin
  select * into v_ver from public.phone_verifications
   where id = p_verification_id and user_id = p_user_id and status = 'pending'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'verification_not_pending';
  end if;
  update public.phone_verifications set status = 'approved' where id = v_ver.id;

  select * into v_existing from public.contact_methods
   where user_id = p_user_id and contact_type = 'phone' and is_active
   for update;
  if found and v_existing.value_hash = v_ver.phone_hash then
    update public.contact_methods set verified_at = coalesce(verified_at, now())
     where id = v_existing.id returning * into v_row;
    return v_row;
  end if;
  if found then
    update public.contact_methods set is_active = false where id = v_existing.id;
    update public.notification_consents
       set consent_status = 'revoked', revoked_at = now(), revocation_source = 'phone_changed'
     where user_id = p_user_id and category in ('sms_reminders', 'voice_reminders') and consent_status = 'granted';
    update public.notification_preferences set sms_enabled = false, voice_calls_enabled = false where user_id = p_user_id;
    perform public.cancel_user_jobs(p_user_id, 'phone_changed');
  end if;
  insert into public.contact_methods (user_id, contact_type, normalized_value, value_hash, verified_at, is_active)
  values (p_user_id, 'phone', v_ver.phone_e164, v_ver.phone_hash, now(), true)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.remove_phone(p_user_id uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.contact_methods set is_active = false
   where user_id = p_user_id and contact_type = 'phone' and is_active;
  get diagnostics v_count = row_count;
  update public.notification_consents
     set consent_status = 'revoked', revoked_at = now(), revocation_source = 'phone_changed'
   where user_id = p_user_id and category in ('sms_reminders', 'voice_reminders') and consent_status = 'granted';
  update public.notification_preferences set sms_enabled = false, voice_calls_enabled = false where user_id = p_user_id;
  perform public.cancel_user_jobs(p_user_id, 'phone_removed');
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------
create or replace function public.create_submission(
  p_user_id uuid,
  p_assignment_id uuid,
  p_submission_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes int,
  p_width int,
  p_height int,
  p_self_attested boolean
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_a public.assignments;
  v_s public.submissions;
  v_canceled int;
begin
  -- Row lock serializes against reminder sync/dispatch and double submits.
  select * into v_a from public.assignments
   where id = p_assignment_id and user_id = p_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  if v_a.status not in ('active', 'overdue', 'paused') then
    raise exception using errcode = 'P0001', message = 'not_submittable';
  end if;
  if v_a.completion_policy = 'self_attested' and not p_self_attested then
    raise exception using errcode = 'P0001', message = 'attestation_required';
  end if;
  if p_storage_path not like p_user_id::text || '/' || p_assignment_id::text || '/%' then
    raise exception using errcode = 'P0001', message = 'invalid_storage_path';
  end if;

  perform set_config('laststep.actor', 'user', true);
  update public.assignments set status = 'submitted', submitted_at = now(),
         schedule_version = schedule_version + 1
   where id = p_assignment_id;
  v_canceled := public.cancel_pending_jobs(p_assignment_id, 'submitted');

  insert into public.submissions (
    id, assignment_id, user_id, storage_path, mime_type, file_size_bytes, width, height,
    self_attested, status, reviewed_at
  ) values (
    p_submission_id, p_assignment_id, p_user_id, p_storage_path, p_mime_type, p_file_size_bytes,
    p_width, p_height, p_self_attested,
    case v_a.completion_policy when 'self_attested' then 'accepted' else 'pending_review' end::public.submission_status,
    case v_a.completion_policy when 'self_attested' then now() end
  ) returning * into v_s;

  perform set_config('laststep.actor', 'system', true);
  update public.assignments
     set status = case v_a.completion_policy when 'self_attested' then 'completed' else 'under_review' end::public.assignment_status
   where id = p_assignment_id
  returning * into v_a;

  return jsonb_build_object('assignment', to_jsonb(v_a), 'submission', to_jsonb(v_s), 'canceled_jobs', v_canceled);
end;
$$;

create or replace function public.review_submission(
  p_reviewer_id uuid, p_submission_id uuid, p_decision text, p_note text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_s public.submissions;
  v_a public.assignments;
begin
  if not public.is_admin(p_reviewer_id, 'reviewer') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if p_decision not in ('accept', 'reject') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;
  select * into v_s from public.submissions where id = p_submission_id for update;
  if not found or v_s.status <> 'pending_review' then
    raise exception using errcode = 'P0001', message = 'not_pending';
  end if;
  select * into v_a from public.assignments where id = v_s.assignment_id for update;

  update public.submissions
     set status = case p_decision when 'accept' then 'accepted' else 'rejected' end::public.submission_status,
         reviewed_at = now(), reviewed_by = p_reviewer_id, review_note = left(p_note, 500)
   where id = p_submission_id returning * into v_s;

  perform set_config('laststep.actor', 'reviewer', true);
  update public.assignments
     set status = case
           when p_decision = 'accept' then 'completed'
           when due_at > now() then 'active'
           else 'overdue' end::public.assignment_status,
         schedule_version = schedule_version + case when p_decision = 'accept' then 0 else 1 end
   where id = v_a.id returning * into v_a;

  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (p_reviewer_id, 'submission.' || p_decision, 'submission', p_submission_id::text, '{}'::jsonb);
  return jsonb_build_object('assignment', to_jsonb(v_a), 'submission', to_jsonb(v_s));
end;
$$;

-- Marks evidence deleted and returns the object path for storage removal.
create or replace function public.delete_submission_evidence(p_user_id uuid, p_submission_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_path text;
begin
  update public.submissions set deleted_at = now()
   where id = p_submission_id and user_id = p_user_id and deleted_at is null
     and status <> 'pending_review'
  returning storage_path into v_path;
  if v_path is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  return v_path;
end;
$$;

create or replace function public.expire_old_evidence(p_retention_days int)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_paths text[];
begin
  with expired as (
    update public.submissions set deleted_at = now()
     where deleted_at is null and status <> 'pending_review'
       and submitted_at < now() - make_interval(days => p_retention_days)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_paths from expired;
  return v_paths;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion (step 1 of 2: suppress everything, return evidence paths;
-- the server then removes storage objects and deletes the auth user, which
-- cascades to all user-owned rows).
-- ---------------------------------------------------------------------------
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_paths text[];
begin
  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p_user_id;
  update public.notification_consents
     set consent_status = 'revoked', revoked_at = now(), revocation_source = 'account_deletion'
   where user_id = p_user_id and consent_status = 'granted';
  update public.notification_preferences set sms_enabled = false, voice_calls_enabled = false where user_id = p_user_id;
  perform public.cancel_user_jobs(p_user_id, 'account_deleted');
  update public.contact_methods set is_active = false where user_id = p_user_id;
  select coalesce(array_agg(storage_path), '{}') into v_paths from public.submissions where user_id = p_user_id;
  return v_paths;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin operations
-- ---------------------------------------------------------------------------
create or replace function public.admin_retry_job(p_admin_id uuid, p_job_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_job public.reminder_jobs;
begin
  if not public.is_admin(p_admin_id, 'ops') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  select * into v_job from public.reminder_jobs where id = p_job_id for update;
  -- Only jobs that provably never reached the provider may be retried.
  if not found or v_job.status <> 'failed' or v_job.provider_message_id is not null
     or v_job.failure_category like '%unknown_outcome%'
     or v_job.failure_category = 'stale_processing_lock'
     or v_job.failure_category like 'provider_%' then
    return false;
  end if;
  update public.reminder_jobs
     set status = 'scheduled', scheduled_at = now(), max_attempts = attempt_count + 1, failure_category = null
   where id = p_job_id;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id)
  values (p_admin_id, 'reminder_job.retry', 'reminder_job', p_job_id::text);
  return true;
end;
$$;

create or replace function public.admin_metrics()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'users_total', (select count(*) from public.profiles),
    'users_onboarded', (select count(*) from public.profiles where onboarding_completed),
    'assignments_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
        select status, count(*) n from public.assignments group by status) s),
    'jobs_last_7d_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
        select status, count(*) n from public.reminder_jobs
         where scheduled_at > now() - interval '7 days' group by status) s),
    'jobs_due_backlog', (select count(*) from public.reminder_jobs
                          where status = 'scheduled' and scheduled_at < now() - interval '5 minutes'),
    'failures_by_category', (select coalesce(jsonb_object_agg(failure_category, n), '{}') from (
        select failure_category, count(*) n from public.reminder_jobs
         where status = 'failed' and updated_at > now() - interval '7 days' group by failure_category) s),
    'webhooks_last_24h', (select coalesce(jsonb_object_agg(processing_status, n), '{}') from (
        select processing_status, count(*) n from public.webhook_events
         where received_at > now() - interval '24 hours' group by processing_status) s),
    'active_suppressions', (select count(*) from public.phone_suppressions where lifted_at is null),
    'pending_reviews', (select count(*) from public.submissions where status = 'pending_review')
  )
$$;

create or replace function public.purge_operational_data()
returns void
language sql
set search_path = ''
as $$
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
  delete from public.webhook_events where received_at < now() - interval '90 days';
  delete from public.dev_outbox where created_at < now() - interval '14 days';
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
revoke select on public.webhook_events, public.phone_suppressions, public.rate_limit_hits,
  public.app_admins, public.admin_audit_log, public.system_settings, public.dev_outbox,
  public.phone_verifications, public.assignment_transitions
  from authenticated;
revoke select on public.contact_methods from authenticated;
grant select (id, user_id, contact_type, normalized_value, verified_at, is_active, created_at, updated_at)
  on public.contact_methods to authenticated;
grant select on public.profiles, public.notification_consents, public.notification_preferences,
  public.assignments, public.assignment_events, public.submissions, public.reminder_jobs,
  public.notification_events to authenticated;
grant update (display_name, time_zone) on public.profiles to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.contact_methods enable row level security;
alter table public.phone_verifications enable row level security;
alter table public.notification_consents enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_transitions enable row level security;
alter table public.assignment_events enable row level security;
alter table public.submissions enable row level security;
alter table public.reminder_jobs enable row level security;
alter table public.notification_events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.phone_suppressions enable row level security;
alter table public.rate_limit_hits enable row level security;
alter table public.app_admins enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.system_settings enable row level security;
alter table public.dev_outbox enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy contact_methods_select_own on public.contact_methods
  for select to authenticated using (user_id = (select auth.uid()));
create policy consents_select_own on public.notification_consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy assignments_select_own on public.assignments
  for select to authenticated using (user_id = (select auth.uid()));
create policy assignment_events_select_own on public.assignment_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy submissions_select_own on public.submissions
  for select to authenticated using (user_id = (select auth.uid()));
create policy reminder_jobs_select_own on public.reminder_jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_events_select_own on public.notification_events
  for select to authenticated using (user_id = (select auth.uid()));
-- All other tables: RLS enabled with no policies => service_role only.
