-- Reconcile existing databases with src/db/schema.ts and supabase/schema.sql.
-- Review this migration for the target database before applying it. In
-- particular, naïve timestamps are interpreted as UTC. This task only adds the
-- migration file; it does not execute SQL against any database.
BEGIN;

-- The runtime ledger records username/email snapshots for its admin audit view.
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS gateway_signature TEXT;

UPDATE public.wallet_transactions AS wt
SET username = p.username,
    user_email = p.email
FROM public.profiles AS p
WHERE wt.user_id = p.id
  AND (wt.username IS NULL OR wt.user_email IS NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE username IS NULL OR user_email IS NULL
  ) THEN
    RAISE EXCEPTION 'Could not backfill wallet transaction user snapshots; reconcile orphaned ledger rows before continuing.';
  END IF;
END $$;

ALTER TABLE public.wallet_transactions
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN user_email SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'PENDING';

-- Runtime uses fixed-precision INR and four-decimal share quantities. These
-- casts round at the schema's declared precision and abort atomically on range
-- overflow instead of silently storing approximate money values.
ALTER TABLE public.profiles
  ALTER COLUMN wallet_balance_inr TYPE NUMERIC(14, 2)
    USING wallet_balance_inr::NUMERIC(14, 2),
  ALTER COLUMN wallet_balance_inr SET DEFAULT 0,
  ALTER COLUMN password_hash SET DEFAULT 'demo_pass';

ALTER TABLE public.positions
  ALTER COLUMN shares_quantity TYPE NUMERIC(14, 4)
    USING shares_quantity::NUMERIC(14, 4),
  ALTER COLUMN shares_quantity SET DEFAULT 0,
  ALTER COLUMN invested_amount TYPE NUMERIC(14, 2)
    USING invested_amount::NUMERIC(14, 2),
  ALTER COLUMN invested_amount SET DEFAULT 0,
  ALTER COLUMN realized_pnl TYPE NUMERIC(14, 2)
    USING realized_pnl::NUMERIC(14, 2),
  ALTER COLUMN realized_pnl SET DEFAULT 0;

ALTER TABLE public.wallet_transactions
  ALTER COLUMN amount_inr TYPE NUMERIC(14, 2)
    USING amount_inr::NUMERIC(14, 2);

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Runtime inserts use `shares`; preserve the existing share quantities by
-- renaming the legacy SQL-only column. Refuse ambiguous two-column states.
DO $$
DECLARE
  has_old_column BOOLEAN;
  has_new_column BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades'
      AND column_name = 'shares_quantity'
  ) INTO has_old_column;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades'
      AND column_name = 'shares'
  ) INTO has_new_column;

  IF has_old_column AND has_new_column THEN
    RAISE EXCEPTION 'Both trades.shares_quantity and trades.shares exist; reconcile the data before applying this migration.';
  ELSIF has_old_column THEN
    ALTER TABLE public.trades RENAME COLUMN shares_quantity TO shares;
  ELSIF NOT has_new_column THEN
    RAISE EXCEPTION 'Neither trades.shares_quantity nor trades.shares exists; inspect the trades schema before continuing.';
  END IF;
END $$;

ALTER TABLE public.trades
  ALTER COLUMN shares TYPE NUMERIC(14, 4) USING shares::NUMERIC(14, 4),
  ALTER COLUMN total_amount TYPE NUMERIC(14, 2)
    USING total_amount::NUMERIC(14, 2),
  ALTER COLUMN realized_pnl TYPE NUMERIC(14, 2)
    USING realized_pnl::NUMERIC(14, 2),
  ALTER COLUMN realized_pnl SET DEFAULT 0,
  ALTER COLUMN wallet_type SET DEFAULT 'COINS';

ALTER TABLE public.markets
  ALTER COLUMN resolution_rules SET DEFAULT 'Resolves based on official public announcement or verified campus notice.',
  ALTER COLUMN creator_username SET DEFAULT 'saurabh_owner';

-- Drizzle previously emitted timestamp without time zone. Convert only those
-- columns, interpreting their stored wall times as UTC; already-aware columns
-- are left untouched.
DO $$
DECLARE
  timestamp_column RECORD;
  column_type TEXT;
BEGIN
  FOR timestamp_column IN
    SELECT * FROM (VALUES
      ('profiles', 'last_daily_claim'),
      ('profiles', 'created_at'),
      ('markets', 'closes_at'),
      ('markets', 'created_at'),
      ('positions', 'created_at'),
      ('trades', 'created_at'),
      ('wallet_transactions', 'reviewed_at'),
      ('wallet_transactions', 'created_at'),
      ('transactions', 'created_at')
    ) AS columns_to_check(table_name, column_name)
  LOOP
    SELECT data_type INTO column_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = timestamp_column.table_name
      AND column_name = timestamp_column.column_name;

    IF column_type = 'timestamp without time zone' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE %L',
        timestamp_column.table_name,
        timestamp_column.column_name,
        timestamp_column.column_name,
        'UTC'
      );
    END IF;
  END LOOP;
END $$;

-- Runtime records early exits as SELL_EARLY. Convert legacy SELL values only
-- after removing the old generated check constraint.
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_action_check;
UPDATE public.trades SET action = 'SELL_EARLY' WHERE action = 'SELL';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.trades
    WHERE action NOT IN ('BUY', 'SELL_EARLY')
  ) THEN
    RAISE EXCEPTION 'Unexpected trades.action values exist; reconcile them before applying this migration.';
  END IF;
END $$;
ALTER TABLE public.trades
  ADD CONSTRAINT trades_action_check CHECK (action IN ('BUY', 'SELL_EARLY'));

COMMIT;
