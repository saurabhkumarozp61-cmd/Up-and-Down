-- ============================================================================
-- UP & DOWN: FINTECH PREDICTION MARKET (POLYMARKET / KALSHI ₹100 BASE IN INR)
-- PostgreSQL schema kept in sync with src/db/schema.ts.
-- ============================================================================

-- 1. USERS / PROFILES TABLE (WITH GRANULAR OWNER RBAC & INVITE-ONLY FLAGS)
CREATE TABLE IF NOT EXISTS public.profiles (
  id SERIAL PRIMARY KEY,
  uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT 'demo_pass',
  college_name TEXT NOT NULL DEFAULT 'IIT Bombay',
  coin_balance INTEGER NOT NULL DEFAULT 1000 CHECK (coin_balance >= 0),
  real_money_balance INTEGER NOT NULL DEFAULT 0 CHECK (real_money_balance >= 0),
  wallet_balance_inr NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (wallet_balance_inr >= 0),
  real_money_status TEXT NOT NULL DEFAULT 'none' CHECK (real_money_status IN ('none', 'pending', 'approved', 'rejected')),
  upi_id TEXT,
  real_money_invite_note TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'pending_creator', 'creator', 'admin')),
  is_community_approved BOOLEAN NOT NULL DEFAULT FALSE,
  can_create_events BOOLEAN NOT NULL DEFAULT FALSE,
  has_payment_and_trading_access BOOLEAN NOT NULL DEFAULT FALSE,
  invite_code_used TEXT,
  referred_by TEXT,
  last_daily_claim TIMESTAMPTZ,
  wins_count INTEGER NOT NULL DEFAULT 0,
  resolved_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. EVENTS / MARKETS TABLE (YES PRICE + NO PRICE = ₹100 BASE)
CREATE TABLE IF NOT EXISTS public.markets (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  resolution_rules TEXT NOT NULL DEFAULT 'Resolves based on official public announcement or verified campus notice.',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'cancelled')),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('YES', 'NO')),
  yes_pool DOUBLE PRECISION NOT NULL DEFAULT 5000 CHECK (yes_pool > 0),
  no_pool DOUBLE PRECISION NOT NULL DEFAULT 5000 CHECK (no_pool > 0),
  total_volume INTEGER NOT NULL DEFAULT 0,
  closes_at TIMESTAMPTZ NOT NULL,
  created_by INTEGER REFERENCES public.profiles(id) ON DELETE SET NULL,
  creator_username TEXT NOT NULL DEFAULT 'saurabh_owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. POSITIONS TABLE (FRACTIONAL & WHOLE SHARES + EARLY EXIT PROFIT BOOKING)
CREATE TABLE IF NOT EXISTS public.positions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('YES', 'NO')),
  wallet_type TEXT NOT NULL DEFAULT 'COINS' CHECK (wallet_type IN ('COINS', 'REAL_INR')),
  shares INTEGER NOT NULL,
  shares_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  invested_coins INTEGER NOT NULL,
  invested_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  entry_price DOUBLE PRECISION NOT NULL CHECK (entry_price BETWEEN 1 AND 99),
  exit_price DOUBLE PRECISION,
  realized_pnl NUMERIC(14, 2) NOT NULL DEFAULT 0,
  exited_early BOOLEAN NOT NULL DEFAULT FALSE,
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  payout_coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TRADES TABLE (IMMUTABLE AUDIT LOG OF BUY & EARLY EXIT SELL EXECUTIONS)
CREATE TABLE IF NOT EXISTS public.trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  position_id INTEGER REFERENCES public.positions(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL_EARLY')),
  side TEXT NOT NULL CHECK (side IN ('YES', 'NO')),
  wallet_type TEXT NOT NULL DEFAULT 'COINS' CHECK (wallet_type IN ('COINS', 'REAL_INR')),
  shares NUMERIC(14, 4) NOT NULL,
  execution_price DOUBLE PRECISION NOT NULL CHECK (execution_price BETWEEN 1 AND 99),
  total_amount NUMERIC(14, 2) NOT NULL,
  realized_pnl NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WALLET TRANSACTIONS LEDGER (MANUAL UPI AND PAYMENT GATEWAY)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  user_email TEXT NOT NULL,
  market_id INTEGER REFERENCES public.markets(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'DEPOSIT',
    'WITHDRAWAL',
    'TRADE_BUY',
    'TRADE_SELL',
    'EVENT_SETTLEMENT_WIN',
    'EVENT_REFUND'
  )),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  amount_inr NUMERIC(14, 2) NOT NULL,
  utr_number TEXT,
  upi_id TEXT,
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  gateway_signature TEXT,
  notes TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A payment reference can be claimed or credited only once across the ledger.
-- Partial indexes keep multiple non-gateway/manual transactions legal.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_gateway_order_id_unique
  ON public.wallet_transactions (gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_utr_number_unique
  ON public.wallet_transactions (utr_number)
  WHERE utr_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_gateway_payment_id_unique
  ON public.wallet_transactions (gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

-- 6. GENERAL TRANSACTIONS TABLE (COIN AUDIT & APP HISTORY)
CREATE TABLE IF NOT EXISTS public.transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id INTEGER REFERENCES public.markets(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
