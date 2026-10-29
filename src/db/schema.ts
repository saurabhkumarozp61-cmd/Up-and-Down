import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const dateTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const profiles = pgTable(
  'profiles',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull().unique(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull().default('demo_pass'),
    collegeName: text('college_name').notNull().default('IIT Bombay'),
    coinBalance: integer('coin_balance').notNull().default(1000),
    realMoneyBalance: integer('real_money_balance').notNull().default(0),
    walletBalanceInr: numeric('wallet_balance_inr', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    realMoneyStatus: text('real_money_status').notNull().default('none'),
    upiId: text('upi_id'),
    realMoneyInviteNote: text('real_money_invite_note'),
    role: text('role').notNull().default('user'),
    isCommunityApproved: boolean('is_community_approved')
      .notNull()
      .default(false),
    canCreateEvents: boolean('can_create_events').notNull().default(false),
    hasPaymentAndTradingAccess: boolean('has_payment_and_trading_access')
      .notNull()
      .default(false),
    inviteCodeUsed: text('invite_code_used'),
    referredBy: text('referred_by'),
    lastDailyClaim: dateTimestamp('last_daily_claim'),
    winsCount: integer('wins_count').notNull().default(0),
    resolvedCount: integer('resolved_count').notNull().default(0),
    createdAt: dateTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check('profiles_coin_balance_check', sql`${table.coinBalance} >= 0`),
    check(
      'profiles_real_money_balance_check',
      sql`${table.realMoneyBalance} >= 0`
    ),
    check(
      'profiles_wallet_balance_inr_check',
      sql`${table.walletBalanceInr} >= 0`
    ),
    check(
      'profiles_real_money_status_check',
      sql`${table.realMoneyStatus} IN ('none', 'pending', 'approved', 'rejected')`
    ),
    check(
      'profiles_role_check',
      sql`${table.role} IN ('user', 'pending_creator', 'creator', 'admin')`
    ),
  ]
);

export const markets = pgTable(
  'markets',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    category: text('category').notNull(),
    resolutionRules: text('resolution_rules')
      .notNull()
      .default(
        'Resolves based on official public announcement or verified campus notice.'
      ),
    status: text('status').notNull().default('open'),
    outcome: text('outcome'),
    yesPool: doublePrecision('yes_pool').notNull().default(5000),
    noPool: doublePrecision('no_pool').notNull().default(5000),
    totalVolume: integer('total_volume').notNull().default(0),
    closesAt: dateTimestamp('closes_at').notNull(),
    createdBy: integer('created_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    creatorUsername: text('creator_username').notNull().default('saurabh_owner'),
    createdAt: dateTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'markets_status_check',
      sql`${table.status} IN ('open', 'resolved', 'cancelled')`
    ),
    check('markets_outcome_check', sql`${table.outcome} IS NULL OR ${table.outcome} IN ('YES', 'NO')`),
    check('markets_yes_pool_check', sql`${table.yesPool} > 0`),
    check('markets_no_pool_check', sql`${table.noPool} > 0`),
  ]
);

export const positions = pgTable(
  'positions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    marketId: integer('market_id')
      .references(() => markets.id, { onDelete: 'cascade' })
      .notNull(),
    side: text('side').notNull(),
    walletType: text('wallet_type').notNull().default('COINS'),
    shares: integer('shares').notNull(),
    sharesQuantity: numeric('shares_quantity', {
      precision: 14,
      scale: 4,
      mode: 'number',
    })
      .notNull()
      .default(0),
    investedCoins: integer('invested_coins').notNull(),
    investedAmount: numeric('invested_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    entryPrice: doublePrecision('entry_price').notNull(),
    exitPrice: doublePrecision('exit_price'),
    realizedPnl: numeric('realized_pnl', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    exitedEarly: boolean('exited_early').notNull().default(false),
    settled: boolean('settled').notNull().default(false),
    payoutCoins: integer('payout_coins').notNull().default(0),
    createdAt: dateTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check('positions_side_check', sql`${table.side} IN ('YES', 'NO')`),
    check(
      'positions_wallet_type_check',
      sql`${table.walletType} IN ('COINS', 'REAL_INR')`
    ),
    check(
      'positions_entry_price_check',
      sql`${table.entryPrice} BETWEEN 1 AND 99`
    ),
  ]
);

export const trades = pgTable(
  'trades',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    marketId: integer('market_id')
      .references(() => markets.id, { onDelete: 'cascade' })
      .notNull(),
    positionId: integer('position_id').references(() => positions.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    side: text('side').notNull(),
    walletType: text('wallet_type').notNull().default('COINS'),
    shares: numeric('shares', {
      precision: 14,
      scale: 4,
      mode: 'number',
    }).notNull(),
    executionPrice: doublePrecision('execution_price').notNull(),
    totalAmount: numeric('total_amount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    realizedPnl: numeric('realized_pnl', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    createdAt: dateTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'trades_action_check',
      sql`${table.action} IN ('BUY', 'SELL_EARLY')`
    ),
    check('trades_side_check', sql`${table.side} IN ('YES', 'NO')`),
    check(
      'trades_wallet_type_check',
      sql`${table.walletType} IN ('COINS', 'REAL_INR')`
    ),
    check(
      'trades_execution_price_check',
      sql`${table.executionPrice} BETWEEN 1 AND 99`
    ),
  ]
);

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    username: text('username').notNull(),
    userEmail: text('user_email').notNull(),
    marketId: integer('market_id').references(() => markets.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    status: text('status').notNull().default('PENDING'),
    amountInr: numeric('amount_inr', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    utrNumber: text('utr_number'),
    upiId: text('upi_id'),
    gatewayOrderId: text('gateway_order_id'),
    gatewayPaymentId: text('gateway_payment_id'),
    gatewaySignature: text('gateway_signature'),
    notes: text('notes').notNull().default(''),
    reviewedBy: text('reviewed_by'),
    reviewedAt: dateTimestamp('reviewed_at'),
    createdAt: dateTimestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check(
      'wallet_transactions_type_check',
      sql`${table.type} IN ('DEPOSIT', 'WITHDRAWAL', 'TRADE_BUY', 'TRADE_SELL', 'EVENT_SETTLEMENT_WIN', 'EVENT_REFUND')`
    ),
    check(
      'wallet_transactions_status_check',
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')`
    ),
    uniqueIndex('wallet_transactions_gateway_order_id_unique')
      .on(table.gatewayOrderId)
      .where(sql`${table.gatewayOrderId} IS NOT NULL`),
    uniqueIndex('wallet_transactions_utr_number_unique')
      .on(table.utrNumber)
      .where(sql`${table.utrNumber} IS NOT NULL`),
    uniqueIndex('wallet_transactions_gateway_payment_id_unique')
      .on(table.gatewayPaymentId)
      .where(sql`${table.gatewayPaymentId} IS NOT NULL`),
  ]
);

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id, { onDelete: 'cascade' })
    .notNull(),
  marketId: integer('market_id').references(() => markets.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  createdAt: dateTimestamp('created_at').defaultNow().notNull(),
});

export const profilesRelations = relations(profiles, ({ many }) => ({
  positions: many(positions),
  trades: many(trades),
  walletTransactions: many(walletTransactions),
  transactions: many(transactions),
}));

export const marketsRelations = relations(markets, ({ many, one }) => ({
  positions: many(positions),
  trades: many(trades),
  creator: one(profiles, {
    fields: [markets.createdBy],
    references: [profiles.id],
  }),
}));

export const positionsRelations = relations(positions, ({ one }) => ({
  user: one(profiles, {
    fields: [positions.userId],
    references: [profiles.id],
  }),
  market: one(markets, {
    fields: [positions.marketId],
    references: [markets.id],
  }),
}));
