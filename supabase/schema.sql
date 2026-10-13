-- =====================================================================
-- SME CashFlow: database setup for Supabase
--
-- HOW TO USE: in Supabase, open "SQL Editor" -> "New query", paste this
-- whole file and click "Run". You only need to do this once.
-- It is safe to run again: it will not delete your data.
--
-- WHAT IT DOES
--   1. Creates the tables (profiles, invoices, expenses, uploads,
--      import_rows, team_invites).
--   2. Turns on Row Level Security (RLS), so every user can only ever
--      read and change THEIR OWN rows, even if someone edits the
--      JavaScript in their browser.
--   3. Adds small database functions for actions that must happen
--      all-or-nothing (mark an invoice paid, accept an import, clear data,
--      start the 1-month Premium free trial).
--
-- MONEY is stored as whole SEN in a bigint (RM 1 = 100 sen), so it is exact.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

-- One row per user, created automatically when someone signs up.
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  business_name    text   not null default '' check (char_length(business_name) <= 80),
  location         text   not null default '' check (char_length(location) <= 80),
  cash_sen         bigint not null default 0 check (cash_sen between -1000000000 and 1000000000),
  plan             text   not null default 'free' check (plan in ('free', 'basic', 'premium')),
  demo_data        boolean not null default false,
  -- The 1-month Premium free trial. Each account can use it only once.
  trial_started_at timestamptz,
  trial_ends_at    timestamptz,
  created_at       timestamptz not null default now()
);

-- Money customers owe the business.
create table if not exists public.invoices (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  customer   text   not null check (char_length(customer) between 1 and 80),
  amount_sen bigint not null check (amount_sen between 1 and 1000000000),
  due_date   date   not null check (due_date between '2000-01-01' and '2100-12-31'),
  status     text   not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_date  date,
  created_at timestamptz not null default now()
);

-- Money the business pays out. Can repeat every week or month.
create table if not exists public.expenses (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  description text   not null check (char_length(description) between 1 and 80),
  category    text   not null default 'Other' check (category in
                ('Rent', 'Stock / ingredients', 'Wages', 'Utilities',
                 'Loan / financing', 'Marketing', 'Other')),
  amount_sen  bigint not null check (amount_sen between 1 and 1000000000),
  due_date    date   not null check (due_date between '2000-01-01' and '2100-12-31'),
  recurrence  text   not null default 'none' check (recurrence in ('none', 'weekly', 'monthly')),
  created_at  timestamptz not null default now()
);

-- An uploaded CSV file. Its rows wait in import_rows until the user reviews them.
create table if not exists public.uploads (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  filename   text   not null check (char_length(filename) between 1 and 100),
  row_count  int    not null check (row_count between 1 and 200),
  status     text   not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id          bigint generated always as identity primary key,
  upload_id   bigint not null references public.uploads (id) on delete cascade,
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text   not null check (kind in ('income', 'expense')),
  description text   not null check (char_length(description) between 1 and 80),
  amount_sen  bigint not null check (amount_sen between 1 and 1000000000),
  row_date    date   not null check (row_date between '2000-01-01' and '2100-12-31'),
  status      text   not null default 'pending' check (status in ('pending', 'accepted', 'rejected'))
);

-- Premium "team access" (a prototype: no email is sent).
create table if not exists public.team_invites (
  id         bigint generated always as identity primary key,
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  name       text   not null check (char_length(name) between 1 and 60),
  role       text   not null default 'viewer' check (role in ('viewer', 'editor')),
  code       text   not null unique check (char_length(code) between 6 and 40),
  created_at timestamptz not null default now()
);

create index if not exists invoices_user_idx     on public.invoices (user_id);
create index if not exists expenses_user_idx     on public.expenses (user_id);
create index if not exists uploads_user_idx      on public.uploads (user_id);
create index if not exists import_rows_upload_idx on public.import_rows (upload_id);
create index if not exists team_invites_user_idx on public.team_invites (user_id);


-- ---------------------------------------------------------------------
-- 2. Row Level Security: each user sees and changes only their own rows
-- ---------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.invoices     enable row level security;
alter table public.expenses     enable row level security;
alter table public.uploads      enable row level security;
alter table public.import_rows  enable row level security;
alter table public.team_invites enable row level security;

drop policy if exists "own profile: read"   on public.profiles;
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: read"   on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own invoices" on public.invoices;
create policy "own invoices" on public.invoices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own uploads" on public.uploads;
create policy "own uploads" on public.uploads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- An import row must belong to you AND to one of your own uploads.
drop policy if exists "own import rows" on public.import_rows;
create policy "own import rows" on public.import_rows for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.uploads u
                where u.id = upload_id and u.user_id = (select auth.uid()))
  );

drop policy if exists "own team invites" on public.team_invites;
create policy "own team invites" on public.team_invites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Logged-in users may use the tables (Row Level Security above still limits
-- them to their own rows). Newer Supabase projects may not grant this by default.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.invoices, public.expenses, public.uploads, public.import_rows, public.team_invites
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Logged-out visitors get nothing at all.
revoke all on public.profiles, public.invoices, public.expenses, public.uploads,
              public.import_rows, public.team_invites from anon;

-- Profiles: users may only change these columns. The trial dates can only be
-- set by the start_premium_trial() function below, so nobody can give
-- themselves a second free trial by editing the browser code.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (business_name, location, cash_sen, plan, demo_data) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- 3. Create a profile automatically when someone signs up
--    (the sign-up form can ask for a plan: free, basic, or premium = trial)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  wanted_plan text := coalesce(new.raw_user_meta_data ->> 'plan', 'free');
  wanted_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 80);
begin
  if wanted_plan not in ('free', 'basic', 'premium') then
    wanted_plan := 'free';
  end if;

  insert into public.profiles (id, business_name, plan, trial_started_at, trial_ends_at)
  values (
    new.id,
    wanted_name,
    wanted_plan,
    case when wanted_plan = 'premium' then now() end,
    case when wanted_plan = 'premium' then now() + interval '30 days' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 4. Actions (called from the app with supabase.rpc('name', {...}))
-- ---------------------------------------------------------------------

-- Start the 1-month (30-day) Premium free trial. Only once per account.
create or replace function public.start_premium_trial()
returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  ends timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Please log in first.';
  end if;

  update public.profiles
     set plan = 'premium',
         trial_started_at = now(),
         trial_ends_at = now() + interval '30 days'
   where id = auth.uid() and trial_started_at is null
  returning trial_ends_at into ends;

  if ends is null then
    raise exception 'You have already used your free trial.';
  end if;
  return ends;
end;
$$;

-- Mark an invoice as paid and add its amount to current cash, in one step.
-- "status = 'unpaid'" means a double-click can never add the cash twice.
create or replace function public.mark_invoice_paid(p_invoice_id bigint, p_paid_date date)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  paid_amount bigint;
begin
  update public.invoices
     set status = 'paid', paid_date = p_paid_date
   where id = p_invoice_id and user_id = auth.uid() and status = 'unpaid'
  returning amount_sen into paid_amount;

  if paid_amount is null then
    return 0;  -- not yours, not found, or already paid
  end if;

  update public.profiles
     set cash_sen = cash_sen + paid_amount
   where id = auth.uid();
  return paid_amount;
end;
$$;

-- Accept the ticked rows of an upload. Ticked rows become invoices/expenses;
-- the rest are marked rejected. Returns how many were added.
create or replace function public.accept_import(p_upload_id bigint, p_row_ids bigint[])
returns int
language plpgsql
set search_path = ''
as $$
declare
  added int := 0;
begin
  if not exists (select 1 from public.uploads
                 where id = p_upload_id and user_id = auth.uid() and status = 'pending') then
    raise exception 'That upload was not found or has already been reviewed.';
  end if;

  insert into public.invoices (user_id, customer, amount_sen, due_date)
  select auth.uid(), description, amount_sen, row_date
    from public.import_rows
   where upload_id = p_upload_id and user_id = auth.uid() and status = 'pending'
     and kind = 'income' and id = any (coalesce(p_row_ids, '{}'));

  insert into public.expenses (user_id, description, category, amount_sen, due_date, recurrence)
  select auth.uid(), description, 'Other', amount_sen, row_date, 'none'
    from public.import_rows
   where upload_id = p_upload_id and user_id = auth.uid() and status = 'pending'
     and kind = 'expense' and id = any (coalesce(p_row_ids, '{}'));

  update public.import_rows
     set status = case when id = any (coalesce(p_row_ids, '{}')) then 'accepted' else 'rejected' end
   where upload_id = p_upload_id and user_id = auth.uid() and status = 'pending';

  select count(*) into added from public.import_rows
   where upload_id = p_upload_id and user_id = auth.uid() and status = 'accepted';

  update public.uploads set status = 'done'
   where id = p_upload_id and user_id = auth.uid();
  return added;
end;
$$;

-- Delete all of the user's invoices, expenses and uploads, and set cash to RM0.
create or replace function public.clear_my_data()
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.invoices where user_id = auth.uid();
  delete from public.expenses where user_id = auth.uid();
  delete from public.uploads  where user_id = auth.uid();  -- also removes import rows
  update public.profiles set cash_sen = 0, demo_data = false where id = auth.uid();
end;
$$;

-- At most 10 prepared team invites per account.
create or replace function public.limit_team_invites()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.team_invites where user_id = new.user_id) >= 10 then
    raise exception 'You can prepare up to 10 invites.';
  end if;
  return new;
end;
$$;

drop trigger if exists team_invites_limit on public.team_invites;
create trigger team_invites_limit
  before insert on public.team_invites
  for each row execute function public.limit_team_invites();

-- Only logged-in users may call the actions.
revoke execute on function public.start_premium_trial()              from public, anon;
revoke execute on function public.mark_invoice_paid(bigint, date)    from public, anon;
revoke execute on function public.accept_import(bigint, bigint[])    from public, anon;
revoke execute on function public.clear_my_data()                    from public, anon;
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.limit_team_invites()               from public, anon, authenticated;
grant  execute on function public.start_premium_trial()              to authenticated;
grant  execute on function public.mark_invoice_paid(bigint, date)    to authenticated;
grant  execute on function public.accept_import(bigint, bigint[])    to authenticated;
grant  execute on function public.clear_my_data()                    to authenticated;
