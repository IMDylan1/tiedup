-- TiedUp — Supabase schema.
-- Paste this whole file into the Supabase SQL Editor and hit Run.
-- Safe to re-run: everything is idempotent.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  username   text unique not null,
  balance    numeric(20,8) not null default 1.0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ transactions
create table if not exists public.transactions (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  delta         numeric(20,8) not null,
  label         text not null,
  balance_after numeric(20,8) not null,
  created_at    timestamptz not null default now()
);

create index if not exists transactions_user_time
  on public.transactions (user_id, created_at desc);

-- -------------------------------------------------------------------- bets
-- Open sports/props/parlay wagers, so they settle from any device.
create table if not exists public.bets (
  id         text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  data       jsonb not null,
  status     text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists bets_user_time
  on public.bets (user_id, created_at desc);

-- ----------------------------------------------------------- row security
alter table public.profiles     enable row level security;
alter table public.transactions enable row level security;
alter table public.bets         enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

-- Usernames are looked up when sending funds and shown on the leaderboard,
-- so the row is readable; balances are only writable through the RPCs below.
drop policy if exists "read all usernames" on public.profiles;
create policy "read all usernames" on public.profiles
  for select using (true);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "read own transactions" on public.transactions;
create policy "read own transactions" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "manage own bets" on public.bets;
create policy "manage own bets" on public.bets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------- profile on signup hook
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, balance)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      'player_' || substr(new.id::text, 1, 8)
    ),
    1.0
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------- balance mutation
-- Every bet, win and deposit goes through here so the balance and the ledger
-- can never drift apart, and so a negative balance is impossible.
create or replace function public.apply_delta(amount numeric, note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_balance numeric;
begin
  if uid is null then raise exception 'Not signed in'; end if;

  update public.profiles
     set balance = balance + amount
   where id = uid
  returning balance into new_balance;

  if new_balance is null then raise exception 'No profile'; end if;
  if new_balance < 0 then raise exception 'Insufficient balance'; end if;

  insert into public.transactions (user_id, delta, label, balance_after)
  values (uid, amount, note, new_balance);

  return new_balance;
end; $$;

-- --------------------------------------------------------------- transfers
-- Atomic send between players. Row locks prevent a double-spend from two tabs.
create or replace function public.transfer_funds(recipient text, amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  sender_name text;
  sender_balance numeric;
  recipient_balance numeric;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if amount <= 0 then raise exception 'Amount must be positive'; end if;

  select id into rid from public.profiles where lower(username) = lower(recipient);
  if rid is null then raise exception 'No player named %', recipient; end if;
  if rid = uid then raise exception 'You cannot send to yourself'; end if;

  select username, balance into sender_name, sender_balance
    from public.profiles where id = uid for update;
  if sender_balance < amount then raise exception 'Insufficient balance'; end if;

  update public.profiles set balance = balance - amount
   where id = uid returning balance into sender_balance;
  update public.profiles set balance = balance + amount
   where id = rid returning balance into recipient_balance;

  insert into public.transactions (user_id, delta, label, balance_after)
  values (uid, -amount, 'Sent to ' || recipient, sender_balance),
         (rid,  amount, 'Received from ' || sender_name, recipient_balance);

  return sender_balance;
end; $$;

-- ------------------------------------------------------------- leaderboard
create or replace view public.leaderboard as
  select username, balance from public.profiles order by balance desc limit 50;
