import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { markets, positions, profiles, transactions } from './schema.ts';
import {
  calculateMarketPrices,
  calculateTradePreview,
  getInitialPoolsFromProbability,
  TradeSide,
} from '../utils/marketMath.ts';

let isSeedingChecked = false;

/**
 * Ensures the PostgreSQL database has initial campus profiles and 6 Gen-Z markets
 * even on a fresh database instance.
 */
export async function ensureDatabaseSeeded() {
  if (isSeedingChecked) return;
  try {
    const existingMarkets = await db.select().from(markets);
    if (existingMarkets.length > 0) {
      isSeedingChecked = true;
      return;
    }

    const seedUsers = [
      {
        uid: 'seed-arjun-iitb',
        email: 'arjun@iitb.ac.in',
        username: 'arjun_iitb',
        passwordHash: 'campus123',
        collegeName: 'IIT Bombay',
        coinBalance: 4850,
        role: 'admin',
        winsCount: 14,
        resolvedCount: 17,
      },
      {
        uid: 'seed-anya-du',
        email: 'anya@du.ac.in',
        username: 'anya_du',
        passwordHash: 'campus123',
        collegeName: 'DU North Campus (SRCC)',
        coinBalance: 4120,
        role: 'creator',
        winsCount: 11,
        resolvedCount: 14,
      },
      {
        uid: 'seed-rohan-bits',
        email: 'rohan@pilani.bits-pilani.ac.in',
        username: 'rohan_bits',
        passwordHash: 'campus123',
        collegeName: 'BITS Pilani',
        coinBalance: 3690,
        role: 'creator',
        winsCount: 9,
        resolvedCount: 12,
      },
      {
        uid: 'seed-kabir-vit',
        email: 'kabir@vit.ac.in',
        username: 'kabir_vit',
        passwordHash: 'campus123',
        collegeName: 'VIT Vellore',
        coinBalance: 3240,
        role: 'user',
        winsCount: 8,
        resolvedCount: 11,
      },
      {
        uid: 'seed-meera-manipal',
        email: 'meera@manipal.edu',
        username: 'meera_manipal',
        passwordHash: 'campus123',
        collegeName: 'Manipal (MIT)',
        coinBalance: 2980,
        role: 'user',
        winsCount: 7,
        resolvedCount: 10,
      },
      {
        uid: 'seed-dev-nitt',
        email: 'dev@nitt.edu',
        username: 'dev_nitt',
        passwordHash: 'campus123',
        collegeName: 'NIT Trichy',
        coinBalance: 2750,
        role: 'user',
        winsCount: 6,
        resolvedCount: 9,
      },
      {
        uid: 'seed-isha-christ',
        email: 'isha@christuniversity.in',
        username: 'isha_christ',
        passwordHash: 'campus123',
        collegeName: 'Christ University Bengaluru',
        coinBalance: 2410,
        role: 'user',
        winsCount: 5,
        resolvedCount: 8,
      },
      {
        uid: 'seed-aditya-patna',
        email: 'aditya@patnauniversity.ac.in',
        username: 'aditya_patna',
        passwordHash: 'campus123',
        collegeName: 'Patna University',
        coinBalance: 2190,
        role: 'user',
        winsCount: 5,
        resolvedCount: 7,
      },
    ];

    await db.insert(profiles).values(seedUsers).onConflictDoNothing();

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    await db.insert(markets).values([
      {
        title:
          'Will RCB qualify for the IPL Playoffs this season without needing NRR calculations in their final match?',
        category: 'Cricket & Sports',
        resolutionRules:
          'Resolves YES if Royal Challengers Bengaluru secure a top-4 playoff spot outright on points (>16 pts) or before their 14th league game.',
        status: 'open',
        yesPool: 6800,
        noPool: 4200,
        totalVolume: 48200,
        closesAt: new Date(now + 14 * dayMs),
        creatorUsername: 'arjun_iitb',
      },
      {
        title:
          'Will Mood Indigo & Rendezvous announce an international EDM headliner before November 15?',
        category: 'Campus Gossip',
        resolutionRules:
          'Resolves YES if either IIT Bombay Mood Indigo or IIT Delhi Rendezvous official Instagram page posts a verified international EDM artist lineup before Nov 15, 11:59 PM IST.',
        status: 'open',
        yesPool: 7400,
        noPool: 2600,
        totalVolume: 35900,
        closesAt: new Date(now + 19 * dayMs),
        creatorUsername: 'anya_du',
      },
      {
        title:
          "Will Samay Raina's next live chess or comedy stream cross 450K concurrent viewers on YouTube?",
        category: 'Pop-Culture & Creators',
        resolutionRules:
          "Resolves YES if any public YouTube live stream on Samay Raina's official channel hits 450,000+ peak concurrent viewers within 7 days.",
        status: 'open',
        yesPool: 8100,
        noPool: 1900,
        totalVolume: 62400,
        closesAt: new Date(now + 7 * dayMs),
        creatorUsername: 'rohan_bits',
      },
      {
        title:
          'Will Rockstar Games drop GTA 6 Trailer 3 before December 1, 2026 without another release delay?',
        category: 'Tech & Finance',
        resolutionRules:
          'Resolves YES if Rockstar Games uploads an official GTA VI Trailer 3 on YouTube before Dec 1, 2026 IST and keeps the scheduled launch window intact.',
        status: 'open',
        yesPool: 4400,
        noPool: 5600,
        totalVolume: 53100,
        closesAt: new Date(now + 34 * dayMs),
        creatorUsername: 'arjun_iitb',
      },
      {
        title:
          'Will End-Sem exam datesheets get postponed by at least 3 days after student council petition?',
        category: 'Campus Gossip',
        resolutionRules:
          'Resolves YES if the Dean of Academics issues a revised circular pushing the start of Theory End-Sem exams back by 3 or more calendar days.',
        status: 'open',
        yesPool: 3100,
        noPool: 6900,
        totalVolume: 29400,
        closesAt: new Date(now + 10 * dayMs),
        creatorUsername: 'anya_du',
      },
      {
        title:
          'Will Max Verstappen or Lando Norris win the next Formula 1 Grand Prix by more than 8.0 seconds?',
        category: 'Cricket & Sports',
        resolutionRules:
          'Resolves YES if the official FIA race classification shows either Verstappen or Norris in P1 with a winning margin strictly greater than 8.000 seconds.',
        status: 'open',
        yesPool: 5500,
        noPool: 4500,
        totalVolume: 24800,
        closesAt: new Date(now + 6 * dayMs),
        creatorUsername: 'rohan_bits',
      },
    ]);

    isSeedingChecked = true;
  } catch (error) {
    console.error('Seed check error:', error);
  }
}

export async function getAllMarkets() {
  try {
    await ensureDatabaseSeeded();
    return await db
      .select()
      .from(markets)
      .orderBy(desc(markets.totalVolume), desc(markets.id));
  } catch (error) {
    console.error('Database query failed in getAllMarkets:', error);
    throw new Error('Failed to load prediction markets. Please try again later.', {
      cause: error,
    });
  }
}

export async function getAllProfilesWithPositions() {
  try {
    await ensureDatabaseSeeded();
    const allProfiles = await db.select().from(profiles);
    const allPositions = await db.select().from(positions);
    const allMarkets = await db.select().from(markets);

    const marketMap = new Map(allMarkets.map((m) => [m.id, m]));

    return allProfiles.map((p) => {
      const userPositions = allPositions.filter(
        (pos) => pos.userId === p.id && !pos.settled
      );
      let activePortfolioValue = 0;
      for (const pos of userPositions) {
        const m = marketMap.get(pos.marketId);
        if (m && m.status === 'open') {
          const prices = calculateMarketPrices(m.yesPool, m.noPool);
          const currentPrice = pos.side === 'YES' ? prices.yesPrice : prices.noPrice;
          activePortfolioValue += Math.round((pos.shares * currentPrice) / 100);
        } else {
          activePortfolioValue += pos.investedCoins;
        }
      }

      return {
        id: String(p.id),
        uid: p.uid,
        username: p.username,
        email: p.email,
        collegeName: p.collegeName,
        coinBalance: p.coinBalance,
        role: p.role,
        activePortfolioValue,
        winsCount: p.winsCount,
        resolvedCount: p.resolvedCount,
      };
    });
  } catch (error) {
    console.error('Database query failed in getAllProfilesWithPositions:', error);
    throw new Error('Failed to load leaderboard data.', { cause: error });
  }
}

/**
 * Resolves a user profile by UID or fallback email so users switching between
 * Email/Password login and Google OAuth are always matched cleanly.
 */
export async function getUserProfileByUid(uid: string, email?: string) {
  try {
    const rows = await db.select().from(profiles).where(eq(profiles.uid, uid));
    if (rows[0]) return rows[0];

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const byEmail = await db
        .select()
        .from(profiles)
        .where(eq(profiles.email, cleanEmail));
      if (byEmail[0]) {
        const updated = await db
          .update(profiles)
          .set({ uid })
          .where(eq(profiles.id, byEmail[0].id))
          .returning();
        return updated[0] || byEmail[0];
      }
    }
    return null;
  } catch (error) {
    console.error('Database query failed in getUserProfileByUid:', error);
    throw new Error('Failed to load user profile.', { cause: error });
  }
}

export async function getUserProfileByEmailOrUsername(identifier: string) {
  try {
    const clean = identifier.trim().toLowerCase();
    const all = await db.select().from(profiles);
    return (
      all.find(
        (p) =>
          p.email.toLowerCase() === clean || p.username.toLowerCase() === clean
      ) || null
    );
  } catch (error) {
    console.error(
      'Database query failed in getUserProfileByEmailOrUsername:',
      error
    );
    throw new Error('Failed to look up account.', { cause: error });
  }
}

export async function registerOrSyncUser(params: {
  uid: string;
  email: string;
  username: string;
  passwordHash?: string;
  collegeName: string;
  referredBy?: string;
}) {
  try {
    const existingByUid = await db
      .select()
      .from(profiles)
      .where(eq(profiles.uid, params.uid));
    if (existingByUid.length > 0) {
      return existingByUid[0];
    }

    const allUsers = await db.select().from(profiles);
    const cleanEmail = params.email.trim().toLowerCase();
    const existingByEmail = allUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail
    );
    if (existingByEmail) {
      // Sync UID so subsequent authenticated requests with this token match
      const synced = await db
        .update(profiles)
        .set({ uid: params.uid })
        .where(eq(profiles.id, existingByEmail.id))
        .returning();
      return synced[0] || existingByEmail;
    }

    // Ensure unique username
    let cleanUsername = params.username
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();
    if (!cleanUsername) {
      cleanUsername = `predictor_${Math.floor(1000 + Math.random() * 9000)}`;
    }
    if (allUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
      cleanUsername = `${cleanUsername}_${Math.floor(10 + Math.random() * 89)}`;
    }

    // Check referral bonus (+500 coins to both referrer and referee)
    let startingCoins = 1000;
    let validReferrer: (typeof allUsers)[0] | undefined;
    if (params.referredBy && params.referredBy.trim()) {
      const refClean = params.referredBy.trim().replace(/^@/, '').toLowerCase();
      validReferrer = allUsers.find(
        (u) => u.username.toLowerCase() === refClean
      );
      if (validReferrer) {
        startingCoins = 1500;
      }
    }

    const inserted = await db
      .insert(profiles)
      .values({
        uid: params.uid,
        email: cleanEmail,
        username: cleanUsername,
        passwordHash: params.passwordHash || 'campus123',
        collegeName: params.collegeName.trim() || 'IIT Bombay',
        coinBalance: startingCoins,
        role: 'user',
        referredBy: validReferrer ? validReferrer.username : null,
      })
      .returning();

    const newUser = inserted[0];

    await db.insert(transactions).values({
      userId: newUser.id,
      type: 'SIGNUP_BONUS',
      amount: 1000,
      description: 'Welcome to Up & Down! Claimed 1,000 Free Virtual Coins',
    });

    if (validReferrer) {
      await db
        .update(profiles)
        .set({ coinBalance: validReferrer.coinBalance + 500 })
        .where(eq(profiles.id, validReferrer.id));

      await db.insert(transactions).values([
        {
          userId: newUser.id,
          type: 'REFERRAL_BONUS',
          amount: 500,
          description: `Referral bonus from @${validReferrer.username} (+500 Coins)`,
        },
        {
          userId: validReferrer.id,
          type: 'REFERRAL_BONUS',
          amount: 500,
          description: `Referred @${newUser.username} to Up & Down (+500 Coins)`,
        },
      ]);
    }

    return newUser;
  } catch (error) {
    console.error('Database query failed in registerOrSyncUser:', error);
    throw new Error(
      'Failed to create user account. Username or email may already be taken.',
      {
        cause: error,
      }
    );
  }
}

export async function getUserPortfolio(userId: number) {
  try {
    const userPositions = await db
      .select()
      .from(positions)
      .where(eq(positions.userId, userId))
      .orderBy(desc(positions.createdAt));

    const userTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));

    const allMarkets = await db.select().from(markets);
    const marketMap = new Map(allMarkets.map((m) => [m.id, m]));

    const enrichedPositions = userPositions.map((pos) => {
      const m = marketMap.get(pos.marketId);
      const prices = m
        ? calculateMarketPrices(m.yesPool, m.noPool)
        : { yesPrice: 50, noPrice: 50 };
      const currentPrice = pos.side === 'YES' ? prices.yesPrice : prices.noPrice;
      const currentValue =
        m && m.status === 'open'
          ? Math.round((pos.shares * currentPrice) / 100)
          : pos.payoutCoins;

      return {
        ...pos,
        marketTitle: m ? m.title : 'Campus Market',
        marketCategory: m ? m.category : 'Campus Gossip',
        marketStatus: m ? m.status : 'open',
        marketOutcome: m ? m.outcome : null,
        currentPrice,
        currentValue,
        potentialPayout: pos.shares,
      };
    });

    return {
      positions: enrichedPositions,
      transactions: userTransactions,
    };
  } catch (error) {
    console.error('Database query failed in getUserPortfolio:', error);
    throw new Error('Failed to load portfolio details.', { cause: error });
  }
}

export async function placeTradeAtomic(params: {
  uid: string;
  email?: string;
  marketId: number;
  side: TradeSide;
  amount: number;
}) {
  try {
    return await db.transaction(async (tx) => {
      let userRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.uid, params.uid));
      let user = userRows[0];

      if (!user && params.email) {
        const byEmail = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.email, params.email.trim().toLowerCase()));
        user = byEmail[0];
      }

      if (!user) {
        throw new Error('User profile not found. Please sign in again.');
      }

      const cleanAmount = Math.floor(Number(params.amount) || 0);
      if (cleanAmount <= 0) {
        throw new Error('Trade amount must be greater than 0 Coins');
      }
      if (user.coinBalance < cleanAmount) {
        throw new Error(
          `Insufficient balance (${user.coinBalance} Coins available)`
        );
      }

      const marketRows = await tx
        .select()
        .from(markets)
        .where(eq(markets.id, params.marketId));
      const market = marketRows[0];
      if (!market) {
        throw new Error('Market not found');
      }
      if (market.status !== 'open') {
        throw new Error('This market is no longer open for trading');
      }

      const preview = calculateTradePreview(
        market.yesPool,
        market.noPool,
        params.side,
        cleanAmount
      );

      const newBalance = user.coinBalance - cleanAmount;
      await tx
        .update(profiles)
        .set({ coinBalance: newBalance })
        .where(eq(profiles.id, user.id));

      const updatedMarketRows = await tx
        .update(markets)
        .set({
          yesPool: preview.newYesPool,
          noPool: preview.newNoPool,
          totalVolume: market.totalVolume + cleanAmount,
        })
        .where(eq(markets.id, market.id))
        .returning();

      const insertedPos = await tx
        .insert(positions)
        .values({
          userId: user.id,
          marketId: market.id,
          side: params.side,
          shares: preview.potentialPayout,
          investedCoins: cleanAmount,
          entryPrice: preview.executionPrice,
          settled: false,
          payoutCoins: 0,
        })
        .returning();

      await tx.insert(transactions).values({
        userId: user.id,
        marketId: market.id,
        type: 'TRADE_BUY',
        amount: -cleanAmount,
        description: `Bought ${params.side} on "${market.title.slice(0, 48)}" at ${preview.executionPrice} Coins`,
      });

      return {
        position: insertedPos[0],
        updatedMarket: updatedMarketRows[0],
        newCoinBalance: newBalance,
        preview,
      };
    });
  } catch (error: any) {
    console.error('Database transaction failed in placeTradeAtomic:', error);
    throw new Error(error.message || 'Trade execution failed.', {
      cause: error,
    });
  }
}

export async function claimDailyRefillCoins(uid: string, email?: string) {
  try {
    const user = await getUserProfileByUid(uid, email);
    if (!user) {
      throw new Error('User profile not found');
    }

    const updated = await db
      .update(profiles)
      .set({
        coinBalance: user.coinBalance + 100,
        lastDailyClaim: new Date(),
      })
      .where(eq(profiles.id, user.id))
      .returning();

    await db.insert(transactions).values({
      userId: user.id,
      type: 'DAILY_REFILL',
      amount: 100,
      description: 'Daily Vault Drop (+100 Free Virtual Coins)',
    });

    return updated[0];
  } catch (error) {
    console.error('Database query failed in claimDailyRefillCoins:', error);
    throw new Error('Failed to claim daily coin drop.', { cause: error });
  }
}

export async function createMarketByCreatorOrAdmin(params: {
  uid: string;
  email?: string;
  title: string;
  category: string;
  closesAt: string;
  startingYesProbability: number;
  resolutionRules: string;
}) {
  try {
    const user = await getUserProfileByUid(params.uid, params.email);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.role !== 'admin' && user.role !== 'creator') {
      throw new Error(
        'Only Admins and Verified Community Creators can create markets.'
      );
    }

    const { yesPool, noPool } = getInitialPoolsFromProbability(
      params.startingYesProbability,
      10000
    );

    const parsedClosesAt = new Date(params.closesAt);
    const validClosesAt = isNaN(parsedClosesAt.getTime())
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : parsedClosesAt;

    const inserted = await db
      .insert(markets)
      .values({
        title: params.title.trim(),
        category: params.category,
        resolutionRules:
          params.resolutionRules.trim() ||
          'Resolved based on official public announcement or verified campus notice.',
        status: 'open',
        yesPool,
        noPool,
        totalVolume: 0,
        closesAt: validClosesAt,
        createdBy: user.id,
        creatorUsername: user.username,
      })
      .returning();

    return inserted[0];
  } catch (error: any) {
    console.error(
      'Database query failed in createMarketByCreatorOrAdmin:',
      error
    );
    throw new Error(error.message || 'Failed to create market.', {
      cause: error,
    });
  }
}

export async function resolveMarketAtomic(params: {
  uid: string;
  email?: string;
  marketId: number;
  resolution: 'YES' | 'NO' | 'CANCEL';
}) {
  try {
    const adminUser = await getUserProfileByUid(params.uid, params.email);
    if (!adminUser || adminUser.role !== 'admin') {
      throw new Error('Only Admins can resolve or cancel markets.');
    }

    return await db.transaction(async (tx) => {
      const marketRows = await tx
        .select()
        .from(markets)
        .where(eq(markets.id, params.marketId));
      const market = marketRows[0];
      if (!market) {
        throw new Error('Market not found');
      }
      if (market.status !== 'open') {
        throw new Error(`Market is already ${market.status}`);
      }

      const allPos = await tx
        .select()
        .from(positions)
        .where(eq(positions.marketId, market.id));
      const unsettledPos = allPos.filter((p) => !p.settled);

      let totalDistributed = 0;
      let winnersCount = 0;

      if (params.resolution === 'CANCEL') {
        for (const pos of unsettledPos) {
          const uRows = await tx
            .select()
            .from(profiles)
            .where(eq(profiles.id, pos.userId));
          const holder = uRows[0];
          if (holder) {
            await tx
              .update(profiles)
              .set({ coinBalance: holder.coinBalance + pos.investedCoins })
              .where(eq(profiles.id, holder.id));
          }

          await tx
            .update(positions)
            .set({ settled: true, payoutCoins: pos.investedCoins })
            .where(eq(positions.id, pos.id));

          await tx.insert(transactions).values({
            userId: pos.userId,
            marketId: market.id,
            type: 'MARKET_REFUND',
            amount: pos.investedCoins,
            description: `Refunded ${pos.investedCoins} Coins on cancelled market "${market.title.slice(0, 44)}"`,
          });

          totalDistributed += pos.investedCoins;
        }

        const updated = await tx
          .update(markets)
          .set({ status: 'cancelled', outcome: null })
          .where(eq(markets.id, market.id))
          .returning();

        return {
          market: updated[0],
          winnersCount: 0,
          totalDistributed,
        };
      }

      // Resolve YES or NO: Every winning share contract pays out 100 Coins (= pos.shares)
      for (const pos of unsettledPos) {
        const uRows = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, pos.userId));
        const holder = uRows[0];

        if (pos.side === params.resolution) {
          const payout = pos.shares;
          totalDistributed += payout;
          winnersCount += 1;

          if (holder) {
            await tx
              .update(profiles)
              .set({
                coinBalance: holder.coinBalance + payout,
                winsCount: holder.winsCount + 1,
                resolvedCount: holder.resolvedCount + 1,
              })
              .where(eq(profiles.id, holder.id));
          }

          await tx
            .update(positions)
            .set({ settled: true, payoutCoins: payout })
            .where(eq(positions.id, pos.id));

          await tx.insert(transactions).values({
            userId: pos.userId,
            marketId: market.id,
            type: 'MARKET_PAYOUT',
            amount: payout,
            description: `Won ${payout} Coins on "${market.title.slice(0, 44)}" (${params.resolution})`,
          });
        } else {
          if (holder) {
            await tx
              .update(profiles)
              .set({ resolvedCount: holder.resolvedCount + 1 })
              .where(eq(profiles.id, holder.id));
          }
          await tx
            .update(positions)
            .set({ settled: true, payoutCoins: 0 })
            .where(eq(positions.id, pos.id));
        }
      }

      const updated = await tx
        .update(markets)
        .set({ status: 'resolved', outcome: params.resolution })
        .where(eq(markets.id, market.id))
        .returning();

      return {
        market: updated[0],
        winnersCount,
        totalDistributed,
      };
    });
  } catch (error: any) {
    console.error('Database transaction failed in resolveMarketAtomic:', error);
    throw new Error(error.message || 'Failed to resolve market.', {
      cause: error,
    });
  }
}

export async function updateRoleByIdentifier(params: {
  adminUid: string;
  adminEmail?: string;
  targetIdentifier: string;
  newRole: 'user' | 'creator' | 'admin';
}) {
  try {
    const admin = await getUserProfileByUid(params.adminUid, params.adminEmail);
    if (!admin || admin.role !== 'admin') {
      throw new Error('Only Admins can manage community creator roles.');
    }

    const target = await getUserProfileByEmailOrUsername(
      params.targetIdentifier
    );
    if (!target) {
      throw new Error(`No user found matching "${params.targetIdentifier}"`);
    }

    const updated = await db
      .update(profiles)
      .set({ role: params.newRole })
      .where(eq(profiles.id, target.id))
      .returning();

    return updated[0];
  } catch (error: any) {
    console.error('Database query failed in updateRoleByIdentifier:', error);
    throw new Error(error.message || 'Failed to update user role.', {
      cause: error,
    });
  }
}

export async function selfSwitchDemoRole(
  uid: string,
  role: 'user' | 'creator' | 'admin',
  email?: string
) {
  try {
    const user = await getUserProfileByUid(uid, email);
    if (!user) {
      throw new Error('User not found');
    }
    const updated = await db
      .update(profiles)
      .set({ role })
      .where(eq(profiles.id, user.id))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Database query failed in selfSwitchDemoRole:', error);
    throw new Error('Failed to switch role.', { cause: error });
  }
}
