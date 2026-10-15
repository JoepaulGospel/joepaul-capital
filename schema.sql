-- ============================================================
-- JOEPAUL CAPITAL TERMINAL — Supabase setup script
-- Run ONCE in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.current_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_deposited numeric(14,2) not null default 3100,
  realized_profit numeric(14,2) not null default 0,
  prop_payouts numeric(14,2) not null default 0,
  current_equity numeric(14,2) not null default 3100,
  peak_equity numeric(14,2) not null default 3100,
  target_amount numeric(16,2) not null default 1800000,
  target_date date,
  reporting_week text,
  weekly_notes text,
  count_deposits_toward_goal boolean not null default false,
  starting_values_acknowledged boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reporting_week text not null,
  total_deposited numeric(14,2) not null default 0,
  realized_profit numeric(14,2) not null default 0,
  prop_payouts numeric(14,2) not null default 0,
  current_equity numeric(14,2) not null default 0,
  peak_equity numeric(14,2) not null default 0,
  target_amount numeric(16,2) not null default 1800000,
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  category text not null default 'important',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.current_state enable row level security;
alter table public.weekly_updates enable row level security;
alter table public.events enable row level security;
alter table public.notes enable row level security;

create policy "own profile"  on public.profiles       for all using (auth.uid() = id)       with check (auth.uid() = id);
create policy "own state"    on public.current_state  for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own updates"  on public.weekly_updates for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own events"   on public.events         for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);
create policy "own notes"    on public.notes          for all using (auth.uid() = user_id)  with check (auth.uid() = user_id);

-- ---------- auto-provision new users ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.current_state (user_id, target_date)
  values (new.id, (current_date + interval '5 years')::date);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- server functions (atomic, security definer) ----------
-- Save a weekly update: append to the ledger AND sync current_state in one transaction.
create or replace function public.save_weekly_update(
  p_reporting_week text, p_total_deposited numeric, p_realized_profit numeric,
  p_prop_payouts numeric, p_current_equity numeric, p_peak_equity numeric,
  p_target_amount numeric, p_target_date date, p_notes text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.weekly_updates
    (user_id, reporting_week, total_deposited, realized_profit, prop_payouts,
     current_equity, peak_equity, target_amount, target_date, notes)
  values
    (auth.uid(), p_reporting_week, p_total_deposited, p_realized_profit, p_prop_payouts,
     p_current_equity, p_peak_equity, p_target_amount, p_target_date, p_notes)
  returning id into v_id;

  insert into public.current_state
    (user_id, total_deposited, realized_profit, prop_payouts, current_equity, peak_equity,
     target_amount, target_date, reporting_week, weekly_notes, updated_at)
  values
    (auth.uid(), p_total_deposited, p_realized_profit, p_prop_payouts, p_current_equity, p_peak_equity,
     p_target_amount, p_target_date, p_reporting_week, p_notes, now())
  on conflict (user_id) do update set
    total_deposited = excluded.total_deposited,
    realized_profit = excluded.realized_profit,
    prop_payouts    = excluded.prop_payouts,
    current_equity  = excluded.current_equity,
    peak_equity     = excluded.peak_equity,
    target_amount   = excluded.target_amount,
    target_date     = excluded.target_date,
    reporting_week  = excluded.reporting_week,
    weekly_notes    = excluded.weekly_notes,
    updated_at      = now();
  return v_id;
end $$;

-- Re-sync current_state from the newest ledger entry (used after corrections/deletions).
create or replace function public.resync_current_state()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.current_state cs set
    total_deposited = wu.total_deposited,
    realized_profit = wu.realized_profit,
    prop_payouts    = wu.prop_payouts,
    current_equity  = wu.current_equity,
    peak_equity     = wu.peak_equity,
    target_amount   = wu.target_amount,
    target_date     = wu.target_date,
    reporting_week  = wu.reporting_week,
    weekly_notes    = wu.notes,
    updated_at      = now()
  from (
    select * from public.weekly_updates
    where user_id = auth.uid()
    order by created_at desc limit 1
  ) wu
  where cs.user_id = auth.uid();
end $$;

-- Correct a historical entry, then re-sync current_state from the newest entry.
create or replace function public.correct_weekly_update(
  p_id uuid, p_reporting_week text, p_total_deposited numeric, p_realized_profit numeric,
  p_prop_payouts numeric, p_current_equity numeric, p_peak_equity numeric,
  p_target_amount numeric, p_target_date date, p_notes text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.weekly_updates set
    reporting_week  = p_reporting_week,
    total_deposited = p_total_deposited,
    realized_profit = p_realized_profit,
    prop_payouts    = p_prop_payouts,
    current_equity  = p_current_equity,
    peak_equity     = p_peak_equity,
    target_amount   = p_target_amount,
    target_date     = p_target_date,
    notes           = p_notes,
    updated_at      = now()
  where id = p_id and user_id = auth.uid();
  perform public.resync_current_state();
end $$;

create or replace function public.update_preferences(
  p_target_amount numeric, p_target_date date, p_count_deposits boolean
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.current_state set
    target_amount = p_target_amount,
    target_date = p_target_date,
    count_deposits_toward_goal = p_count_deposits,
    updated_at = now()
  where user_id = auth.uid();
end $$;

create or replace function public.acknowledge_starting_values()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.current_state set starting_values_acknowledged = true
  where user_id = auth.uid();
end $$;

-- ---------- lock down: only logged-in users may call these ----------
revoke execute on function public.save_weekly_update(text,numeric,numeric,numeric,numeric,numeric,numeric,date,text) from anon;
revoke execute on function public.correct_weekly_update(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,date,text) from anon;
revoke execute on function public.resync_current_state() from anon;
revoke execute on function public.update_preferences(numeric,date,boolean) from anon;
revoke execute on function public.acknowledge_starting_values() from anon;
