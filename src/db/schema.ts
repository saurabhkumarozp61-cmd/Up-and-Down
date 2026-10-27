import { relations } from 'drizzle-orm';
import {
  boolean,
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
  role: text('role').notNull().default('user'), // 'user' | 'creator' | 'admin'
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
  shares: integer('shares').notNull(), // Stored as integer shares where 1 share unit = 1 coin payout
  investedCoins: integer('invested_coins').notNull(),
  entryPrice: integer('entry_price').notNull(),
  settled: boolean('settled').notNull().default(false),
  payoutCoins: integer('payout_coins').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => profiles.id)
    .notNull(),
  marketId: integer('market_id').references(() => markets.id),
  type: text('type').notNull(), // 'SIGNUP_BONUS' | 'REFERRAL_BONUS' | 'DAILY_REFILL' | 'TRADE_BUY' | 'MARKET_PAYOUT' | 'MARKET_REFUND'
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const profilesRelations = relations(profiles, ({ many }) => ({
  positions: many(positions),
  transactions: many(transactions),
}));

export const marketsRelations = relations(markets, ({ many, one }) => ({
  positions: many(positions),
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
