-- =====================================================================
-- SME CashFlow v2.0: Admin Control Centre, live event log and AI logging
--
-- HOW TO USE: run supabase/schema.sql first (you already did). Then, in
-- Supabase, open "SQL Editor" -> "New query", paste this whole file and
-- click "Run". It is safe to run again: it will not delete your data.
--
-- WHAT IT ADDS
--   1. admins       - who may open the Admin Control Centre (admin.html).
--   2. app_events   - a live log: sign-ups, logins, plan changes, invoices,
--                     expenses, uploads, AI requests. Written by the
--                     database itself (triggers), so users can't fake it.
--   3. Admin-only functions that the Control Centre calls. Each one checks
--      "is this person an admin?" inside the database, so editing the
--      JavaScript can't get anyone else in.
--   4. health_ping() and log_ai_request() for every logged-in user.
--
-- LAST STEP (only once): make yourself admin. Change the email on the
-- very last line of this file to the email you log in with, then Run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Admins
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- No policies on purpose: nobody can read or change this table from the app.
-- Only you (in the SQL Editor) can add an admin.
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Stops a function unless the caller is an admin.
create or replace function public.require_admin()
returns void
language plpgsql stable
security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. The live event log
-- ---------------------------------------------------------------------
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references auth.users (id) on delete set null,
  event      text not null check (char_length(event) between 1 and 40),
  detail     text not null default '' check (char_length(detail) <= 200),
  level      text not null default 'info' check (level in ('info', 'warn', 'error'))
);
create index if not exists app_events_created_idx on public.app_events (created_at desc);
alter table public.app_events enable row level security;
-- No policies: users can't read or write the log directly. Only the
-- triggers and functions below write to it, and only admins read it.
revoke all on public.app_events from anon, authenticated;

-- "RM2,400" from 240000 sen.
create or replace function public.rm(sen bigint)
returns text
language sql immutable
set search_path = ''
as $$
  select case when sen < 0 then '-' else '' end || 'RM'
         || regexp_replace(to_char(abs(sen) / 100.0, 'FM999,999,999,990.00'), '\.00$', '');
$$;

-- Write one line to the log. Never lets a logging problem break the app.
create or replace function public.log_event(p_user uuid, p_event text, p_detail text, p_level text default 'info')
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.app_events (user_id, event, detail, level)
  values (p_user, left(p_event, 40), left(coalesce(p_detail, ''), 200), p_level);
exception when others then
  null;
end;
$$;

-- Sign-ups and profile changes (plan, trial, demo data)
create or replace function public.log_profile_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.id, 'signup',
      'New account on ' || new.plan || case when new.trial_started_at is not null then ' (30-day free trial)' else '' end);
    return new;
  end if;
  if new.plan is distinct from old.plan then
    perform public.log_event(new.id, 'plan_change', old.plan || ' -> ' || new.plan);
  end if;
  if old.trial_started_at is null and new.trial_started_at is not null and tg_op = 'UPDATE' then
    perform public.log_event(new.id, 'trial_started', 'Premium free trial until ' || to_char(new.trial_ends_at at time zone 'Asia/Kuala_Lumpur', 'DD Mon YYYY'));
  end if;
  if new.demo_data and not old.demo_data then
    perform public.log_event(new.id, 'demo_loaded', 'Demo business loaded');
  end if;
  return new;
exception when others then
  return new;  -- logging must never block the user's action
end;
$$;

drop trigger if exists log_profiles on public.profiles;
create trigger log_profiles
  after insert or update on public.profiles
  for each row execute function public.log_profile_change();

-- Logins (Supabase updates last_sign_in_at on every login)
create or replace function public.log_login()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.log_event(new.id, 'login', 'Logged in');
  return new;
exception when others then
  return new;  -- a login must never fail because of the log
end;
$$;

drop trigger if exists log_logins on auth.users;
create trigger log_logins
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.log_login();

-- New invoices / expenses: one line per save (the demo adds several at once)
create or replace function public.log_rows_added()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  noun text := case tg_table_name when 'invoices' then 'invoice' else 'expense' end;
begin
  for r in select user_id, count(*) as n, sum(amount_sen)::bigint as total from new_rows group by user_id loop
    perform public.log_event(r.user_id, noun || '_added',
      r.n || ' ' || noun || case when r.n = 1 then '' else 's' end || ' added, ' || public.rm(r.total));
  end loop;
  return null;
exception when others then
  return null;  -- logging must never block the user's action
end;
$$;

drop trigger if exists log_invoices_added on public.invoices;
create trigger log_invoices_added
  after insert on public.invoices
  referencing new table as new_rows
  for each statement execute function public.log_rows_added();

drop trigger if exists log_expenses_added on public.expenses;
create trigger log_expenses_added
  after insert on public.expenses
  referencing new table as new_rows
  for each statement execute function public.log_rows_added();

-- Invoice marked paid
create or replace function public.log_invoice_paid()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.status = 'paid' and old.status = 'unpaid' then
    perform public.log_event(new.user_id, 'invoice_paid', 'Invoice paid, ' || public.rm(new.amount_sen) || ' added to cash');
  end if;
  return new;
exception when others then
  return new;  -- logging must never block the user's action
end;
$$;

drop trigger if exists log_invoice_paid on public.invoices;
create trigger log_invoice_paid
  after update of status on public.invoices
  for each row execute function public.log_invoice_paid();

-- CSV uploads and reviews
create or replace function public.log_upload()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event(new.user_id, 'csv_uploaded', 'CSV uploaded, ' || new.row_count || ' rows waiting for review');
  elsif new.status = 'done' and old.status = 'pending' then
    perform public.log_event(new.user_id, 'csv_reviewed', 'CSV reviewed and confirmed by the user');
  end if;
  return new;
exception when others then
  return new;  -- logging must never block the user's action
end;
$$;

drop trigger if exists log_uploads on public.uploads;
create trigger log_uploads
  after insert or update of status on public.uploads
  for each row execute function public.log_upload();

-- Team invites
create or replace function public.log_team_invite()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.log_event(new.user_id, 'team_invite', 'Team invite prepared (' || new.role || ')');
  return new;
exception when others then
  return new;  -- logging must never block the user's action
end;
$$;

drop trigger if exists log_team_invites on public.team_invites;
create trigger log_team_invites
  after insert on public.team_invites
  for each row execute function public.log_team_invite();


-- ---------------------------------------------------------------------
-- 3. For every logged-in user
-- ---------------------------------------------------------------------

-- "Is the database awake?" Used by the health checks.
create or replace function public.health_ping()
returns jsonb
language sql stable
security definer set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'postgres', current_setting('server_version'),
    'timezone', current_setting('TimeZone'));
$$;

-- The app reports each AI request (ok, or "fallback" when the backup rules
-- were used). Only the result and timing are saved, never the advice text.
create or replace function public.log_ai_request(p_status text, p_ms int, p_model text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;
  if p_status not in ('ok', 'fallback') then
    raise exception 'Unknown AI status.';
  end if;
  perform public.log_event(auth.uid(),
    case when p_status = 'ok' then 'ai_request' else 'ai_fallback' end,
    case when p_status = 'ok'
      then 'AI advice from ' || left(coalesce(p_model, 'AI'), 40) || ' in ' || greatest(coalesce(p_ms, 0), 0) || ' ms'
      else 'AI unavailable after ' || greatest(coalesce(p_ms, 0), 0) || ' ms, built-in rules used instead' end,
    case when p_status = 'ok' then 'info' else 'warn' end);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. Admin-only functions (the Control Centre)
-- ---------------------------------------------------------------------

-- Headline numbers
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable
security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'users_total',      (select count(*) from public.profiles),
    'users_7d',         (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'active_24h',       (select count(*) from auth.users where last_sign_in_at > now() - interval '24 hours'),
    'plans',            (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb)
                           from (select plan, count(*) as n from public.profiles group by plan) p),
    'trials_active',    (select count(*) from public.profiles where plan = 'premium' and trial_ends_at > now()),
    'trials_used',      (select count(*) from public.profiles where trial_started_at is not null),
    'onboarding',       (select count(*) from auth.users where raw_user_meta_data ->> 'onboarding' = 'true'),
    'mrr_sen',          (select coalesce(sum(case when plan = 'basic' then 1990
                                                  when plan = 'premium' and coalesce(trial_ends_at, now()) <= now() then 3990
                                                  else 0 end), 0)
                           from public.profiles),
    'invoices',         (select count(*) from public.invoices),
    'invoices_unpaid',  (select count(*) from public.invoices where status = 'unpaid'),
    'expenses',         (select count(*) from public.expenses),
    'uploads',          (select count(*) from public.uploads),
    'team_invites',     (select count(*) from public.team_invites),
    'events_24h',       (select count(*) from public.app_events where created_at > now() - interval '24 hours'),
    'errors_24h',       (select count(*) from public.app_events where level <> 'info' and created_at > now() - interval '24 hours'),
    'ai_ok_24h',        (select count(*) from public.app_events where event = 'ai_request'  and created_at > now() - interval '24 hours'),
    'ai_fallback_24h',  (select count(*) from public.app_events where event = 'ai_fallback' and created_at > now() - interval '24 hours'),
    'logins_24h',       (select count(*) from public.app_events where event = 'login' and created_at > now() - interval '24 hours'),
    'db_size_bytes',    pg_database_size(current_database()),
    'postgres',         current_setting('server_version'),
    'server_time',      now(),
    'timezone',         current_setting('TimeZone'),
    'admins',           (select count(*) from public.admins)
  ) into result;
  return result;
end;
$$;

-- The user list (newest first)
create or replace function public.admin_users()
returns table (
  email text, business_name text, plan text, on_trial boolean, trial_ends_at timestamptz,
  onboarding boolean, demo_data boolean, invoices bigint, expenses bigint,
  created_at timestamptz, last_sign_in_at timestamptz
)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select u.email::text, p.business_name, p.plan,
         (p.plan = 'premium' and p.trial_ends_at > now()),
         p.trial_ends_at,
         coalesce(u.raw_user_meta_data ->> 'onboarding', 'false') = 'true',
         p.demo_data,
         (select count(*) from public.invoices i where i.user_id = p.id),
         (select count(*) from public.expenses e where e.user_id = p.id),
         p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
   order by p.created_at desc
   limit 200;
end;
$$;

-- The live log: lines newer than p_after_id (0 = the latest ones)
create or replace function public.admin_events(p_after_id bigint default 0, p_limit int default 50)
returns table (id bigint, created_at timestamptz, event text, detail text, level text, email text)
language plpgsql stable
security definer set search_path = ''
as $$
begin
  perform public.require_admin();
  return query
  select e.id, e.created_at, e.event, e.detail, e.level, coalesce(u.email::text, '')
    from public.app_events e
    left join auth.users u on u.id = e.user_id
   where e.id > coalesce(p_after_id, 0)
   order by e.id desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Security status, read from the database itself
create or replace function public.admin_security()
returns jsonb
language plpgsql stable
security definer set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'tables', (select jsonb_agg(jsonb_build_object(
                  'name', c.relname,
                  'rls', c.relrowsecurity,
                  'policies', (select count(*) from pg_catalog.pg_policies p
                                where p.schemaname = 'public' and p.tablename = c.relname),
                  'anon_access', has_table_privilege('anon', c.oid, 'select'))
                order by c.relname)
                 from pg_catalog.pg_class c
                 join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'),
    'check_rules', (select count(*) from pg_catalog.pg_constraint k
                      join pg_catalog.pg_namespace n on n.oid = k.connamespace
                     where n.nspname = 'public' and k.contype = 'c'),
    'admins', (select count(*) from public.admins),
    'definer_functions', (select count(*) from pg_catalog.pg_proc f
                            join pg_catalog.pg_namespace n on n.oid = f.pronamespace
                           where n.nspname = 'public' and f.prosecdef));
end;
$$;

-- The backend at a glance: tables (rows, size), functions, triggers, indexes
create or replace function public.admin_backend()
returns jsonb
language plpgsql stable
security definer set search_path = ''
as $$
declare
  t record;
  tables jsonb := '[]'::jsonb;
  n bigint;
begin
  perform public.require_admin();
  for t in select c.relname, c.oid from pg_catalog.pg_class c
             join pg_catalog.pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind = 'r' order by c.relname loop
    execute format('select count(*) from public.%I', t.relname) into n;
    tables := tables || jsonb_build_object('name', t.relname, 'rows', n,
      'size_bytes', pg_total_relation_size(t.oid),
      'columns', (select count(*) from pg_catalog.pg_attribute a where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped));
  end loop;
  return jsonb_build_object(
    'tables', tables,
    'functions', (select jsonb_agg(jsonb_build_object(
                     'name', f.proname,
                     'args', pg_catalog.pg_get_function_identity_arguments(f.oid),
                     'definer', f.prosecdef) order by f.proname)
                    from pg_catalog.pg_proc f
                    join pg_catalog.pg_namespace s on s.oid = f.pronamespace
                   where s.nspname = 'public'),
    'triggers', (select jsonb_agg(jsonb_build_object(
                    'name', g.tgname,
                    'table', s.nspname || '.' || c.relname,
                    'function', p.proname) order by s.nspname, c.relname, g.tgname)
                   from pg_catalog.pg_trigger g
                   join pg_catalog.pg_class c on c.oid = g.tgrelid
                   join pg_catalog.pg_namespace s on s.oid = c.relnamespace
                   join pg_catalog.pg_proc p on p.oid = g.tgfoid
                  where not g.tgisinternal and p.pronamespace = 'public'::regnamespace),
    'indexes', (select count(*) from pg_catalog.pg_indexes where schemaname = 'public'),
    'db_size_bytes', pg_database_size(current_database()));
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Who may call what
-- ---------------------------------------------------------------------
revoke execute on function public.is_admin()                        from public, anon;
revoke execute on function public.require_admin()                   from public, anon, authenticated;
revoke execute on function public.rm(bigint)                        from public, anon;
revoke execute on function public.log_event(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.log_profile_change()              from public, anon, authenticated;
revoke execute on function public.log_login()                       from public, anon, authenticated;
revoke execute on function public.log_rows_added()                  from public, anon, authenticated;
revoke execute on function public.log_invoice_paid()                from public, anon, authenticated;
revoke execute on function public.log_upload()                      from public, anon, authenticated;
revoke execute on function public.log_team_invite()                 from public, anon, authenticated;
revoke execute on function public.health_ping()                     from public, anon;
revoke execute on function public.log_ai_request(text, int, text)   from public, anon;
revoke execute on function public.admin_overview()                  from public, anon;
revoke execute on function public.admin_users()                     from public, anon;
revoke execute on function public.admin_events(bigint, int)         from public, anon;
revoke execute on function public.admin_security()                  from public, anon;
revoke execute on function public.admin_backend()                   from public, anon;

grant execute on function public.is_admin()                      to authenticated;
grant execute on function public.rm(bigint)                      to authenticated;
grant execute on function public.health_ping()                   to authenticated;
grant execute on function public.log_ai_request(text, int, text) to authenticated;
-- These check "is this person an admin?" themselves (require_admin above).
grant execute on function public.admin_overview()                to authenticated;
grant execute on function public.admin_users()                   to authenticated;
grant execute on function public.admin_events(bigint, int)       to authenticated;
grant execute on function public.admin_security()                to authenticated;
grant execute on function public.admin_backend()                 to authenticated;


-- ---------------------------------------------------------------------
-- 6. Make yourself admin: put YOUR login email between the quotes.
--    (Add more admins later by running just this line with their email.)
-- ---------------------------------------------------------------------
insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('PUT-YOUR-EMAIL-HERE')
on conflict (user_id) do nothing;
