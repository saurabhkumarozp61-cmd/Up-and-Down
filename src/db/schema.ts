import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull().default('demo_pass'),
  collegeName: text('college_name').notNull().default('IIT Bombay'),
  coinBalance: integer('coin_balance').notNull().default(1000),
  realMoneyBalance: integer('real_money_balance').notNull().default(0),
  walletBalanceInr: doublePrecision('wallet_balance_inr').notNull().default(0),
  realMoneyStatus: text('real_money_status').notNull().default('none'), // 'none' | 'pending' | 'approved' | 'rejected'
  upiId: text('upi_id'),
  realMoneyInviteNote: text('real_money_invite_note'),
  role: text('role').notNull().default('user'), // 'user' | 'pending_creator' | 'creator' | 'admin'
  // Granular Owner RBAC Permissions
  isCommunityApproved: boolean('is_community_approved').notNull().default(false),
  canCreateEvents: boolean('can_create_events').notNull().default(false),
  hasPaymentAndTradingAccess: boolean('has_payment_and_trading_access')
    .notNull()
    .default(false),
  inviteCodeUsed: text('invite_code_used'),
  referredBy: text('referred_by'),
  lastDailyClaim: timestamp('last_daily_claim'),
  winsCount: integer('wins_count').notNull().default(0),
  resolvedCount: integer('resolved_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const markets = pgTable('markets', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(), // 'Cricket & Sports' | 'Campus Gossip' | 'Pop-Culture & Creators' | 'Tech & Finance'
  resolutionRules: text('resolution_rules')
    .notNull()
    .default('Resolved based on official public announcement or verified campus notice.'),
  status: text('status').notNull().default('open'), // 'open' | 'resolved' | 'cancelled'
  outcome: text('outcome'), // 'YES' | 'NO' | null
  yesPool: integer('yes_pool').notNull().default(5000),
  noPool: integer('no_pool').notNull().default(5000),
  totalVolume: integer('total_volume').notNull().default(0),
  closesAt: timestamp('closes_at').notNull(),
  createdBy: integer('created_by').references(() => profiles.id),
  creatorUsername: text('creator_username').notNull().default('arjun_iitb'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  marketId: integer('market_id')
    .references(() => markets.id)
    .notNull(),
  side: text('side').notNull(), // 'YES' | 'NO'
  walletType: text('wallet_type').notNull().default('COINS'), // 'COINS' | 'REAL_INR'
  shares: integer('shares').notNull(), // Settlement value integer (round(sharesQuantity * 100))
  sharesQuantity: doublePrecision('shares_quantity').notNull().default(0), // Exact fractional shares (Investment / Price)
  investedCoins: integer('invested_coins').notNull(),
  investedAmount: doublePrecision('invested_amount').notNull().default(0),
  entryPrice: integer('entry_price').notNull(),
  exitPrice: doublePrecision('exit_price'),
  realizedPnl: doublePrecision('realized_pnl').notNull().default(0),
  exitedEarly: boolean('exited_early').notNull().default(false),
  settled: boolean('settled').notNull().default(false),
  payoutCoins: integer('payout_coins').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const trades = pgTable('trades', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  marketId: integer('market_id')
    .references(() => markets.id)
    .notNull(),
  positionId: integer('position_id').references(() => positions.id),
  action: text('action').notNull(), // 'BUY' | 'SELL_EARLY'
  side: text('side').notNull(), // 'YES' | 'NO'
  walletType: text('wallet_type').notNull().default('REAL_INR'), // 'REAL_INR' | 'COINS'
  shares: doublePrecision('shares').notNull(), // Fractional shares bought or sold
  executionPrice: doublePrecision('execution_price').notNull(), // Live share price ₹1..₹99
  totalAmount: doublePrecision('total_amount').notNull(), // Investment or early-exit payout
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const walletTransactions = pgTable('wallet_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  username: text('username').notNull(),
  userEmail: text('user_email').notNull(),
  marketId: integer('market_id').references(() => markets.id),
  type: text('type').notNull(), // 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_BUY' | 'TRADE_SELL' | 'EVENT_SETTLEMENT_WIN' | 'EVENT_REFUND'
  status: text('status').notNull().default('COMPLETED'), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
  amountInr: doublePrecision('amount_inr').notNull(),
  utrNumber: text('utr_number'),
  upiId: text('upi_id'),
  gatewayOrderId: text('gateway_order_id'),
  gatewayPaymentId: text('gateway_payment_id'),
  notes: text('notes').notNull().default(''),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  marketId: integer('market_id').references(() => markets.id),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
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
