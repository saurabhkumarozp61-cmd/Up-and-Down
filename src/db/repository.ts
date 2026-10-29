import { desc, eq, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from './index.ts';
import {
  markets,
  positions,
  profiles,
  trades,
  transactions,
  walletTransactions,
} from './schema.ts';
import {
  calculateEarlyExitSell,
  calculateMarketPrices,
  calculateTradePreview,
  calculateUpiDepositSummary,
  canUserCreateEvents,
  checkDailyClaimEligibility,
  DEFAULT_OWNER_INVITE_CODE,
  DEFAULT_OWNER_UPI_ID,
  getInitialPoolsFromProbability,
  isCommunityApprovedUser,
  isOwnerEmail,
  isRealMoneyEligible,
  OWNER_EMAIL,
  validateCustomUsername,
  validateUpiId,
  validateUtrNumber,
  type RealMoneyAccessStatus,
  type TradeSide,
  type WalletMode,
} from '../utils/marketMath.ts';

let isSeedingChecked = false;

/**
 * Helper to normalize a database profile row with synchronized walletBalanceInr and granular RBAC flags.
 */
function normalizeUserProfile(row: typeof profiles.$inferSelect) {
  const owner = isOwnerEmail(row.email);
  const walletInr = Number(
    Number(
      row.walletBalanceInr && row.walletBalanceInr > 0
        ? row.walletBalanceInr
        : row.realMoneyBalance || 0
    ).toFixed(2)
  );
  const isAdminOrCreator =
    owner || row.role === 'admin' || row.role === 'creator';
  const hasRealMoney =
    owner ||
    Boolean(row.hasPaymentAndTradingAccess) ||
    row.realMoneyStatus === 'approved';

  return {
    ...row,
    walletBalanceInr: walletInr,
    realMoneyBalance: Math.round(walletInr),
    role: (owner ? 'admin' : row.role) as
      | 'user'
      | 'pending_creator'
      | 'creator'
      | 'admin',
    realMoneyStatus: (owner
      ? 'approved'
      : hasRealMoney
      ? 'approved'
      : row.realMoneyStatus) as RealMoneyAccessStatus,
    isCommunityApproved: owner || isAdminOrCreator || Boolean(row.isCommunityApproved),
    canCreateEvents: owner || isAdminOrCreator || Boolean(row.canCreateEvents),
    hasPaymentAndTradingAccess: hasRealMoney,
  };
}

/**
 * Ensures the PostgreSQL database has initial campus profiles, 6 Gen-Z markets,
 * and strictly enforces that ONLY Owner (saurabhhkumarr2023@gmail.com) is default Admin
 * and has default Real Money UPI Wallet & Event Creation access.
 */
export async function ensureDatabaseSeeded() {
  if (isSeedingChecked) return;
  try {
    const existingProfiles = await db.select().from(profiles);
    let ownerFound = false;
    for (const p of existingProfiles) {
      if (isOwnerEmail(p.email)) {
        ownerFound = true;
        const syncedBalance =
          p.walletBalanceInr > 0
            ? p.walletBalanceInr
            : p.realMoneyBalance > 0
            ? p.realMoneyBalance
            : 5000;
        if (
          p.role !== 'admin' ||
          p.realMoneyStatus !== 'approved' ||
          !p.isCommunityApproved ||
          !p.canCreateEvents ||
          !p.hasPaymentAndTradingAccess ||
          p.walletBalanceInr !== syncedBalance
        ) {
          await db
            .update(profiles)
            .set({
              role: 'admin',
              realMoneyStatus: 'approved',
              isCommunityApproved: true,
              canCreateEvents: true,
              hasPaymentAndTradingAccess: true,
              walletBalanceInr: syncedBalance,
              realMoneyBalance: Math.round(syncedBalance),
              upiId: p.upiId || DEFAULT_OWNER_UPI_ID,
            })
            .where(eq(profiles.id, p.id));
        }
      } else {
        // Sync walletBalanceInr if realMoneyBalance was already populated, and approve seeded campus accounts for community display
        const isSeedAccount = p.uid.startsWith('seed-');
        const desiredWalletInr =
          p.walletBalanceInr > 0 ? p.walletBalanceInr : p.realMoneyBalance || 0;
        const desiredCommunity = isSeedAccount ? true : p.isCommunityApproved;
        if (
          p.walletBalanceInr !== desiredWalletInr ||
          (isSeedAccount && !p.isCommunityApproved)
        ) {
          await db
            .update(profiles)
            .set({
              walletBalanceInr: desiredWalletInr,
              isCommunityApproved: desiredCommunity,
            })
            .where(eq(profiles.id, p.id));
        }
      }
    }

    if (!ownerFound) {
      await db
        .insert(profiles)
        .values({
          uid: 'owner-saurabh',
          email: OWNER_EMAIL,
          username: 'saurabh_owner',
          passwordHash: 'campus123',
          collegeName: 'Patna University',
          coinBalance: 5000,
          realMoneyBalance: 5000,
          walletBalanceInr: 5000,
          realMoneyStatus: 'approved',
          isCommunityApproved: true,
          canCreateEvents: true,
          hasPaymentAndTradingAccess: true,
          upiId: DEFAULT_OWNER_UPI_ID,
          role: 'admin',
          winsCount: 15,
          resolvedCount: 18,
        })
        .onConflictDoNothing();
    }

    // Backfill fractional sharesQuantity on any legacy positions where sharesQuantity === 0
    const allPos = await db.select().from(positions);
    for (const pos of allPos) {
      if ((!pos.sharesQuantity || pos.sharesQuantity <= 0) && pos.shares > 0) {
        const computedSharesQty = Number((pos.shares / 100).toFixed(4));
        const computedInvested =
          pos.investedAmount > 0 ? pos.investedAmount : pos.investedCoins;
        await db
          .update(positions)
          .set({
            sharesQuantity: computedSharesQty,
            investedAmount: computedInvested,
          })
          .where(eq(positions.id, pos.id));
      }
    }

    const existingMarkets = await db.select().from(markets);
    if (existingMarkets.length > 0) {
      isSeedingChecked = true;
      return;
    }

    const seedUsers = [
      {
        uid: 'owner-saurabh',
        email: OWNER_EMAIL,
        username: 'saurabh_owner',
        passwordHash: 'campus123',
        collegeName: 'Patna University',
        coinBalance: 5000,
        realMoneyBalance: 5000,
        walletBalanceInr: 5000,
        realMoneyStatus: 'approved',
        isCommunityApproved: true,
        canCreateEvents: true,
        hasPaymentAndTradingAccess: true,
        upiId: DEFAULT_OWNER_UPI_ID,
        role: 'admin',
        winsCount: 15,
        resolvedCount: 18,
      },
      {
        uid: 'seed-arjun-iitb',
        email: 'arjun@iitb.ac.in',
        username: 'arjun_iitb',
        passwordHash: 'campus123',
        collegeName: 'IIT Bombay',
        coinBalance: 4850,
        isCommunityApproved: true,
        role: 'user',
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
        isCommunityApproved: true,
        role: 'user',
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
        isCommunityApproved: true,
        role: 'user',
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
        isCommunityApproved: true,
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
        isCommunityApproved: true,
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
        isCommunityApproved: true,
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
        isCommunityApproved: true,
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
        isCommunityApproved: true,
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

    return allProfiles.map((rawProfile) => {
      const p = normalizeUserProfile(rawProfile);
      const userPositions = allPositions.filter(
        (pos) => pos.userId === p.id && !pos.settled
      );
      let activePortfolioValue = 0;
      for (const pos of userPositions) {
        const m = marketMap.get(pos.marketId);
        const sharesQty =
          pos.sharesQuantity > 0
            ? pos.sharesQuantity
            : Number((pos.shares / 100).toFixed(4));
        if (m && m.status === 'open') {
          const prices = calculateMarketPrices(m.yesPool, m.noPool);
          const currentPrice = pos.side === 'YES' ? prices.yesPrice : prices.noPrice;
          activePortfolioValue += Math.round(sharesQty * currentPrice);
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
        realMoneyBalance: p.realMoneyBalance,
        walletBalanceInr: p.walletBalanceInr,
        realMoneyStatus: p.realMoneyStatus,
        upiId: p.upiId,
        realMoneyInviteNote: p.realMoneyInviteNote,
        role: p.role,
        isCommunityApproved: p.isCommunityApproved,
        canCreateEvents: p.canCreateEvents,
        hasPaymentAndTradingAccess: p.hasPaymentAndTradingAccess,
        inviteCodeUsed: p.inviteCodeUsed,
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

export async function getUserProfileByUid(uid: string, email?: string) {
  try {
    await ensureDatabaseSeeded();
    const rows = await db.select().from(profiles).where(eq(profiles.uid, uid));
    let found = rows[0] || null;

    if (!found && email) {
      const cleanEmail = email.trim().toLowerCase();
      const all = await db.select().from(profiles);
      const byEmail = all.find((u) => u.email.toLowerCase() === cleanEmail);
      if (byEmail) {
        const isOwner = isOwnerEmail(byEmail.email);
        const updated = await db
          .update(profiles)
          .set({
            uid,
            role: isOwner ? 'admin' : byEmail.role,
            realMoneyStatus: isOwner ? 'approved' : byEmail.realMoneyStatus,
            isCommunityApproved: isOwner ? true : byEmail.isCommunityApproved,
            canCreateEvents: isOwner ? true : byEmail.canCreateEvents,
            hasPaymentAndTradingAccess: isOwner
              ? true
              : byEmail.hasPaymentAndTradingAccess,
          })
          .where(eq(profiles.id, byEmail.id))
          .returning();
        found = updated[0] || byEmail;
      }
    }

    if (!found) return null;

    if (
      isOwnerEmail(found.email) &&
      (found.role !== 'admin' ||
        found.realMoneyStatus !== 'approved' ||
        !found.isCommunityApproved ||
        !found.canCreateEvents ||
        !found.hasPaymentAndTradingAccess)
    ) {
      const promoted = await db
        .update(profiles)
        .set({
          role: 'admin',
          realMoneyStatus: 'approved',
          isCommunityApproved: true,
          canCreateEvents: true,
          hasPaymentAndTradingAccess: true,
        })
        .where(eq(profiles.id, found.id))
        .returning();
      found = promoted[0] || found;
    }

    return normalizeUserProfile(found);
  } catch (error) {
    console.error('Database query failed in getUserProfileByUid:', error);
    throw new Error('Failed to load user profile.', { cause: error });
  }
}

export async function getUserProfileByEmailOrUsername(identifier: string) {
  try {
    await ensureDatabaseSeeded();
    const clean = identifier.trim().replace(/^@+/, '').toLowerCase();
    const all = await db.select().from(profiles);
    const found =
      all.find(
        (p) =>
          p.email.toLowerCase() === clean || p.username.toLowerCase() === clean
      ) || null;

    if (!found) return null;

    if (isOwnerEmail(found.email) && found.role !== 'admin') {
      const promoted = await db
        .update(profiles)
        .set({
          role: 'admin',
          realMoneyStatus: 'approved',
          isCommunityApproved: true,
          canCreateEvents: true,
          hasPaymentAndTradingAccess: true,
        })
        .where(eq(profiles.id, found.id))
        .returning();
      return normalizeUserProfile(promoted[0] || found);
    }
    return normalizeUserProfile(found);
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
  inviteCode?: string;
  requestCreatorInvite?: boolean;
}) {
  try {
    await ensureDatabaseSeeded();
    const cleanEmail = params.email.trim().toLowerCase();
    const isOwner = isOwnerEmail(cleanEmail);
    const validInviteCode = (
      process.env.OWNER_INVITE_CODE || DEFAULT_OWNER_INVITE_CODE
    )
      .trim()
      .toUpperCase();
    const submittedInviteCode = (params.inviteCode || '').trim().toUpperCase();
    const hasValidInviteCode =
      Boolean(submittedInviteCode) &&
      (submittedInviteCode === validInviteCode ||
        submittedInviteCode === 'UPDOWN2026' ||
        submittedInviteCode === 'OWNER2026');

    const existingByUid = await db
      .select()
      .from(profiles)
      .where(eq(profiles.uid, params.uid));
    if (existingByUid.length > 0) {
      const current = existingByUid[0];
      const nextRole = isOwner
        ? 'admin'
        : params.requestCreatorInvite && current.role === 'user'
        ? 'pending_creator'
        : current.role;
      const nextCommunity =
        isOwner || current.isCommunityApproved || hasValidInviteCode;
      if (
        nextRole !== current.role ||
        nextCommunity !== current.isCommunityApproved
      ) {
        const updated = await db
          .update(profiles)
          .set({
            role: nextRole,
            isCommunityApproved: nextCommunity,
          })
          .where(eq(profiles.id, current.id))
          .returning();
        return normalizeUserProfile(updated[0] || current);
      }
      return normalizeUserProfile(current);
    }

    const allUsers = await db.select().from(profiles);
    const cleanInputUsername = params.username
      .trim()
      .replace(/^@+/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();

    const existingByEmailOrPreapprovedUsername =
      allUsers.find((u) => u.email.toLowerCase() === cleanEmail) ||
      allUsers.find(
        (u) =>
          cleanInputUsername.length >= 3 &&
          u.username.toLowerCase() === cleanInputUsername &&
          u.email.endsWith('@preapproved.upanddown.in')
      );

    if (existingByEmailOrPreapprovedUsername) {
      const matched = existingByEmailOrPreapprovedUsername;
      const nextRole = isOwner
        ? 'admin'
        : matched.role === 'admin' || matched.role === 'creator'
        ? matched.role
        : params.requestCreatorInvite && matched.role === 'user'
        ? 'pending_creator'
        : matched.role;
      const synced = await db
        .update(profiles)
        .set({
          uid: params.uid,
          email: cleanEmail,
          role: nextRole,
          isCommunityApproved:
            isOwner || matched.isCommunityApproved || hasValidInviteCode,
          canCreateEvents:
            isOwner ||
            matched.canCreateEvents ||
            nextRole === 'admin' ||
            nextRole === 'creator',
          hasPaymentAndTradingAccess:
            isOwner ||
            matched.hasPaymentAndTradingAccess ||
            matched.realMoneyStatus === 'approved',
          collegeName: params.collegeName.trim() || matched.collegeName,
        })
        .where(eq(profiles.id, matched.id))
        .returning();
      return normalizeUserProfile(synced[0] || matched);
    }

    let cleanUsername = cleanInputUsername;
    if (cleanUsername.length < 3) {
      cleanUsername = `user_${Math.floor(1000 + Math.random() * 9000)}`;
    }
    cleanUsername = cleanUsername.slice(0, 24);
    if (allUsers.some((u) => u.username.toLowerCase() === cleanUsername)) {
      cleanUsername = `${cleanUsername.slice(0, 20)}_${Math.floor(
        10 + Math.random() * 89
      )}`;
    }

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

    const initialRole = isOwner
      ? 'admin'
      : params.requestCreatorInvite
      ? 'pending_creator'
      : 'user';

    // Strict Invite-Only Mode: Uninvited signups default to isCommunityApproved = false
    // unless they are the Owner or entered a valid Owner Invite Code.
    const communityApproved = isOwner || hasValidInviteCode;

    const inserted = await db
      .insert(profiles)
      .values({
        uid: params.uid,
        email: cleanEmail,
        username: cleanUsername,
        passwordHash: params.passwordHash || 'campus123',
        collegeName: params.collegeName.trim() || 'IIT Bombay',
        coinBalance: startingCoins,
        realMoneyBalance: isOwner ? 5000 : 0,
        walletBalanceInr: isOwner ? 5000 : 0,
        realMoneyStatus: isOwner ? 'approved' : 'none',
        isCommunityApproved: communityApproved,
        canCreateEvents: isOwner,
        hasPaymentAndTradingAccess: isOwner,
        inviteCodeUsed: hasValidInviteCode ? submittedInviteCode : null,
        role: initialRole,
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

    return normalizeUserProfile(newUser);
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

export async function updateUserProfile(params: {
  uid: string;
  email?: string;
  username: string;
  collegeName?: string;
}) {
  try {
    const user = await getUserProfileByUid(params.uid, params.email);
    if (!user) {
      throw new Error('User profile not found. Please sign in again.');
    }

    const validation = validateCustomUsername(params.username);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid User ID.');
    }

    const allUsers = await db.select().from(profiles);
    const conflict = allUsers.find(
      (u) =>
        u.id !== user.id &&
        u.username.toLowerCase() === validation.clean.toLowerCase()
    );
    if (conflict) {
      throw new Error(
        `User ID @${validation.clean} is already taken. Please choose another User ID.`
      );
    }

    const nextCollege =
      params.collegeName && params.collegeName.trim()
        ? params.collegeName.trim()
        : user.collegeName;

    const updated = await db
      .update(profiles)
      .set({
        username: validation.clean,
        collegeName: nextCollege,
      })
      .where(eq(profiles.id, user.id))
      .returning();

    if (user.username !== validation.clean) {
      await db
        .update(markets)
        .set({ creatorUsername: validation.clean })
        .where(eq(markets.createdBy, user.id));
    }

    return normalizeUserProfile(updated[0]);
  } catch (error: any) {
    console.error('Database query failed in updateUserProfile:', error);
    throw new Error(error.message || 'Failed to update User ID.', {
      cause: error,
    });
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

    const userWalletTransactions = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt));

    const allMarkets = await db.select().from(markets);
    const marketMap = new Map(allMarkets.map((m) => [m.id, m]));

    const enrichedPositions = userPositions.map((pos) => {
      const m = marketMap.get(pos.marketId);
      const prices = m
        ? calculateMarketPrices(m.yesPool, m.noPool)
        : { yesPrice: 50, noPrice: 50 };
      const currentPrice = pos.side === 'YES' ? prices.yesPrice : prices.noPrice;

      // Exact fractional shares held
      const sharesQuantity =
        pos.sharesQuantity && pos.sharesQuantity > 0
          ? Number(pos.sharesQuantity.toFixed(4))
          : Number((pos.shares / 100).toFixed(4));
      const investedAmount =
        pos.investedAmount && pos.investedAmount > 0
          ? Number(pos.investedAmount.toFixed(2))
          : pos.investedCoins;

      // Live Early-Exit Sell Value: Shares Held * Current Live Market Price
      const currentValue =
        m && m.status === 'open' && !pos.settled
          ? Number((sharesQuantity * currentPrice).toFixed(2))
          : pos.payoutCoins;

      // Winning Settlement Value: Shares Held * ₹100
      const potentialPayout = Number((sharesQuantity * 100).toFixed(2));
      const unrealizedPnl =
        !pos.settled && m && m.status === 'open'
          ? Number((currentValue - investedAmount).toFixed(2))
          : Number((pos.realizedPnl || 0).toFixed(2));
      const unrealizedPnlPercent =
        investedAmount > 0
          ? Number(((unrealizedPnl / investedAmount) * 100).toFixed(1))
          : 0;

      return {
        ...pos,
        sharesQuantity,
        investedAmount,
        marketTitle: m ? m.title : 'Campus Market',
        marketCategory: m ? m.category : 'Campus Gossip',
        marketStatus: m ? m.status : 'open',
        marketOutcome: m ? m.outcome : null,
        currentPrice,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPercent,
        potentialPayout,
      };
    });

    return {
      positions: enrichedPositions,
      transactions: userTransactions,
      walletTransactions: userWalletTransactions,
    };
  } catch (error) {
    console.error('Database query failed in getUserPortfolio:', error);
    throw new Error('Failed to load portfolio details.', { cause: error });
  }
}

/**
 * 1. Core Trading Engine: Polymarket / Kalshi Model (₹100 Base in INR) - BUY SHARES
 * - Supports fractional & whole shares (`Shares Allocated = Investment Amount / Current Share Price`).
 * - Shifts AMM pools dynamically so `YES Price + NO Price = ₹100`.
 */
export async function placeTradeAtomic(params: {
  uid: string;
  email?: string;
  marketId: number;
  side: TradeSide;
  amount: number;
  walletType?: WalletMode;
}) {
  try {
    return await db.transaction(async (tx) => {
      let userRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.uid, params.uid));
      let rawUser = userRows[0];

      if (!rawUser && params.email) {
        const byEmail = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.email, params.email.trim().toLowerCase()));
        rawUser = byEmail[0];
      }

      if (!rawUser) {
        throw new Error('User profile not found. Please sign in again.');
      }

      const user = normalizeUserProfile(rawUser);

      if (!isCommunityApprovedUser(user)) {
        throw new Error(
          'Your account is in Invite-Only waiting mode. Get Owner approval or enter an Invite Code to trade.'
        );
      }

      const mode: WalletMode =
        params.walletType === 'REAL_INR' ? 'REAL_INR' : 'COINS';
      const cleanAmount = Number(Number(params.amount || 0).toFixed(2));
      if (cleanAmount <= 0) {
        throw new Error(
          mode === 'REAL_INR'
            ? 'Bet amount must be greater than ₹0'
            : 'Trade amount must be greater than 0 Coins'
        );
      }

      if (mode === 'REAL_INR') {
        if (!isRealMoneyEligible(user)) {
          throw new Error(
            'Real Money (₹ UPI) trading is restricted to the Owner and whitelisted users (`has_payment_and_trading_access`).'
          );
        }
        if (user.walletBalanceInr < cleanAmount) {
          throw new Error(
            `Insufficient Real Money Wallet balance (₹${user.walletBalanceInr.toLocaleString(
              'en-IN'
            )} available). Add funds via Direct UPI first.`
          );
        }
      } else {
        if (user.coinBalance < cleanAmount) {
          throw new Error(
            `Insufficient balance (${user.coinBalance} Coins available)`
          );
        }
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

      let newCoinBalance = user.coinBalance;
      let newWalletBalanceInr = user.walletBalanceInr;

      if (mode === 'REAL_INR') {
        newWalletBalanceInr = Number(
          (user.walletBalanceInr - cleanAmount).toFixed(2)
        );
        await tx
          .update(profiles)
          .set({
            walletBalanceInr: newWalletBalanceInr,
            realMoneyBalance: Math.round(newWalletBalanceInr),
          })
          .where(eq(profiles.id, user.id));
      } else {
        newCoinBalance = Math.round(user.coinBalance - cleanAmount);
        await tx
          .update(profiles)
          .set({ coinBalance: newCoinBalance })
          .where(eq(profiles.id, user.id));
      }

      const updatedMarketRows = await tx
        .update(markets)
        .set({
          yesPool: preview.newYesPool,
          noPool: preview.newNoPool,
          totalVolume: market.totalVolume + Math.round(cleanAmount),
        })
        .where(eq(markets.id, market.id))
        .returning();

      const insertedPos = await tx
        .insert(positions)
        .values({
          userId: user.id,
          marketId: market.id,
          side: params.side,
          walletType: mode,
          shares: Math.round(preview.potentialPayout),
          sharesQuantity: preview.sharesAllocated,
          investedCoins: Math.round(cleanAmount),
          investedAmount: cleanAmount,
          entryPrice: preview.executionPrice,
          settled: false,
          exitedEarly: false,
          realizedPnl: 0,
          payoutCoins: 0,
        })
        .returning();

      await tx.insert(trades).values({
        userId: user.id,
        marketId: market.id,
        positionId: insertedPos[0].id,
        action: 'BUY',
        side: params.side,
        walletType: mode,
        shares: preview.sharesAllocated,
        executionPrice: preview.executionPrice,
        totalAmount: cleanAmount,
      });

      if (mode === 'REAL_INR') {
        await tx.insert(walletTransactions).values({
          userId: user.id,
          username: user.username,
          userEmail: user.email,
          marketId: market.id,
          type: 'TRADE_BUY',
          status: 'COMPLETED',
          amountInr: -cleanAmount,
          notes: `Bought ${preview.sharesAllocated} ${params.side} shares @ ₹${preview.executionPrice}/sh on "${market.title.slice(0, 42)}"`,
        });
      }

      await tx.insert(transactions).values({
        userId: user.id,
        marketId: market.id,
        type: mode === 'REAL_INR' ? 'REAL_TRADE_BUY' : 'TRADE_BUY',
        amount: -Math.round(cleanAmount),
        description:
          mode === 'REAL_INR'
            ? `Real ₹ Buy: ${preview.sharesAllocated} ${params.side} sh @ ₹${preview.executionPrice} (Stake ₹${cleanAmount} → Settlement ₹${preview.potentialPayout})`
            : `Bought ${preview.sharesAllocated} ${params.side} shares @ ${preview.executionPrice} Coins on "${market.title.slice(0, 42)}"`,
      });

      return {
        position: insertedPos[0],
        updatedMarket: updatedMarketRows[0],
        newCoinBalance,
        newRealMoneyBalance: Math.round(newWalletBalanceInr),
        newWalletBalanceInr,
        walletType: mode,
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

/**
 * 1B. Core Trading Engine: Early Exit (Sell Before Final Result / Profit Booking & Stop-Loss)
 * - Users can sell their YES or NO shares (fully or partially) at any time while the event is still open.
 * - Formula on Early Exit: `Payout = Shares Sold * Current Live Market Price`.
 * - Immediately credits the live payout to the user's wallet balance and shifts the AMM pool.
 */
export async function sellPositionEarlyAtomic(params: {
  uid: string;
  email?: string;
  positionId: number;
  sharesToSell?: number; // If omitted, sells 100% of remaining shares in position
}) {
  try {
    return await db.transaction(async (tx) => {
      let userRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.uid, params.uid));
      let rawUser = userRows[0];

      if (!rawUser && params.email) {
        const byEmail = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.email, params.email.trim().toLowerCase()));
        rawUser = byEmail[0];
      }

      if (!rawUser) {
        throw new Error('User profile not found.');
      }
      const user = normalizeUserProfile(rawUser);

      const posRows = await tx
        .select()
        .from(positions)
        .where(eq(positions.id, params.positionId));
      const pos = posRows[0];
      if (!pos || pos.userId !== user.id) {
        throw new Error('Position not found in your portfolio.');
      }
      if (pos.settled) {
        throw new Error('This position has already been settled or sold.');
      }

      const marketRows = await tx
        .select()
        .from(markets)
        .where(eq(markets.id, pos.marketId));
      const market = marketRows[0];
      if (!market || market.status !== 'open') {
        throw new Error(
          'Early Exit is only available while the event is live and open.'
        );
      }

      const sharesHeld =
        pos.sharesQuantity && pos.sharesQuantity > 0
          ? Number(pos.sharesQuantity.toFixed(4))
          : Number((pos.shares / 100).toFixed(4));
      if (sharesHeld <= 0) {
        throw new Error('No active shares remaining to sell.');
      }

      const requestedShares =
        params.sharesToSell && params.sharesToSell > 0
          ? Math.min(sharesHeld, Number(params.sharesToSell.toFixed(4)))
          : sharesHeld;

      const sellPreview = calculateEarlyExitSell({
        yesPool: market.yesPool,
        noPool: market.noPool,
        side: pos.side as TradeSide,
        sharesHeld,
        sharesToSell: requestedShares,
        entryPrice: pos.entryPrice,
      });

      const isRealInr = pos.walletType === 'REAL_INR';
      const payout = sellPreview.payoutAmount;

      if (isRealInr) {
        const nextWalletInr = Number(
          (user.walletBalanceInr + payout).toFixed(2)
        );
        await tx
          .update(profiles)
          .set({
            walletBalanceInr: nextWalletInr,
            realMoneyBalance: Math.round(nextWalletInr),
          })
          .where(eq(profiles.id, user.id));
      } else {
        const nextCoins = Math.round(user.coinBalance + payout);
        await tx
          .update(profiles)
          .set({ coinBalance: nextCoins })
          .where(eq(profiles.id, user.id));
      }

      const updatedMarketRows = await tx
        .update(markets)
        .set({
          yesPool: sellPreview.newYesPool,
          noPool: sellPreview.newNoPool,
          totalVolume: market.totalVolume + Math.round(payout),
        })
        .where(eq(markets.id, market.id))
        .returning();

      const isFullExit = sellPreview.remainingShares <= 0.0001;
      const currentInvestedAmount =
        pos.investedAmount > 0 ? pos.investedAmount : pos.investedCoins;
      const nextInvestedAmount = isFullExit
        ? currentInvestedAmount
        : Number(
            Math.max(0, currentInvestedAmount - sellPreview.costBasisSold).toFixed(2)
          );
      const nextRealizedPnl = Number(
        ((pos.realizedPnl || 0) + sellPreview.realizedPnl).toFixed(2)
      );

      const updatedPosRows = await tx
        .update(positions)
        .set({
          sharesQuantity: isFullExit ? 0 : sellPreview.remainingShares,
          shares: isFullExit ? 0 : Math.round(sellPreview.remainingShares * 100),
          investedAmount: nextInvestedAmount,
          investedCoins: Math.round(nextInvestedAmount),
          settled: isFullExit,
          exitedEarly: true,
          exitPrice: sellPreview.currentLivePrice,
          realizedPnl: nextRealizedPnl,
          payoutCoins: Math.round((pos.payoutCoins || 0) + payout),
        })
        .where(eq(positions.id, pos.id))
        .returning();

      await tx.insert(trades).values({
        userId: user.id,
        marketId: market.id,
        positionId: pos.id,
        action: 'SELL_EARLY',
        side: pos.side,
        walletType: pos.walletType,
        shares: sellPreview.sharesToSell,
        executionPrice: sellPreview.currentLivePrice,
        totalAmount: payout,
      });

      const pnlTag =
        sellPreview.realizedPnl >= 0
          ? `+₹${sellPreview.realizedPnl.toFixed(2)} Profit`
          : `-₹${Math.abs(sellPreview.realizedPnl).toFixed(2)} Stop-Loss`;

      if (isRealInr) {
        await tx.insert(walletTransactions).values({
          userId: user.id,
          username: user.username,
          userEmail: user.email,
          marketId: market.id,
          type: 'TRADE_SELL',
          status: 'COMPLETED',
          amountInr: payout,
          notes: `Early Exit Sold ${sellPreview.sharesToSell} ${pos.side} shares @ ₹${sellPreview.currentLivePrice}/sh (${pnlTag}) on "${market.title.slice(0, 38)}"`,
        });
      }

      await tx.insert(transactions).values({
        userId: user.id,
        marketId: market.id,
        type: isRealInr ? 'REAL_TRADE_SELL' : 'TRADE_SELL',
        amount: Math.round(payout),
        description: isRealInr
          ? `Early Exit: Sold ${sellPreview.sharesToSell} ${pos.side} sh @ ₹${sellPreview.currentLivePrice} → Credited ₹${payout.toLocaleString('en-IN')} (${pnlTag})`
          : `Early Exit: Sold ${sellPreview.sharesToSell} ${pos.side} sh @ ${sellPreview.currentLivePrice} Coins → Credited ${Math.round(payout)} Coins`,
      });

      return {
        position: updatedPosRows[0],
        updatedMarket: updatedMarketRows[0],
        sellPreview,
        creditedAmount: payout,
        walletType: pos.walletType,
      };
    });
  } catch (error: any) {
    console.error('Database transaction failed in sellPositionEarlyAtomic:', error);
    throw new Error(error.message || 'Early exit sell failed.', {
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

    const eligibility = checkDailyClaimEligibility(user.lastDailyClaim);
    if (!eligibility.canClaim) {
      throw new Error(
        `Daily +100 Coins already claimed today! Next claim available in ${eligibility.remainingLabel}.`
      );
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

    return normalizeUserProfile(updated[0]);
  } catch (error: any) {
    console.error('Database query failed in claimDailyRefillCoins:', error);
    throw new Error(error.message || 'Failed to claim daily coin drop.', {
      cause: error,
    });
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
    if (!canUserCreateEvents(user)) {
      throw new Error(
        'Only the Owner and users with `can_create_events` approved by the Owner can create events.'
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

/**
 * 1C. Final Event Settlement (Resolution):
 * - Winning shares settle at ₹100 per 1 full share (`Total Payout = Shares Held * ₹100`).
 * - Losing shares settle at ₹0.
 * - Automatically credits winning payout to the respective users' real wallet balances and records `EVENT_SETTLEMENT_WIN`.
 */
export async function resolveMarketAtomic(params: {
  uid: string;
  email?: string;
  marketId: number;
  resolution: 'YES' | 'NO' | 'CANCEL';
}) {
  try {
    const adminUser = await getUserProfileByUid(params.uid, params.email);
    if (
      !adminUser ||
      (!isOwnerEmail(adminUser.email) && adminUser.role !== 'admin')
    ) {
      throw new Error('Only the Owner or approved Admins can resolve markets.');
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
          const isRealInr = pos.walletType === 'REAL_INR';
          const refundAmt =
            pos.investedAmount > 0 ? pos.investedAmount : pos.investedCoins;
          const uRows = await tx
            .select()
            .from(profiles)
            .where(eq(profiles.id, pos.userId));
          const holder = uRows[0];
          if (holder) {
            const normHolder = normalizeUserProfile(holder);
            if (isRealInr) {
              const nextInr = Number(
                (normHolder.walletBalanceInr + refundAmt).toFixed(2)
              );
              await tx
                .update(profiles)
                .set({
                  walletBalanceInr: nextInr,
                  realMoneyBalance: Math.round(nextInr),
                })
                .where(eq(profiles.id, holder.id));

              await tx.insert(walletTransactions).values({
                userId: holder.id,
                username: holder.username,
                userEmail: holder.email,
                marketId: market.id,
                type: 'EVENT_REFUND',
                status: 'COMPLETED',
                amountInr: refundAmt,
                notes: `Refunded ₹${refundAmt.toFixed(2)} on cancelled event "${market.title.slice(0, 42)}"`,
              });
            } else {
              await tx
                .update(profiles)
                .set({
                  coinBalance: holder.coinBalance + Math.round(refundAmt),
                })
                .where(eq(profiles.id, holder.id));
            }
          }

          await tx
            .update(positions)
            .set({ settled: true, payoutCoins: Math.round(refundAmt) })
            .where(eq(positions.id, pos.id));

          await tx.insert(transactions).values({
            userId: pos.userId,
            marketId: market.id,
            type: isRealInr ? 'REAL_MARKET_REFUND' : 'MARKET_REFUND',
            amount: Math.round(refundAmt),
            description: isRealInr
              ? `Refunded ₹${refundAmt.toFixed(2)} to Wallet on cancelled market "${market.title.slice(0, 40)}"`
              : `Refunded ${Math.round(refundAmt)} Coins on cancelled market "${market.title.slice(0, 44)}"`,
          });

          totalDistributed += refundAmt;
        }

        const updated = await tx
          .update(markets)
          .set({ status: 'cancelled', outcome: null })
          .where(eq(markets.id, market.id))
          .returning();

        return {
          market: updated[0],
          winnersCount: 0,
          totalDistributed: Math.round(totalDistributed),
        };
      }

      // Resolve YES or NO: Every 1.0000 winning share settles at ₹100 (`Shares Held * ₹100`)
      for (const pos of unsettledPos) {
        const isRealInr = pos.walletType === 'REAL_INR';
        const sharesHeld =
          pos.sharesQuantity && pos.sharesQuantity > 0
            ? pos.sharesQuantity
            : pos.shares / 100;
        const investedAmt =
          pos.investedAmount > 0 ? pos.investedAmount : pos.investedCoins;

        const uRows = await tx
          .select()
          .from(profiles)
          .where(eq(profiles.id, pos.userId));
        const holder = uRows[0];

        if (pos.side === params.resolution) {
          const exactPayout = Number((sharesHeld * 100).toFixed(2));
          const netWinPnl = Number((exactPayout - investedAmt).toFixed(2));
          totalDistributed += exactPayout;
          winnersCount += 1;

          if (holder) {
            const normHolder = normalizeUserProfile(holder);
            if (isRealInr) {
              const nextInr = Number(
                (normHolder.walletBalanceInr + exactPayout).toFixed(2)
              );
              await tx
                .update(profiles)
                .set({
                  walletBalanceInr: nextInr,
                  realMoneyBalance: Math.round(nextInr),
                  winsCount: holder.winsCount + 1,
                  resolvedCount: holder.resolvedCount + 1,
                })
                .where(eq(profiles.id, holder.id));

              await tx.insert(walletTransactions).values({
                userId: holder.id,
                username: holder.username,
                userEmail: holder.email,
                marketId: market.id,
                type: 'EVENT_SETTLEMENT_WIN',
                status: 'COMPLETED',
                amountInr: exactPayout,
                notes: `Event Settlement Win: ${sharesHeld.toFixed(4)} ${pos.side} shares × ₹100 = ₹${exactPayout.toFixed(2)} on "${market.title.slice(0, 38)}"`,
              });
            } else {
              await tx
                .update(profiles)
                .set({
                  coinBalance: holder.coinBalance + Math.round(exactPayout),
                  winsCount: holder.winsCount + 1,
                  resolvedCount: holder.resolvedCount + 1,
                })
                .where(eq(profiles.id, holder.id));
            }
          }

          await tx
            .update(positions)
            .set({
              settled: true,
              exitPrice: 100,
              realizedPnl: Number(((pos.realizedPnl || 0) + netWinPnl).toFixed(2)),
              payoutCoins: Math.round(exactPayout),
            })
            .where(eq(positions.id, pos.id));

          await tx.insert(transactions).values({
            userId: pos.userId,
            marketId: market.id,
            type: isRealInr ? 'REAL_MARKET_PAYOUT' : 'MARKET_PAYOUT',
            amount: Math.round(exactPayout),
            description: isRealInr
              ? `Event Settlement Win: ${sharesHeld.toFixed(2)} ${pos.side} sh × ₹100 = +₹${exactPayout.toLocaleString('en-IN')} on "${market.title.slice(0, 36)}"`
              : `Won ${Math.round(exactPayout)} Coins (${sharesHeld.toFixed(2)} sh × 100) on "${market.title.slice(0, 40)}"`,
          });
        } else {
          // Losing shares settle at ₹0
          if (holder) {
            await tx
              .update(profiles)
              .set({ resolvedCount: holder.resolvedCount + 1 })
              .where(eq(profiles.id, holder.id));
          }
          await tx
            .update(positions)
            .set({
              settled: true,
              exitPrice: 0,
              realizedPnl: Number(((pos.realizedPnl || 0) - investedAmt).toFixed(2)),
              payoutCoins: 0,
            })
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
        totalDistributed: Math.round(totalDistributed),
      };
    });
  } catch (error: any) {
    console.error('Database transaction failed in resolveMarketAtomic:', error);
    throw new Error(error.message || 'Failed to resolve market.', {
      cause: error,
    });
  }
}

export async function requestCreatorAccess(uid: string, email?: string) {
  try {
    const user = await getUserProfileByUid(uid, email);
    if (!user) {
      throw new Error('User profile not found');
    }
    if (
      isOwnerEmail(user.email) ||
      user.role === 'admin' ||
      user.role === 'creator'
    ) {
      return user;
    }

    const updated = await db
      .update(profiles)
      .set({ role: 'pending_creator' })
      .where(eq(profiles.id, user.id))
      .returning();

    return normalizeUserProfile(updated[0]);
  } catch (error: any) {
    console.error('Database query failed in requestCreatorAccess:', error);
    throw new Error(error.message || 'Failed to submit creator request.', {
      cause: error,
    });
  }
}

/**
 * 2. Strict Granular RBAC & Invite-Only System:
 * Allows the Owner (`saurabhhkumarr2023@gmail.com`) to invite a user (by email, @username, or phone)
 * or toggle the 3 explicit permissions for any existing user:
 *   1. `is_community_approved`
 *   2. `can_create_events`
 *   3. `has_payment_and_trading_access`
 */
export async function updateGranularPermissionsByOwner(params: {
  adminUid: string;
  adminEmail?: string;
  targetIdentifier: string;
  isCommunityApproved?: boolean;
  canCreateEvents?: boolean;
  hasPaymentAndTradingAccess?: boolean;
  newRole?: 'user' | 'pending_creator' | 'creator' | 'admin';
}) {
  try {
    const admin = await getUserProfileByUid(params.adminUid, params.adminEmail);
    const isAdminOwner =
      isOwnerEmail(params.adminEmail) || (admin && isOwnerEmail(admin.email));
    if (!isAdminOwner && (!admin || admin.role !== 'admin')) {
      throw new Error(
        `Only the Owner (${OWNER_EMAIL}) can manage user invites and granular permissions.`
      );
    }

    const rawIdentifier = params.targetIdentifier.trim();
    if (!rawIdentifier) {
      throw new Error(
        'Please enter a valid @username, email address, or phone/user ID.'
      );
    }

    const target = await getUserProfileByEmailOrUsername(rawIdentifier);

    if (!target) {
      const isEmail =
        rawIdentifier.includes('@') && !rawIdentifier.startsWith('@');
      const cleanEmail = isEmail
        ? rawIdentifier.toLowerCase()
        : `${rawIdentifier
            .replace(/^@+/, '')
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .toLowerCase()}@preapproved.upanddown.in`;

      let baseUsername = (
        isEmail ? rawIdentifier.split('@')[0] : rawIdentifier.replace(/^@+/, '')
      )
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase()
        .slice(0, 24);
      if (baseUsername.length < 3) {
        baseUsername = `invited_${Math.floor(100 + Math.random() * 900)}`;
      }

      const allProfiles = await db.select().from(profiles);
      if (allProfiles.some((p) => p.username.toLowerCase() === baseUsername)) {
        baseUsername = `${baseUsername.slice(0, 20)}_${Math.floor(
          10 + Math.random() * 89
        )}`;
      }

      const commApproved =
        params.isCommunityApproved !== undefined
          ? params.isCommunityApproved
          : true;
      const createEvents = Boolean(
        params.canCreateEvents ||
          params.newRole === 'creator' ||
          params.newRole === 'admin'
      );
      const paymentAccess = Boolean(params.hasPaymentAndTradingAccess);
      const roleToSet =
        params.newRole || (createEvents ? 'creator' : 'user');

      const preCreated = await db
        .insert(profiles)
        .values({
          uid: `preapproved-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          email: cleanEmail,
          username: baseUsername,
          passwordHash: 'campus123',
          collegeName: 'IIT Bombay',
          coinBalance: 1000,
          role: roleToSet,
          isCommunityApproved: commApproved,
          canCreateEvents: createEvents,
          hasPaymentAndTradingAccess: paymentAccess,
          realMoneyStatus: paymentAccess ? 'approved' : 'none',
        })
        .returning();

      const newProfile = preCreated[0];
      await db.insert(transactions).values({
        userId: newProfile.id,
        type: 'SIGNUP_BONUS',
        amount: 1000,
        description: `Pre-invited by Owner (${OWNER_EMAIL}) with granular access (+1,000 Coins)`,
      });

      return normalizeUserProfile(newProfile);
    }

    if (isOwnerEmail(target.email)) {
      throw new Error('Owner Super Admin permissions are permanently enabled.');
    }

    const nextCommunity =
      params.isCommunityApproved !== undefined
        ? params.isCommunityApproved
        : target.isCommunityApproved;
    const nextCreateEvents =
      params.canCreateEvents !== undefined
        ? params.canCreateEvents
        : params.newRole !== undefined
        ? params.newRole === 'creator' || params.newRole === 'admin'
        : target.canCreateEvents;
    const nextPaymentAccess =
      params.hasPaymentAndTradingAccess !== undefined
        ? params.hasPaymentAndTradingAccess
        : target.hasPaymentAndTradingAccess;

    const nextRole =
      params.newRole !== undefined
        ? params.newRole
        : nextCreateEvents && target.role === 'user'
        ? 'creator'
        : !nextCreateEvents && target.role === 'creator'
        ? 'user'
        : target.role;

    const nextRealMoneyStatus: RealMoneyAccessStatus = nextPaymentAccess
      ? 'approved'
      : target.realMoneyStatus === 'approved'
      ? 'none'
      : target.realMoneyStatus;

    const updated = await db
      .update(profiles)
      .set({
        isCommunityApproved: nextCommunity,
        canCreateEvents: nextCreateEvents,
        hasPaymentAndTradingAccess: nextPaymentAccess,
        role: nextRole,
        realMoneyStatus: nextRealMoneyStatus,
      })
      .where(eq(profiles.id, target.id))
      .returning();

    return normalizeUserProfile(updated[0]);
  } catch (error: any) {
    console.error(
      'Database query failed in updateGranularPermissionsByOwner:',
      error
    );
    throw new Error(error.message || 'Failed to update user permissions.', {
      cause: error,
    });
  }
}

export interface InAppInviteCodeItem {
  code: string;
  label: string;
  isCommunityApproved: boolean;
  canCreateEvents: boolean;
  hasPaymentAndTradingAccess: boolean;
  createdAt: string;
}

const customInAppInviteCodes: InAppInviteCodeItem[] = [
  {
    code: 'UPDOWN2026',
    label: 'Community + Real ₹ UPI Trading Access',
    isCommunityApproved: true,
    canCreateEvents: false,
    hasPaymentAndTradingAccess: true,
    createdAt: new Date().toISOString(),
  },
  {
    code: 'SAURABHVIP',
    label: 'Full VIP: Community + Real ₹ UPI + Event Creator',
    isCommunityApproved: true,
    canCreateEvents: true,
    hasPaymentAndTradingAccess: true,
    createdAt: new Date().toISOString(),
  },
  {
    code: 'CREATOR2026',
    label: 'Community + Event Creator Studio Access',
    isCommunityApproved: true,
    canCreateEvents: true,
    hasPaymentAndTradingAccess: false,
    createdAt: new Date().toISOString(),
  },
];

export function getInAppInviteCodes(): InAppInviteCodeItem[] {
  return [...customInAppInviteCodes];
}

export async function createInAppInviteCodeByOwner(params: {
  adminUid: string;
  adminEmail?: string;
  customCode?: string;
  label?: string;
  isCommunityApproved?: boolean;
  canCreateEvents?: boolean;
  hasPaymentAndTradingAccess?: boolean;
}): Promise<InAppInviteCodeItem[]> {
  const admin = await getUserProfileByUid(params.adminUid, params.adminEmail);
  const isAdminOwner =
    isOwnerEmail(params.adminEmail) || (admin && isOwnerEmail(admin.email));
  if (!isAdminOwner && (!admin || admin.role !== 'admin')) {
    throw new Error(
      `Only the Owner (${OWNER_EMAIL}) can generate in-app invite codes.`
    );
  }

  const rawCode = (
    params.customCode ||
    `UPDOWN-${Math.floor(1000 + Math.random() * 9000)}`
  )
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  if (rawCode.length < 4) {
    throw new Error('Invite code must be at least 4 characters.');
  }

  const comm =
    typeof params.isCommunityApproved === 'boolean'
      ? params.isCommunityApproved
      : true;
  const createEv = Boolean(params.canCreateEvents);
  const payAccess =
    typeof params.hasPaymentAndTradingAccess === 'boolean'
      ? params.hasPaymentAndTradingAccess
      : true;

  const existingIdx = customInAppInviteCodes.findIndex(
    (c) => c.code === rawCode
  );
  const item: InAppInviteCodeItem = {
    code: rawCode,
    label:
      params.label?.trim() ||
      [
        comm ? 'Community' : '',
        payAccess ? '₹ UPI Trading' : '',
        createEv ? 'Creator' : '',
      ]
        .filter(Boolean)
        .join(' + ') ||
      'Member Invite',
    isCommunityApproved: comm,
    canCreateEvents: createEv,
    hasPaymentAndTradingAccess: payAccess,
    createdAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    customInAppInviteCodes[existingIdx] = item;
  } else {
    customInAppInviteCodes.unshift(item);
  }

  return [...customInAppInviteCodes];
}

export async function getOwnerMainUpiConfig(): Promise<{
  ownerUpiId: string;
  ownerUpiName: string;
}> {
  try {
    const ownerRows = await db
      .select()
      .from(profiles)
      .where(sql`lower(${profiles.email}) = ${OWNER_EMAIL}`);
    const owner = ownerRows[0];
    const ownerUpiId =
      (owner?.upiId && owner.upiId.trim()) ||
      process.env.OWNER_UPI_ID ||
      '9931802215@fam';
    const ownerUpiName =
      process.env.OWNER_UPI_NAME || 'Saurabh Kumar (Owner Main UPI)';
    return { ownerUpiId, ownerUpiName };
  } catch {
    return {
      ownerUpiId: process.env.OWNER_UPI_ID || '9931802215@fam',
      ownerUpiName:
        process.env.OWNER_UPI_NAME || 'Saurabh Kumar (Owner Main UPI)',
    };
  }
}

export async function updateOwnerMainUpiByOwner(params: {
  adminUid: string;
  adminEmail?: string;
  newOwnerUpiId: string;
}) {
  const admin = await getUserProfileByUid(params.adminUid, params.adminEmail);
  const isAdminOwner =
    isOwnerEmail(params.adminEmail) || (admin && isOwnerEmail(admin.email));
  if (!isAdminOwner) {
    throw new Error(
      `Only the Owner (${OWNER_EMAIL}) can update the main receiving UPI ID.`
    );
  }

  const check = validateUpiId(params.newOwnerUpiId);
  if (!check.valid) {
    throw new Error(check.error || 'Please enter a valid UPI ID.');
  }

  const ownerRows = await db
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${OWNER_EMAIL}`);
  if (ownerRows[0]) {
    await db
      .update(profiles)
      .set({ upiId: check.clean })
      .where(eq(profiles.id, ownerRows[0].id));
  }

  return {
    ownerUpiId: check.clean,
    ownerUpiName:
      process.env.OWNER_UPI_NAME || 'Saurabh Kumar (Owner Main UPI)',
  };
}

export async function redeemOwnerInviteCode(params: {
  uid: string;
  email?: string;
  inviteCode: string;
}) {
  const user = await getUserProfileByUid(params.uid, params.email);
  if (!user) {
    throw new Error('User profile not found. Please sign in first.');
  }
  const expectedEnvCode = (
    process.env.OWNER_INVITE_CODE || DEFAULT_OWNER_INVITE_CODE
  )
    .trim()
    .toUpperCase();
  const cleanCode = (params.inviteCode || '').trim().toUpperCase();

  const matchedInApp = customInAppInviteCodes.find((c) => c.code === cleanCode);

  if (
    !cleanCode ||
    (!matchedInApp &&
      cleanCode !== expectedEnvCode &&
      cleanCode !== 'UPDOWN2026' &&
      cleanCode !== 'OWNER2026')
  ) {
    throw new Error(
      'Invalid Invite Code. Use an in-app Invite Code (e.g. UPDOWN2026 or SAURABHVIP) or wait for Owner approval.'
    );
  }

  const grantCommunity = matchedInApp
    ? matchedInApp.isCommunityApproved
    : true;
  const grantCreate = matchedInApp
    ? matchedInApp.canCreateEvents
    : user.canCreateEvents;
  const grantPay = matchedInApp
    ? matchedInApp.hasPaymentAndTradingAccess
    : true;

  const nextRole =
    user.role === 'admin'
      ? 'admin'
      : grantCreate
      ? 'creator'
      : user.role;
  const nextRealMoneyStatus: RealMoneyAccessStatus = grantPay
    ? 'approved'
    : user.realMoneyStatus;

  const updated = await db
    .update(profiles)
    .set({
      isCommunityApproved: grantCommunity,
      canCreateEvents: grantCreate,
      hasPaymentAndTradingAccess: grantPay,
      role: nextRole,
      realMoneyStatus: nextRealMoneyStatus,
      inviteCodeUsed: cleanCode,
    })
    .where(eq(profiles.id, user.id))
    .returning();

  return normalizeUserProfile(updated[0]);
}

export async function updateRoleByIdentifier(params: {
  adminUid: string;
  adminEmail?: string;
  targetIdentifier: string;
  newRole: 'user' | 'pending_creator' | 'creator' | 'admin';
}) {
  return updateGranularPermissionsByOwner({
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    targetIdentifier: params.targetIdentifier,
    newRole: params.newRole,
    isCommunityApproved: true,
    canCreateEvents:
      params.newRole === 'creator' || params.newRole === 'admin',
  });
}

export async function submitRealMoneyInviteRequest(params: {
  uid: string;
  email?: string;
  fullName: string;
  upiId: string;
  phone: string;
  inviteNote?: string;
}) {
  try {
    const user = await getUserProfileByUid(params.uid, params.email);
    if (!user) {
      throw new Error('User profile not found. Please sign in first.');
    }

    const upiValidation = validateUpiId(params.upiId);
    if (!upiValidation.valid) {
      throw new Error(upiValidation.error || 'Please enter a valid UPI ID.');
    }

    const cleanName = (params.fullName || '').trim();
    const cleanPhone = (params.phone || '').trim();
    if (!cleanName || cleanName.length < 2) {
      throw new Error('Please enter your Full Name for UPI verification.');
    }
    if (!cleanPhone || cleanPhone.length < 8) {
      throw new Error('Please enter a valid Phone / WhatsApp number.');
    }

    // Check if the user entered a valid In-App Invite Code inside inviteNote
    const rawNote = (params.inviteNote || '').trim();
    const upperNote = rawNote.toUpperCase();
    const matchedCode = customInAppInviteCodes.find(
      (c) => c.code === upperNote || upperNote.includes(c.code)
    );

    const isAutoApprovedByCode = Boolean(
      matchedCode && matchedCode.hasPaymentAndTradingAccess
    );

    const nextStatus: RealMoneyAccessStatus =
      isOwnerEmail(user.email) ||
      user.hasPaymentAndTradingAccess ||
      isAutoApprovedByCode
        ? 'approved'
        : 'pending';

    const noteSummary = `${cleanName} · ${cleanPhone}${
      rawNote ? ` · ${rawNote}` : ''
    }`;

    const updated = await db
      .update(profiles)
      .set({
        realMoneyStatus: nextStatus,
        hasPaymentAndTradingAccess: nextStatus === 'approved',
        isCommunityApproved: true,
        upiId: upiValidation.clean,
        realMoneyInviteNote: noteSummary,
        inviteCodeUsed: matchedCode ? matchedCode.code : user.inviteCodeUsed,
      })
      .where(eq(profiles.id, user.id))
      .returning();

    return normalizeUserProfile(updated[0]);
  } catch (error: any) {
    console.error(
      'Database query failed in submitRealMoneyInviteRequest:',
      error
    );
    throw new Error(error.message || 'Failed to submit Real Money invite form.', {
      cause: error,
    });
  }
}

export async function updateRealMoneyStatusByOwner(params: {
  adminUid: string;
  adminEmail?: string;
  targetIdentifier: string;
  status: RealMoneyAccessStatus;
}) {
  return updateGranularPermissionsByOwner({
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    targetIdentifier: params.targetIdentifier,
    isCommunityApproved: true,
    hasPaymentAndTradingAccess: params.status === 'approved',
  });
}

/**
 * 3. Direct UPI Payment to Owner's Main UPI ID:
 * - Payment goes directly to the Owner's Main UPI ID (`ownerUpiId`, e.g. `9931802215@fam` / `saurabh@okaxis`).
 * - Immediately credits the exact deposited amount (`amountInr`) to the user's live wallet (`walletBalanceInr` & `realMoneyBalance`)
 *   so the user sees their added funds right away and can immediately buy or sell YES or NO shares!
 * - Also records the transaction in `wallet_transactions` so the Owner has full visibility and control in the Admin Panel.
 */
export async function submitManualUpiDepositPending(params: {
  uid: string;
  email?: string;
  amountInr: number;
  utrNumber?: string;
  senderUpiId?: string;
  paymentApp?: string;
}) {
  try {
    const user = await getUserProfileByUid(params.uid, params.email);
    if (!user) {
      throw new Error('User profile not found');
    }

    if (!isRealMoneyEligible(user)) {
      throw new Error(
        'Real Money Wallet & Trading is Invite-Only. Enter an in-app Invite Code (e.g. UPDOWN2026) or ask the Owner to approve your account first!'
      );
    }

    const calc = calculateUpiDepositSummary(params.amountInr);
    if (!calc.valid) {
      throw new Error(calc.error || 'Invalid deposit amount.');
    }

    const rawUtr = (params.utrNumber || '').replace(/\s+/g, '').trim();
    const cleanUtr = /^\d{12}$/.test(rawUtr)
      ? rawUtr
      : `${Date.now().toString().slice(-8)}${Math.floor(
          1000 + Math.random() * 9000
        )}`;

    // Prevent duplicate 12-digit UTR reuse if user supplied a specific UTR
    if (/^\d{12}$/.test(rawUtr)) {
      const existingWalletTxs = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.utrNumber, cleanUtr));
      if (
        existingWalletTxs.some(
          (t) =>
            t.status === 'PENDING' ||
            t.status === 'APPROVED' ||
            t.status === 'COMPLETED'
        )
      ) {
        throw new Error(
          `UTR ${cleanUtr} has already been used. Each 12-digit UTR can only be used once.`
        );
      }
    }

    const { ownerUpiId } = await getOwnerMainUpiConfig();
    const cleanSenderUpi =
      params.senderUpiId && params.senderUpiId.trim()
        ? params.senderUpiId.trim().toLowerCase()
        : user.upiId || ownerUpiId;
    const appLabel = (params.paymentApp || 'Direct UPI QR').trim();

    return await db.transaction(async (tx) => {
      const freshRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id));
      const freshUser = normalizeUserProfile(freshRows[0] || user);

      const nextWalletInr = Number(
        (freshUser.walletBalanceInr + calc.netWalletCreditInr).toFixed(2)
      );

      const updatedUserRows = await tx
        .update(profiles)
        .set({
          walletBalanceInr: nextWalletInr,
          realMoneyBalance: Math.round(nextWalletInr),
          upiId: cleanSenderUpi,
        })
        .where(eq(profiles.id, user.id))
        .returning();

      const insertedWalletTx = await tx
        .insert(walletTransactions)
        .values({
          userId: user.id,
          username: user.username,
          userEmail: user.email,
          type: 'DEPOSIT',
          status: 'APPROVED',
          amountInr: calc.netWalletCreditInr,
          utrNumber: cleanUtr,
          upiId: ownerUpiId,
          notes: `Paid ₹${calc.netWalletCreditInr.toLocaleString(
            'en-IN'
          )} via ${appLabel} to Owner UPI (${ownerUpiId}) · Sender: ${cleanSenderUpi} · UTR ${cleanUtr}`,
        })
        .returning();

      await tx.insert(transactions).values({
        userId: user.id,
        type: 'REAL_DEPOSIT_UPI',
        amount: Math.round(calc.netWalletCreditInr),
        description: `Added ₹${calc.netWalletCreditInr.toLocaleString(
          'en-IN'
        )} via ${appLabel} to Owner UPI (${ownerUpiId}) · UTR ${cleanUtr}`,
      });

      return {
        user: normalizeUserProfile(updatedUserRows[0]),
        walletTransaction: insertedWalletTx[0],
        utrNumber: cleanUtr,
        addedInr: calc.netWalletCreditInr,
        pendingAmountInr: 0,
        ownerUpiId,
      };
    });
  } catch (error: any) {
    console.error(
      'Database query failed in submitManualUpiDepositPending:',
      error
    );
    throw new Error(error.message || 'Failed to add funds via Owner UPI.', {
      cause: error,
    });
  }
}

/**
 * 3B. Owner Admin Panel Approval / Rejection (or Reversal) for Manual UPI Deposits
 */
export async function reviewManualUpiDepositByOwner(params: {
  adminUid: string;
  adminEmail?: string;
  walletTransactionId: number;
  decision: 'APPROVED' | 'REJECTED';
}) {
  try {
    const admin = await getUserProfileByUid(params.adminUid, params.adminEmail);
    const isAdminOwner =
      isOwnerEmail(params.adminEmail) || (admin && isOwnerEmail(admin.email));
    if (!isAdminOwner && (!admin || admin.role !== 'admin')) {
      throw new Error(
        `Only the Owner (${OWNER_EMAIL}) can approve or reject UPI deposits.`
      );
    }

    return await db.transaction(async (tx) => {
      const txRows = await tx
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, params.walletTransactionId));
      const depositTx = txRows[0];
      if (!depositTx || depositTx.type !== 'DEPOSIT') {
        throw new Error('Deposit transaction not found.');
      }

      const userRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, depositTx.userId));
      const targetUser = userRows[0];
      if (!targetUser) {
        throw new Error('Target user profile not found.');
      }

      const normTarget = normalizeUserProfile(targetUser);

      if (params.decision === 'APPROVED') {
        if (depositTx.status === 'APPROVED' || depositTx.status === 'COMPLETED') {
          return {
            walletTransaction: depositTx,
            updatedUser: normTarget,
          };
        }

        const nextWalletInr = Number(
          (normTarget.walletBalanceInr + depositTx.amountInr).toFixed(2)
        );
        const updatedUserRows = await tx
          .update(profiles)
          .set({
            walletBalanceInr: nextWalletInr,
            realMoneyBalance: Math.round(nextWalletInr),
          })
          .where(eq(profiles.id, targetUser.id))
          .returning();

        const updatedTxRows = await tx
          .update(walletTransactions)
          .set({
            status: 'APPROVED',
            reviewedBy: admin?.email || OWNER_EMAIL,
            reviewedAt: new Date(),
            notes: `Approved by Owner · +₹${depositTx.amountInr.toLocaleString(
              'en-IN'
            )} credited (UTR ${depositTx.utrNumber})`,
          })
          .where(eq(walletTransactions.id, depositTx.id))
          .returning();

        await tx.insert(transactions).values({
          userId: targetUser.id,
          type: 'REAL_DEPOSIT_UPI',
          amount: Math.round(depositTx.amountInr),
          description: `UPI Deposit Approved by Owner: +₹${depositTx.amountInr.toLocaleString(
            'en-IN'
          )} (UTR ${depositTx.utrNumber})`,
        });

        return {
          walletTransaction: updatedTxRows[0],
          updatedUser: normalizeUserProfile(updatedUserRows[0]),
        };
      } else {
        // If deposit was previously APPROVED, reverse the credited amount from user's wallet
        let finalUser = normTarget;
        if (depositTx.status === 'APPROVED' || depositTx.status === 'COMPLETED') {
          const reversedWalletInr = Number(
            Math.max(0, normTarget.walletBalanceInr - depositTx.amountInr).toFixed(2)
          );
          const updatedUserRows = await tx
            .update(profiles)
            .set({
              walletBalanceInr: reversedWalletInr,
              realMoneyBalance: Math.round(reversedWalletInr),
            })
            .where(eq(profiles.id, targetUser.id))
            .returning();
          finalUser = normalizeUserProfile(updatedUserRows[0]);
        }

        const updatedTxRows = await tx
          .update(walletTransactions)
          .set({
            status: 'REJECTED',
            reviewedBy: admin?.email || OWNER_EMAIL,
            reviewedAt: new Date(),
            notes: `Rejected/Reversed by Owner · UTR ${depositTx.utrNumber}`,
          })
          .where(eq(walletTransactions.id, depositTx.id))
          .returning();

        return {
          walletTransaction: updatedTxRows[0],
          updatedUser: finalUser,
        };
      }
    });
  } catch (error: any) {
    console.error(
      'Database transaction failed in reviewManualUpiDepositByOwner:',
      error
    );
    throw new Error(error.message || 'Failed to review UPI deposit.', {
      cause: error,
    });
  }
}

/**
 * 3C. Withdrawal Request System:
 * Users submit their UPI ID to request a payout. Deducts the requested amount into pending payout status
 * and displays the request in the Owner Admin Panel so the Owner can manually pay via UPI and mark completed.
 */
export async function submitUpiWithdrawalRequest(params: {
  uid: string;
  email?: string;
  amountInr: number;
  upiId: string;
}) {
  try {
    const user = await getUserProfileByUid(params.uid, params.email);
    if (!user) {
      throw new Error('User profile not found');
    }

    if (!isRealMoneyEligible(user)) {
      throw new Error('Real Money UPI Wallet is Invite-Only.');
    }

    const cleanAmount = Number(Number(params.amountInr || 0).toFixed(2));
    if (cleanAmount < 50) {
      throw new Error('Minimum UPI withdrawal request is ₹50.');
    }

    const upiValidation = validateUpiId(params.upiId || user.upiId || '');
    if (!upiValidation.valid) {
      throw new Error(
        upiValidation.error || 'Please enter a valid destination UPI ID.'
      );
    }

    return await db.transaction(async (tx) => {
      const freshRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, user.id));
      const freshUser = normalizeUserProfile(freshRows[0] || user);

      if (freshUser.walletBalanceInr < cleanAmount) {
        throw new Error(
          `Insufficient Real Money Wallet balance (₹${freshUser.walletBalanceInr.toLocaleString(
            'en-IN'
          )} available).`
        );
      }

      const nextWalletInr = Number(
        (freshUser.walletBalanceInr - cleanAmount).toFixed(2)
      );
      const updatedUserRows = await tx
        .update(profiles)
        .set({
          walletBalanceInr: nextWalletInr,
          realMoneyBalance: Math.round(nextWalletInr),
          upiId: upiValidation.clean,
        })
        .where(eq(profiles.id, user.id))
        .returning();

      const insertedWalletTx = await tx
        .insert(walletTransactions)
        .values({
          userId: user.id,
          username: user.username,
          userEmail: user.email,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          amountInr: -cleanAmount,
          upiId: upiValidation.clean,
          notes: `Withdrawal Request ₹${cleanAmount.toLocaleString(
            'en-IN'
          )} to UPI ID ${upiValidation.clean} (Pending Owner Manual Payout)`,
        })
        .returning();

      await tx.insert(transactions).values({
        userId: user.id,
        type: 'REAL_WITHDRAW_UPI',
        amount: -Math.round(cleanAmount),
        description: `Withdrawal Requested: ₹${cleanAmount.toLocaleString(
          'en-IN'
        )} to ${upiValidation.clean} (Pending Owner Transfer)`,
      });

      return {
        user: normalizeUserProfile(updatedUserRows[0]),
        walletTransaction: insertedWalletTx[0],
        withdrawnInr: cleanAmount,
      };
    });
  } catch (error: any) {
    console.error('Database query failed in submitUpiWithdrawalRequest:', error);
    throw new Error(error.message || 'UPI withdrawal request failed.', {
      cause: error,
    });
  }
}

/**
 * 3D. Owner Admin Panel: Mark Withdrawal Completed (after sending money via UPI app) or Reject & Refund
 */
export async function reviewUpiWithdrawalByOwner(params: {
  adminUid: string;
  adminEmail?: string;
  walletTransactionId: number;
  decision: 'COMPLETED' | 'REJECTED';
  payoutUtrNumber?: string;
}) {
  try {
    const admin = await getUserProfileByUid(params.adminUid, params.adminEmail);
    const isAdminOwner =
      isOwnerEmail(params.adminEmail) || (admin && isOwnerEmail(admin.email));
    if (!isAdminOwner && (!admin || admin.role !== 'admin')) {
      throw new Error(
        `Only the Owner (${OWNER_EMAIL}) can complete or refund withdrawal requests.`
      );
    }

    return await db.transaction(async (tx) => {
      const txRows = await tx
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.id, params.walletTransactionId));
      const withdrawTx = txRows[0];
      if (!withdrawTx || withdrawTx.type !== 'WITHDRAWAL') {
        throw new Error('Withdrawal request not found.');
      }
      if (withdrawTx.status !== 'PENDING') {
        throw new Error(
          `This withdrawal request is already ${withdrawTx.status}.`
        );
      }

      const absAmount = Math.abs(withdrawTx.amountInr);
      const userRows = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, withdrawTx.userId));
      const targetUser = userRows[0];
      if (!targetUser) {
        throw new Error('Target user profile not found.');
      }
      const normTarget = normalizeUserProfile(targetUser);

      if (params.decision === 'COMPLETED') {
        const cleanUtr = (params.payoutUtrNumber || '').trim() || `UPI-${Date.now().toString().slice(-8)}`;
        const updatedTxRows = await tx
          .update(walletTransactions)
          .set({
            status: 'COMPLETED',
            utrNumber: cleanUtr,
            reviewedBy: admin?.email || OWNER_EMAIL,
            reviewedAt: new Date(),
            notes: `Sent ₹${absAmount.toLocaleString('en-IN')} to ${
              withdrawTx.upiId
            } · Payout Ref: ${cleanUtr}`,
          })
          .where(eq(walletTransactions.id, withdrawTx.id))
          .returning();

        return {
          walletTransaction: updatedTxRows[0],
          updatedUser: normTarget,
        };
      } else {
        // Refund back to user's wallet balance
        const refundedInr = Number(
          (normTarget.walletBalanceInr + absAmount).toFixed(2)
        );
        const updatedUserRows = await tx
          .update(profiles)
          .set({
            walletBalanceInr: refundedInr,
            realMoneyBalance: Math.round(refundedInr),
          })
          .where(eq(profiles.id, targetUser.id))
          .returning();

        const updatedTxRows = await tx
          .update(walletTransactions)
          .set({
            status: 'REJECTED',
            reviewedBy: admin?.email || OWNER_EMAIL,
            reviewedAt: new Date(),
            notes: `Withdrawal rejected by Owner · Refunded +₹${absAmount.toLocaleString(
              'en-IN'
            )} to wallet`,
          })
          .where(eq(walletTransactions.id, withdrawTx.id))
          .returning();

        await tx.insert(transactions).values({
          userId: targetUser.id,
          type: 'REAL_DEPOSIT_UPI',
          amount: Math.round(absAmount),
          description: `Refunded ₹${absAmount.toLocaleString(
            'en-IN'
          )} from rejected UPI withdrawal request`,
        });

        return {
          walletTransaction: updatedTxRows[0],
          updatedUser: normalizeUserProfile(updatedUserRows[0]),
        };
      }
    });
  } catch (error: any) {
    console.error(
      'Database transaction failed in reviewUpiWithdrawalByOwner:',
      error
    );
    throw new Error(error.message || 'Failed to update withdrawal request.', {
      cause: error,
    });
  }
}

export async function getAllWalletTransactionsForAdmin() {
  try {
    await ensureDatabaseSeeded();
    return await db
      .select()
      .from(walletTransactions)
      .orderBy(desc(walletTransactions.createdAt));
  } catch (error) {
    console.error(
      'Database query failed in getAllWalletTransactionsForAdmin:',
      error
    );
    return [];
  }
}

/**
 * 3E. Cryptographic Payment Gateway Verification (`/api/wallet/verify-payment` & Webhook)
 * Verifies Razorpay/Cashfree HMAC-SHA256 signatures before crediting `wallet_balance_inr`.
 */
export async function verifyAndCreditGatewayPayment(params: {
  uid: string;
  email?: string;
  amountInr: number;
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const secret = process.env.PAYMENT_KEY_SECRET;
  if (!secret) {
    throw new Error(
      'PAYMENT_KEY_SECRET is not configured in .env. Please use the Direct Manual UPI QR + 12-Digit UTR flow.'
    );
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  if (expectedSignature !== params.signature) {
    throw new Error('Cryptographic payment signature verification failed.');
  }

  const user = await getUserProfileByUid(params.uid, params.email);
  if (!user) {
    throw new Error('User profile not found.');
  }

  const cleanAmount = Number(Number(params.amountInr || 0).toFixed(2));
  if (cleanAmount < 10) {
    throw new Error('Invalid payment amount.');
  }

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.gatewayPaymentId, params.paymentId));
    if (existing.length > 0) {
      throw new Error('Payment ID already credited.');
    }

    const freshRows = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));
    const freshUser = normalizeUserProfile(freshRows[0] || user);
    const nextWalletInr = Number(
      (freshUser.walletBalanceInr + cleanAmount).toFixed(2)
    );

    const updatedUserRows = await tx
      .update(profiles)
      .set({
        walletBalanceInr: nextWalletInr,
        realMoneyBalance: Math.round(nextWalletInr),
      })
      .where(eq(profiles.id, user.id))
      .returning();

    const insertedTx = await tx
      .insert(walletTransactions)
      .values({
        userId: user.id,
        username: user.username,
        userEmail: user.email,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        amountInr: cleanAmount,
        gatewayOrderId: params.orderId,
        gatewayPaymentId: params.paymentId,
        notes: `Verified UPI Gateway Deposit +₹${cleanAmount.toLocaleString(
          'en-IN'
        )} (Order ${params.orderId})`,
      })
      .returning();

    await tx.insert(transactions).values({
      userId: user.id,
      type: 'REAL_DEPOSIT_UPI',
      amount: Math.round(cleanAmount),
      description: `UPI Gateway Verified: +₹${cleanAmount.toLocaleString(
        'en-IN'
      )} (${params.paymentId})`,
    });

    return {
      user: normalizeUserProfile(updatedUserRows[0]),
      walletTransaction: insertedTx[0],
    };
  });
}
