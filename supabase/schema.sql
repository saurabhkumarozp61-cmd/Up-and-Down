-- ============================================================================
-- CAMPUSODDS: SOCIAL PREDICTION MARKET FOR INDIAN GEN-Z & COLLEGE COMMUNITIES
-- Complete Supabase PostgreSQL Schema, Atomic RPCs, Triggers & Seed Data
-- Virtual Demo Coins Only — Zero Real-Money / Zero Web3
-- ============================================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  username text unique not null,
  college_name text not null default 'IIT Bombay',
  coin_balance integer not null default 1000 check (coin_balance >= 0),
  role text not null default 'user' check (role in ('user', 'creator', 'admin')),
  referred_by text,
  last_daily_claim timestamptz,
  wins_count integer not null default 0,
  resolved_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. MARKETS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in (
    'Cricket & Sports',
    'Campus Gossip',
    'Pop-Culture & Creators',
    'Tech & Finance'
  )),
  resolution_rules text not null default 'Resolved based on official public announcement or verified campus notice.',
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  outcome text check (outcome in ('YES', 'NO')),
  yes_pool numeric(14, 2) not null default 5000 check (yes_pool > 0),
  no_pool numeric(14, 2) not null default 5000 check (no_pool > 0),
  total_volume integer not null default 0,
  closes_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  creator_username text not null default 'campus_oracle',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. POSITIONS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  side text not null check (side in ('YES', 'NO')),
  shares numeric(14, 2) not null check (shares > 0),
  invested_coins integer not null check (invested_coins > 0),
  entry_price integer not null check (entry_price between 1 and 99),
  settled boolean not null default false,
  payout_coins integer default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. TRANSACTIONS TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid references public.markets(id) on delete set null,
  type text not null check (type in ('SIGNUP_BONUS', 'REFERRAL_BONUS', 'DAILY_REFILL', 'TRADE_BUY', 'MARKET_PAYOUT', 'MARKET_REFUND')),
  amount integer not null,
  description text not null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. ATOMIC RPC: place_trade
-- Dynamically calculates share price:
--   YES Price = clamp(round((yes_pool / (yes_pool + no_pool)) * 100), 1, 99)
--   NO Price  = 100 - YES Price
--   shares    = (p_amount / price) * 100
-- Deducts coins, shifts pool odds, records position & transaction atomically.
-- ----------------------------------------------------------------------------
create or replace function public.place_trade(
  p_user_id uuid,
  p_market_id uuid,
  p_side text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user public.profiles%rowtype;
  v_market public.markets%rowtype;
  v_yes_price integer;
  v_no_price integer;
  v_exec_price integer;
  v_shares numeric(14, 2);
  v_potential_payout integer;
  v_new_yes_pool numeric(14, 2);
  v_new_no_pool numeric(14, 2);
  v_new_yes_prob integer;
  v_position_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Trade amount must be greater than 0 coins';
  end if;

  if p_side not in ('YES', 'NO') then
    raise exception 'Invalid side: must be YES or NO';
  end if;

  -- Lock user profile row for atomic balance update
  select * into v_user
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if v_user.coin_balance < p_amount then
    raise exception 'Insufficient coin balance (Available: % Coins)', v_user.coin_balance;
  end if;

  -- Lock market row for atomic pool update
  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'Market not found';
  end if;

  if v_market.status <> 'open' then
    raise exception 'Market is no longer open for trading';
  end if;

  if v_market.closes_at <= now() then
    raise exception 'Market has already closed for trading';
  end if;

  -- Calculate current implied probability prices (clamped between 1 and 99)
  v_yes_price := greatest(1, least(99, round((v_market.yes_pool / (v_market.yes_pool + v_market.no_pool)) * 100)::integer));
  v_no_price := 100 - v_yes_price;

  if p_side = 'YES' then
    v_exec_price := v_yes_price;
    v_new_yes_pool := v_market.yes_pool + p_amount;
    v_new_no_pool := v_market.no_pool;
  else
    v_exec_price := v_no_price;
    v_new_yes_pool := v_market.yes_pool;
    v_new_no_pool := v_market.no_pool + p_amount;
  end if;

  -- Calculate exact shares received: shares = (amount / current_price) * 100
  -- Note: Each winning share pays out 100 Coins, so total payout is round(shares) coins
  -- Or equivalently if 1 share pays 100 coins, shares = amount / current_price, and payout = shares * 100.
  -- Following specification: shares = (amount / current_price) * 100 (representing share units where 1 unit = 1 coin payout, or shares count).
  v_shares := round(((p_amount::numeric / v_exec_price::numeric) * 100.0), 2);
  v_potential_payout := round(v_shares)::integer;

  -- Deduct coins from user
  update public.profiles
  set coin_balance = coin_balance - p_amount
  where id = p_user_id;

  -- Update market pool & volume
  update public.markets
  set
    yes_pool = v_new_yes_pool,
    no_pool = v_new_no_pool,
    total_volume = total_volume + p_amount
  where id = p_market_id;

  -- Insert position
  insert into public.positions (
    user_id, market_id, side, shares, invested_coins, entry_price
  ) values (
    p_user_id, p_market_id, p_side, v_shares, p_amount, v_exec_price
  ) returning id into v_position_id;

  -- Record transaction
  insert into public.transactions (
    user_id, market_id, type, amount, description
  ) values (
    p_user_id,
    p_market_id,
    'TRADE_BUY',
    -p_amount,
    format('Bought %s on "%s" at %s Coins', p_side, left(v_market.title, 48), v_exec_price)
  );

  v_new_yes_prob := greatest(1, least(99, round((v_new_yes_pool / (v_new_yes_pool + v_new_no_pool)) * 100)::integer));

  return jsonb_build_object(
    'position_id', v_position_id,
    'side', p_side,
    'invested_coins', p_amount,
    'entry_price', v_exec_price,
    'shares', v_shares,
    'potential_payout', v_potential_payout,
    'new_coin_balance', v_user.coin_balance - p_amount,
    'new_yes_probability', v_new_yes_prob
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. ATOMIC RPC: resolve_market
-- Resolves a market ('YES', 'NO', or 'CANCEL') and distributes payouts
-- directly into winning shareholders' coin_balance.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_market(
  p_admin_id uuid,
  p_market_id uuid,
  p_resolution text -- 'YES', 'NO', or 'CANCEL'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_admin public.profiles%rowtype;
  v_market public.markets%rowtype;
  v_pos record;
  v_payout integer;
  v_total_paid integer := 0;
  v_winners_count integer := 0;
begin
  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'admin' then
    raise exception 'Only admins can resolve or cancel markets';
  end if;

  select * into v_market from public.markets where id = p_market_id for update;
  if not found then
    raise exception 'Market not found';
  end if;

  if v_market.status <> 'open' then
    raise exception 'Market is already %', v_market.status;
  end if;

  if p_resolution = 'CANCEL' then
    -- Refund all invested coins
    for v_pos in
      select * from public.positions where market_id = p_market_id and settled = false
    loop
      update public.profiles
      set coin_balance = coin_balance + v_pos.invested_coins
      where id = v_pos.user_id;

      update public.positions
      set settled = true, payout_coins = v_pos.invested_coins
      where id = v_pos.id;

      insert into public.transactions (user_id, market_id, type, amount, description)
      values (
        v_pos.user_id,
        p_market_id,
        'MARKET_REFUND',
        v_pos.invested_coins,
        format('Refunded %s Coins on cancelled market "%s"', v_pos.invested_coins, left(v_market.title, 48))
      );

      v_total_paid := v_total_paid + v_pos.invested_coins;
    end loop;

    update public.markets
    set status = 'cancelled', outcome = null
    where id = p_market_id;

    return jsonb_build_object('status', 'cancelled', 'total_refunded', v_total_paid);
  end if;

  if p_resolution not in ('YES', 'NO') then
    raise exception 'Invalid resolution outcome: must be YES, NO, or CANCEL';
  end if;

  -- Pay out winning shareholders and update win/resolved stats
  for v_pos in
    select * from public.positions where market_id = p_market_id and settled = false
  loop
    if v_pos.side = p_resolution then
      -- Winning share pays out 100 Coins per full share (or round(shares) since shares = (amount/price)*100)
      v_payout := round(v_pos.shares)::integer;
      v_total_paid := v_total_paid + v_payout;
      v_winners_count := v_winners_count + 1;

      update public.profiles
      set
        coin_balance = coin_balance + v_payout,
        wins_count = wins_count + 1,
        resolved_count = resolved_count + 1
      where id = v_pos.user_id;

      update public.positions
      set settled = true, payout_coins = v_payout
      where id = v_pos.id;

      insert into public.transactions (user_id, market_id, type, amount, description)
      values (
        v_pos.user_id,
        p_market_id,
        'MARKET_PAYOUT',
        v_payout,
        format('Won %s Coins on "%s" (%s)', v_payout, left(v_market.title, 48), p_resolution)
      );
    else
      update public.profiles
      set resolved_count = resolved_count + 1
      where id = v_pos.user_id;

      update public.positions
      set settled = true, payout_coins = 0
      where id = v_pos.id;
    end if;
  end loop;

  update public.markets
  set status = 'resolved', outcome = p_resolution
  where id = p_market_id;

  return jsonb_build_object(
    'status', 'resolved',
    'outcome', p_resolution,
    'winners_count', v_winners_count,
    'total_paid_coins', v_total_paid
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. SIGNUP HANDLER & REFERRAL BONUS RPC
-- Automatically credits 1,000 Free Virtual Coins on signup and rewards +500
-- Bonus Coins to both referrer and referee when ?ref=username is provided.
-- ----------------------------------------------------------------------------
create or replace function public.register_campus_user(
  p_email text,
  p_username text,
  p_college_name text,
  p_referred_by text default null
)
returns public.profiles
language plpgsql
security definer
as $$
declare
  v_referrer public.profiles%rowtype;
  v_initial_coins integer := 1000;
  v_new_user public.profiles%rowtype;
begin
  if p_referred_by is not null and length(trim(p_referred_by)) > 0 then
    select * into v_referrer
    from public.profiles
    where lower(username) = lower(trim(p_referred_by))
    for update;

    if found then
      v_initial_coins := 1500; -- 1,000 base + 500 referral bonus
      update public.profiles
      set coin_balance = coin_balance + 500
      where id = v_referrer.id;
    end if;
  end if;

  insert into public.profiles (
    email, username, college_name, coin_balance, role, referred_by
  ) values (
    lower(trim(p_email)),
    trim(p_username),
    trim(p_college_name),
    v_initial_coins,
    'user',
    case when v_referrer.id is not null then v_referrer.username else null end
  ) returning * into v_new_user;

  insert into public.transactions (user_id, type, amount, description)
  values (v_new_user.id, 'SIGNUP_BONUS', 1000, 'Welcome to CampusOdds! 1,000 Free Virtual Coins');

  if v_referrer.id is not null then
    insert into public.transactions (user_id, type, amount, description)
    values
      (v_new_user.id, 'REFERRAL_BONUS', 500, format('Referral bonus from @%s (+500 Coins)', v_referrer.username)),
      (v_referrer.id, 'REFERRAL_BONUS', 500, format('Referred @%s to CampusOdds (+500 Coins)', v_new_user.username));
  end if;

  return v_new_user;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. SEED DATA: CAMPUS PROFILES & 6 HIGH-ENGAGEMENT INDIAN GEN-Z MARKETS
-- ----------------------------------------------------------------------------
insert into public.profiles (username, email, college_name, coin_balance, role, wins_count, resolved_count)
values
  ('arjun_iitb', 'arjun@iitb.ac.in', 'IIT Bombay', 4850, 'admin', 14, 17),
  ('anya_du', 'anya@du.ac.in', 'DU North Campus (SRCC)', 4120, 'creator', 11, 14),
  ('rohan_bits', 'rohan@pilani.bits-pilani.ac.in', 'BITS Pilani', 3690, 'creator', 9, 12),
  ('kabir_vit', 'kabir@vit.ac.in', 'VIT Vellore', 3240, 'user', 8, 11),
  ('meera_manipal', 'meera@manipal.edu', 'Manipal (MIT)', 2980, 'user', 7, 10),
  ('dev_nitt', 'dev@nitt.edu', 'NIT Trichy', 2750, 'user', 6, 9),
  ('isha_christ', 'isha@christuniversity.in', 'Christ University Bengaluru', 2410, 'user', 5, 8),
  ('aditya_patna', 'aditya@patnauniversity.ac.in', 'Patna University', 2190, 'user', 5, 7)
on conflict (username) do nothing;

insert into public.markets (title, category, resolution_rules, status, yes_pool, no_pool, total_volume, closes_at, creator_username)
values
  (
    'Will RCB qualify for the IPL Playoffs this season without needing NRR calculations in their final match?',
    'Cricket & Sports',
    'Resolves YES if Royal Challengers Bengaluru secure a top-4 playoff spot outright on points (>16 pts) or before their 14th league game.',
    'open',
    6800,
    4200,
    48200,
    now() + interval '14 days',
    'arjun_iitb'
  ),
  (
    'Will Mood Indigo & Rendezvous announce an international EDM headliner before November 15?',
    'Campus Gossip',
    'Resolves YES if either IIT Bombay Mood Indigo or IIT Delhi Rendezvous official Instagram page posts a verified international EDM artist lineup before Nov 15, 11:59 PM IST.',
    'open',
    7400,
    2600,
    35900,
    now() + interval '19 days',
    'anya_du'
  ),
  (
    'Will Samay Raina''s next live chess or comedy stream cross 450K concurrent viewers on YouTube?',
    'Pop-Culture & Creators',
    'Resolves YES if any public YouTube live stream on Samay Raina''s official channel hits 450,000+ peak concurrent viewers within 7 days.',
    'open',
    8100,
    1900,
    62400,
    now() + interval '7 days',
    'rohan_bits'
  ),
  (
    'Will Rockstar Games drop GTA 6 Trailer 3 before December 1, 2026 without another release delay?',
    'Tech & Finance',
    'Resolves YES if Rockstar Games uploads an official GTA VI Trailer 3 on YouTube before Dec 1, 2026 IST and keeps the scheduled launch window intact.',
    'open',
    4400,
    5600,
    53100,
    now() + interval '34 days',
    'arjun_iitb'
  ),
  (
    'Will End-Sem exam datesheets get postponed by at least 3 days after student council petition?',
    'Campus Gossip',
    'Resolves YES if the Dean of Academics issues a revised circular pushing the start of Theory End-Sem exams back by 3 or more calendar days.',
    'open',
    3100,
    6900,
    29400,
    now() + interval '10 days',
    'anya_du'
  ),
  (
    'Will Max Verstappen or Lando Norris win the next Formula 1 Grand Prix by more than 8.0 seconds?',
    'Cricket & Sports',
    'Resolves YES if the official FIA race classification shows either Verstappen or Norris in P1 with a winning margin strictly greater than 8.000 seconds.',
    'open',
    5500,
    4500,
    24800,
    now() + interval '6 days',
    'rohan_bits'
  );
