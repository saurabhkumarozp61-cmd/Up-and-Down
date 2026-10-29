-- Apply only during a planned database migration after resolving any duplicate
-- payment references reported by the preflight block below. This task does not
-- run this migration or alter any live database.
BEGIN;

ALTER TABLE public.markets
  ALTER COLUMN yes_pool TYPE DOUBLE PRECISION USING yes_pool::DOUBLE PRECISION,
  ALTER COLUMN no_pool TYPE DOUBLE PRECISION USING no_pool::DOUBLE PRECISION;

ALTER TABLE public.positions
  ALTER COLUMN entry_price TYPE DOUBLE PRECISION USING entry_price::DOUBLE PRECISION,
  ALTER COLUMN exit_price TYPE DOUBLE PRECISION USING exit_price::DOUBLE PRECISION;

ALTER TABLE public.trades
  ALTER COLUMN execution_price TYPE DOUBLE PRECISION USING execution_price::DOUBLE PRECISION;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE utr_number IS NOT NULL
    GROUP BY utr_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate non-null UTR values exist. Reconcile the ledger before adding wallet_transactions_utr_number_unique.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE gateway_order_id IS NOT NULL
    GROUP BY gateway_order_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate gateway order IDs exist. Reconcile the ledger before adding wallet_transactions_gateway_order_id_unique.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE gateway_payment_id IS NOT NULL
    GROUP BY gateway_payment_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate gateway payment IDs exist. Reconcile the ledger before adding wallet_transactions_gateway_payment_id_unique.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_gateway_order_id_unique
  ON public.wallet_transactions (gateway_order_id)
  WHERE gateway_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_utr_number_unique
  ON public.wallet_transactions (utr_number)
  WHERE utr_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_gateway_payment_id_unique
  ON public.wallet_transactions (gateway_payment_id)
  WHERE gateway_payment_id IS NOT NULL;

COMMIT;
