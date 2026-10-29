import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as dotenv from 'dotenv';
import {
  type AuthRequest,
  createInAppToken,
  requireAuth,
} from './src/middleware/auth.ts';
import {
  claimDailyRefillCoins,
  createInAppInviteCodeByOwner,
  createMarketByCreatorOrAdmin,
  getAllMarkets,
  getAllProfilesWithPositions,
  getAllWalletTransactionsForAdmin,
  getInAppInviteCodes,
  getOwnerMainUpiConfig,
  getUserPortfolio,
  getUserProfileByEmailOrUsername,
  getUserProfileByUid,
  placeTradeAtomic,
  redeemOwnerInviteCode,
  registerOrSyncUser,
  requestCreatorAccess,
  resolveMarketAtomic,
  reviewManualUpiDepositByOwner,
  reviewUpiWithdrawalByOwner,
  sellPositionEarlyAtomic,
  submitManualUpiDepositPending,
  submitRealMoneyInviteRequest,
  submitUpiWithdrawalRequest,
  updateGranularPermissionsByOwner,
  updateOwnerMainUpiByOwner,
  updateRealMoneyStatusByOwner,
  updateRoleByIdentifier,
  updateUserProfile,
  verifyAndCreditGatewayPayment,
} from './src/db/repository.ts';
import {
  DEFAULT_OWNER_INVITE_CODE,
  DEFAULT_OWNER_UPI_ID,
  DEFAULT_OWNER_UPI_NAME,
  isOwnerEmail,
} from './src/utils/marketMath.ts';
import { buildPredictorPayload } from './src/utils/predictorPrivacy.ts';

dotenv.config();

function isProductionAuthEnvironment() {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start' ||
    process.cwd().startsWith('/srv')
  );
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(
    express.json({
      verify: (req, _res, buffer) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(
          buffer
        );
      },
    })
  );

  // Predictor lists are public-facing by default. Only a verified owner session
  // may also receive the full directory needed by the admin workflow.
  app.use((req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = ((body?: any) => {
      if (body && Array.isArray(body.predictors)) {
        const email = (req as AuthRequest).user?.email;
        const ownerSession = Boolean(email && isOwnerEmail(email));
        const publicBody = { ...body };
        delete publicBody.adminPredictors;
        body = {
          ...publicBody,
          ...buildPredictorPayload(body.predictors, ownerSession),
        };
      }
      return sendJson(body);
    }) as typeof res.json;
    next();
  });

  // Healthcheck endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'Up & Down' });
  });

  // 1. Public: Get all markets
  app.get('/api/markets', async (_req, res) => {
    try {
      const allMarkets = await getAllMarkets();
      res.json({ markets: allMarkets });
    } catch (error: any) {
      console.error('Failed to fetch markets:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch markets' });
    }
  });

  // 2. Public: Get Leaderboard data, Owner Main UPI config, & In-App Invite Codes
  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const [predictors, ownerUpiCfg] = await Promise.all([
        getAllProfilesWithPositions(),
        getOwnerMainUpiConfig(),
      ]);
      res.json({
        ...buildPredictorPayload(predictors),
        inAppInviteCodes: getInAppInviteCodes(),
        upiConfig: {
          ownerUpiId: ownerUpiCfg.ownerUpiId || DEFAULT_OWNER_UPI_ID,
          ownerUpiName: ownerUpiCfg.ownerUpiName || DEFAULT_OWNER_UPI_NAME,
          gatewayEnabled:
            process.env.PAYMENT_GATEWAY_ENABLED === 'true' &&
            Boolean(process.env.PAYMENT_KEY_ID && process.env.PAYMENT_KEY_SECRET),
          paymentKeyId: process.env.PAYMENT_KEY_ID || '',
        },
      });
    } catch (error: any) {
      console.error('Failed to fetch leaderboard:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch leaderboard' });
    }
  });

  // 3. Public: Get complete supabase/schema.sql deliverable content
  app.get('/api/schema-sql', (_req, res) => {
    try {
      const sqlPath = path.resolve(process.cwd(), 'supabase/schema.sql');
      const content = fs.readFileSync(sqlPath, 'utf-8');
      res.json({ sql: content });
    } catch (error) {
      console.error('Failed to read supabase/schema.sql:', error);
      res.status(500).json({ error: 'Could not read supabase/schema.sql' });
    }
  });

  // 4. In-App Browser Proof Auth: Email + Password Sign-Up
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const {
        email,
        password,
        username,
        collegeName,
        referredBy,
        inviteCode,
        requestCreatorInvite,
      } = req.body || {};
      if (!email || !username || !password || !collegeName) {
        return res.status(400).json({
          error: 'Please fill in User ID, College, Email, and Password.',
        });
      }

      const existing = await getUserProfileByEmailOrUsername(email);
      if (existing) {
        return res.status(400).json({
          error:
            'An account with this email already exists. Sign in with its password or verified Google account.',
        });
      }

      const existingUser = await getUserProfileByEmailOrUsername(username);
      if (existingUser) {
        return res.status(400).json({
          error: 'That User ID (@username) is already taken. Try another handle!',
        });
      }

      const uid = `inapp-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      let profile = await registerOrSyncUser({
        uid,
        email,
        username,
        passwordHash: password,
        collegeName,
        referredBy,
        inviteCode,
        requestCreatorInvite: Boolean(requestCreatorInvite),
      });

      if (username && username.trim()) {
        try {
          profile = await updateUserProfile({
            uid: profile.uid,
            email: profile.email,
            username: username.trim(),
            collegeName,
          });
        } catch {
          // Keep existing username if conflict
        }
      }

      const token = createInAppToken({
        uid: profile.uid,
        email: profile.email,
        username: profile.username,
      });

      const portfolio = await getUserPortfolio(profile.id);
      res.json({
        user: profile,
        token,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(400).json({ error: error.message || 'Failed to sign up' });
    }
  });

  // 5. In-App Browser Proof Auth: Email / Username + Password Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const {
        identifier,
        password,
        requestCreatorInvite,
      } = req.body || {};
      if (!identifier) {
        return res
          .status(400)
          .json({ error: 'Please enter your email or User ID.' });
      }

      let profile = await getUserProfileByEmailOrUsername(identifier);
      if (!profile) {
        return res.status(404).json({
          error:
            'No account found with that email or User ID. Sign up to create your account!',
        });
      }

      if (typeof password !== 'string' || password.length === 0) {
        return res
          .status(401)
          .json({ error: 'A valid password is required.' });
      }

      const productionAuth = isProductionAuthEnvironment();
      const isOwnerAccount = isOwnerEmail(profile.email);
      const ownerLoginPassword = process.env.OWNER_LOGIN_PASSWORD;
      if (
        productionAuth &&
        isOwnerAccount &&
        (!ownerLoginPassword || ownerLoginPassword.length < 16)
      ) {
        return res.status(503).json({
          error:
            'Owner password sign-in is disabled until a strong OWNER_LOGIN_PASSWORD is configured; verified Google Sign-In remains available.',
        });
      }

      const usesSeedPassword = ['campus123', 'demo_pass'].includes(
        profile.passwordHash
      );
      if (
        productionAuth &&
        ((profile.uid.startsWith('seed-') && usesSeedPassword) ||
          (!isOwnerAccount && usesSeedPassword))
      ) {
        return res.status(403).json({
          error:
            'This seeded/demo account cannot use its default password in production.',
        });
      }

      const expectedPassword =
        productionAuth && isOwnerAccount
          ? ownerLoginPassword!
          : profile.passwordHash;
      const suppliedPasswordBytes = Buffer.from(password, 'utf8');
      const expectedPasswordBytes = Buffer.from(expectedPassword, 'utf8');
      if (
        suppliedPasswordBytes.length !== expectedPasswordBytes.length ||
        !crypto.timingSafeEqual(suppliedPasswordBytes, expectedPasswordBytes)
      ) {
        return res
          .status(401)
          .json({ error: 'Incorrect password. Please try again.' });
      }

      if (requestCreatorInvite && profile.role === 'user') {
        try {
          profile = await requestCreatorAccess(profile.uid, profile.email);
        } catch {
          // Keep existing profile if update fails
        }
      }

      const token = createInAppToken({
        uid: profile.uid,
        email: profile.email,
        username: profile.username,
      });

      const portfolio = await getUserPortfolio(profile.id);
      res.json({
        user: profile,
        token,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message || 'Login failed' });
    }
  });

  // 6. Firebase Google Sign-In Sync
  app.post(
    '/api/auth/firebase-sync',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const {
          collegeName,
          referredBy,
          inviteCode,
          username,
          customUsername,
          requestCreatorInvite,
        } = req.body || {};
        const preferredUsername =
          (customUsername && customUsername.trim()) ||
          (username && username.trim()) ||
          req.user.username ||
          req.user.email.split('@')[0] ||
          `campus_${req.user.uid.slice(0, 6)}`;

        let profile = await registerOrSyncUser({
          uid: req.user.uid,
          email: req.user.email,
          username: preferredUsername,
          collegeName: collegeName || 'IIT Bombay',
          referredBy,
          inviteCode,
          requestCreatorInvite: Boolean(requestCreatorInvite),
        });

        if (customUsername && customUsername.trim()) {
          try {
            profile = await updateUserProfile({
              uid: profile.uid,
              email: profile.email,
              username: customUsername.trim(),
              collegeName: collegeName || profile.collegeName,
            });
          } catch {
            // Keep existing username if customUsername had a conflict
          }
        }

        const token = createInAppToken({
          uid: profile.uid,
          email: profile.email,
          username: profile.username,
        });

        const portfolio = await getUserPortfolio(profile.id);
        res.json({
          user: profile,
          token,
          positions: portfolio.positions,
          transactions: portfolio.transactions,
          walletTransactions: portfolio.walletTransactions,
        });
      } catch (error: any) {
        console.error('Firebase sync error:', error);
        res
          .status(500)
          .json({ error: error.message || 'Failed to sync user profile' });
      }
    }
  );

  // 7. Authenticated User Profile + Portfolio + Transactions + Wallet Ledger
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const profile = await getUserProfileByUid(req.user.uid, req.user.email);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      const token = createInAppToken({
        uid: profile.uid,
        email: profile.email,
        username: profile.username,
      });
      const isOwner = isOwnerEmail(profile.email);
      const [
        portfolio,
        adminWalletTransactions,
        ownerUpiConfig,
        adminPredictors,
      ] =
        await Promise.all([
          getUserPortfolio(profile.id),
          isOwner ? getAllWalletTransactionsForAdmin() : Promise.resolve([]),
          getOwnerMainUpiConfig(),
          isOwner ? getAllProfilesWithPositions() : Promise.resolve([]),
        ]);

      res.json({
        user: profile,
        token,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
        adminWalletTransactions,
        ownerUpiId: ownerUpiConfig.ownerUpiId,
        ownerUpiName: ownerUpiConfig.ownerUpiName,
        inviteCodes: getInAppInviteCodes(),
        ...(isOwner ? { adminPredictors } : {}),
      });
    } catch (error: any) {
      console.error('Failed to load /api/me:', error);
      res.status(500).json({ error: error.message || 'Failed to load profile' });
    }
  });

  // 7b. Update Custom User ID (@username) and College Name
  app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { username, collegeName } = req.body || {};
      if (!username || !String(username).trim()) {
        return res
          .status(400)
          .json({ error: 'Please enter a valid User ID (@username).' });
      }

      const updatedUser = await updateUserProfile({
        uid: req.user.uid,
        email: req.user.email,
        username: String(username),
        collegeName: collegeName ? String(collegeName) : undefined,
      });

      const token = createInAppToken({
        uid: updatedUser.uid,
        email: updatedUser.email,
        username: updatedUser.username,
      });

      const predictors = await getAllProfilesWithPositions();
      res.json({
        user: updatedUser,
        token,
        predictors,
      });
    } catch (error: any) {
      console.error('Profile update error:', error);
      res
        .status(400)
        .json({ error: error.message || 'Failed to update User ID' });
    }
  });

  // 7c. Redeem Owner Invite Code (Unlocks `is_community_approved` + `has_payment_and_trading_access`)
  app.post(
    '/api/account/redeem-invite',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { inviteCode } = req.body || {};
        const updatedUser = await redeemOwnerInviteCode({
          uid: req.user.uid,
          email: req.user.email,
          inviteCode: String(inviteCode || ''),
        });
        const predictors = await getAllProfilesWithPositions();
        res.json({
          user: updatedUser,
          predictors,
          inAppInviteCodes: getInAppInviteCodes(),
        });
      } catch (error: any) {
        console.error('Invite code redeem error:', error);
        res
          .status(400)
          .json({ error: error.message || 'Invalid Owner Invite Code' });
      }
    }
  );

  // 8. Place Trade (₹100 Base Fractional & Whole Shares Buy)
  app.post('/api/trade', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { marketId, side, amount, walletType } = req.body || {};
      const numericMarketId = Number(marketId);
      const numericAmount = Number(amount);
      if (
        !Number.isInteger(numericMarketId) ||
        numericMarketId <= 0 ||
        (side !== 'YES' && side !== 'NO') ||
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0 ||
        (walletType !== undefined && !['COINS', 'REAL_INR'].includes(walletType))
      ) {
        return res.status(400).json({ error: 'Invalid trade parameters' });
      }

      const result = await placeTradeAtomic({
        uid: req.user.uid,
        email: req.user.email,
        marketId: numericMarketId,
        side,
        amount: numericAmount,
        walletType: walletType === 'REAL_INR' ? 'REAL_INR' : 'COINS',
      });

      const profile = await getUserProfileByUid(req.user.uid, req.user.email);
      const portfolio = profile
        ? await getUserPortfolio(profile.id)
        : { positions: [], transactions: [], walletTransactions: [] };

      res.json({
        ...result,
        user: profile,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
      });
    } catch (error: any) {
      console.error('Trade error:', error);
      res.status(400).json({ error: error.message || 'Failed to place trade' });
    }
  });

  // 8b. Early Exit (Sell Before Final Result / Profit Booking & Stop-Loss)
  app.post('/api/trade/sell', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { positionId, sharesToSell } = req.body || {};
      const numericPositionId = Number(positionId);
      if (!Number.isInteger(numericPositionId) || numericPositionId <= 0) {
        return res.status(400).json({ error: 'Valid positionId is required' });
      }
      let requestedShares: number | undefined;
      if (sharesToSell !== undefined) {
        requestedShares = Number(sharesToSell);
        if (!Number.isFinite(requestedShares) || requestedShares <= 0) {
          return res.status(400).json({ error: 'sharesToSell must be a positive finite number' });
        }
      }

      const result = await sellPositionEarlyAtomic({
        uid: req.user.uid,
        email: req.user.email,
        positionId: numericPositionId,
        sharesToSell: requestedShares,
      });

      const [profile, allMarkets, predictors] = await Promise.all([
        getUserProfileByUid(req.user.uid, req.user.email),
        getAllMarkets(),
        getAllProfilesWithPositions(),
      ]);
      const portfolio = profile
        ? await getUserPortfolio(profile.id)
        : { positions: [], transactions: [], walletTransactions: [] };

      res.json({
        ...result,
        user: profile,
        markets: allMarkets,
        predictors,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
      });
    } catch (error: any) {
      console.error('Early exit sell error:', error);
      res
        .status(400)
        .json({ error: error.message || 'Failed to execute early exit sell' });
    }
  });

  // 9. Claim Daily 100 Coin Vault Refill Drop (Strictly 1x per 24 hours)
  app.post('/api/vault/refill', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const updatedUser = await claimDailyRefillCoins(
        req.user.uid,
        req.user.email
      );
      const portfolio = await getUserPortfolio(updatedUser.id);
      res.json({
        user: updatedUser,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
      });
    } catch (error: any) {
      console.error('Refill error:', error);
      res
        .status(400)
        .json({ error: error.message || 'Failed to claim vault refill' });
    }
  });

  // 9b. Request Creator / Event Host Access (via Owner Invite Link or Account Hub)
  app.post(
    '/api/account/request-access',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const updatedUser = await requestCreatorAccess(
          req.user.uid,
          req.user.email
        );
        const predictors = await getAllProfilesWithPositions();
        res.json({
          user: updatedUser,
          predictors,
        });
      } catch (error: any) {
        console.error('Request creator access error:', error);
        res.status(400).json({
          error: error.message || 'Failed to request creator access',
        });
      }
    }
  );

  // 10. Create New Market (Owner & `can_create_events` Approved Users Only)
  app.post('/api/admin/markets', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const {
        title,
        category,
        closesAt,
        startingYesProbability,
        resolutionRules,
      } = req.body || {};
      if (!title || !category || !closesAt) {
        return res.status(400).json({
          error: 'Title, category, and closing date are required.',
        });
      }

      const created = await createMarketByCreatorOrAdmin({
        uid: req.user.uid,
        email: req.user.email,
        title,
        category,
        closesAt,
        startingYesProbability: Number(startingYesProbability) || 50,
        resolutionRules: resolutionRules || '',
      });

      const allMarkets = await getAllMarkets();
      res.json({ market: created, markets: allMarkets });
    } catch (error: any) {
      console.error('Create market error:', error);
      res
        .status(403)
        .json({ error: error.message || 'Failed to create market' });
    }
  });

  // 11. Resolve or Cancel Market (Owner & Admin Only - ₹100 per winning share settlement)
  app.post('/api/admin/resolve', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { marketId, resolution } = req.body || {};
      if (!marketId || !['YES', 'NO', 'CANCEL'].includes(resolution)) {
        return res.status(400).json({
          error: 'Valid marketId and resolution (YES, NO, CANCEL) required.',
        });
      }

      const result = await resolveMarketAtomic({
        uid: req.user.uid,
        email: req.user.email,
        marketId: Number(marketId),
        resolution,
      });

      const [allMarkets, predictors, profile] = await Promise.all([
        getAllMarkets(),
        getAllProfilesWithPositions(),
        getUserProfileByUid(req.user.uid, req.user.email),
      ]);
      const portfolio = profile
        ? await getUserPortfolio(profile.id)
        : { positions: [], transactions: [], walletTransactions: [] };

      res.json({
        ...result,
        markets: allMarkets,
        predictors,
        user: profile,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
        walletTransactions: portfolio.walletTransactions,
      });
    } catch (error: any) {
      console.error('Resolve market error:', error);
      res
        .status(403)
        .json({ error: error.message || 'Failed to resolve market' });
    }
  });

  // 12. Granular Owner RBAC Permissions & User Invite Endpoint
  app.post(
    '/api/admin/permissions',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const {
          targetIdentifier,
          isCommunityApproved,
          canCreateEvents,
          hasPaymentAndTradingAccess,
          newRole,
        } = req.body || {};

        if (!targetIdentifier) {
          return res.status(400).json({
            error: 'Please enter a valid @username, email, or user ID.',
          });
        }

        const updatedTarget = await updateGranularPermissionsByOwner({
          adminUid: req.user.uid,
          adminEmail: req.user.email,
          targetIdentifier: String(targetIdentifier),
          isCommunityApproved:
            typeof isCommunityApproved === 'boolean'
              ? isCommunityApproved
              : undefined,
          canCreateEvents:
            typeof canCreateEvents === 'boolean' ? canCreateEvents : undefined,
          hasPaymentAndTradingAccess:
            typeof hasPaymentAndTradingAccess === 'boolean'
              ? hasPaymentAndTradingAccess
              : undefined,
          newRole,
        });

        const predictors = await getAllProfilesWithPositions();
        res.json({ updatedProfile: updatedTarget, predictors });
      } catch (error: any) {
        console.error('Granular permissions update error:', error);
        res.status(403).json({
          error: error.message || 'Failed to update granular permissions',
        });
      }
    }
  );

  // 12b. Legacy Promote User Role Endpoint (Mapped to Granular RBAC)
  app.post('/api/admin/promote', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { targetIdentifier, newRole } = req.body || {};
      if (
        !targetIdentifier ||
        !['user', 'pending_creator', 'creator', 'admin'].includes(newRole)
      ) {
        return res.status(400).json({
          error: 'Valid username/email and target role required.',
        });
      }

      const updatedTarget = await updateRoleByIdentifier({
        adminUid: req.user.uid,
        adminEmail: req.user.email,
        targetIdentifier,
        newRole,
      });

      const predictors = await getAllProfilesWithPositions();
      res.json({ updatedProfile: updatedTarget, predictors });
    } catch (error: any) {
      console.error('Promote user error:', error);
      res.status(403).json({ error: error.message || 'Failed to update role' });
    }
  });

  // 13. Submit Invite-Only Application for Real Money (₹ UPI) Wallet & Betting
  app.post(
    '/api/wallet/upi-invite',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { fullName, upiId, phone, inviteNote } = req.body || {};
        const updatedUser = await submitRealMoneyInviteRequest({
          uid: req.user.uid,
          email: req.user.email,
          fullName: String(fullName || ''),
          upiId: String(upiId || ''),
          phone: String(phone || ''),
          inviteNote: inviteNote ? String(inviteNote) : undefined,
        });

        const predictors = await getAllProfilesWithPositions();
        res.json({ user: updatedUser, predictors });
      } catch (error: any) {
        console.error('Real money invite request error:', error);
        res.status(400).json({
          error:
            error.message || 'Failed to submit Real Money invite application',
        });
      }
    }
  );

  // 14. Owner Approves / Revokes Real Money (₹ UPI) Wallet & Betting Access
  app.post(
    '/api/admin/real-money-approve',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { targetIdentifier, status } = req.body || {};
        if (
          !targetIdentifier ||
          !['none', 'pending', 'approved', 'rejected'].includes(status)
        ) {
          return res.status(400).json({
            error: 'Valid username/email and status required.',
          });
        }

        const updatedTarget = await updateRealMoneyStatusByOwner({
          adminUid: req.user.uid,
          adminEmail: req.user.email,
          targetIdentifier: String(targetIdentifier),
          status,
        });

        const predictors = await getAllProfilesWithPositions();
        res.json({ updatedProfile: updatedTarget, predictors });
      } catch (error: any) {
        console.error('Real money approval error:', error);
        res.status(403).json({
          error: error.message || 'Failed to update Real Money UPI status',
        });
      }
    }
  );

  // 14b. Owner Generates Self-Contained In-App Invite Code
  app.post(
    '/api/admin/invite-codes',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const {
          customCode,
          code,
          label,
          isCommunityApproved,
          canCreateEvents,
          hasPaymentAndTradingAccess,
        } = req.body || {};

        const codes = await createInAppInviteCodeByOwner({
          adminUid: req.user.uid,
          adminEmail: req.user.email,
          customCode:
            customCode || code ? String(customCode || code) : undefined,
          label: label ? String(label) : undefined,
          isCommunityApproved:
            typeof isCommunityApproved === 'boolean'
              ? isCommunityApproved
              : true,
          canCreateEvents: Boolean(canCreateEvents),
          hasPaymentAndTradingAccess:
            typeof hasPaymentAndTradingAccess === 'boolean'
              ? hasPaymentAndTradingAccess
              : true,
        });

        res.json({ inAppInviteCodes: codes });
      } catch (error: any) {
        console.error('Create invite code error:', error);
        res.status(403).json({
          error: error.message || 'Failed to generate in-app invite code',
        });
      }
    }
  );

  // 14c. Owner Updates Main Receiving UPI ID
  app.post(
    '/api/admin/owner-upi',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { newOwnerUpiId, ownerUpiId } = req.body || {};
        const updatedUpi = await updateOwnerMainUpiByOwner({
          adminUid: req.user.uid,
          adminEmail: req.user.email,
          newOwnerUpiId: String(newOwnerUpiId || ownerUpiId || ''),
        });
        res.json({
          upiConfig: updatedUpi,
          ownerUpiId: updatedUpi.ownerUpiId,
          ownerUpiName: updatedUpi.ownerUpiName,
        });
      } catch (error: any) {
        console.error('Update owner UPI error:', error);
        res.status(403).json({
          error: error.message || 'Failed to update Owner Main UPI ID',
        });
      }
    }
  );

  // 15. Manual UPI deposit claim. Credits nothing until owner verifies the incoming transfer.
  app.post(
    '/api/wallet/upi-deposit',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { amountInr, utrNumber, upiId, paymentApp } = req.body || {};
        const result = await submitManualUpiDepositPending({
          uid: req.user.uid,
          email: req.user.email,
          amountInr: Number(amountInr),
          utrNumber: String(utrNumber || ''),
          senderUpiId: upiId ? String(upiId) : undefined,
          paymentApp: paymentApp ? String(paymentApp) : 'UPI',
        });

        const [portfolio, predictors] = await Promise.all([
          getUserPortfolio(result.user.id),
          getAllProfilesWithPositions(),
        ]);

        res.json({
          user: result.user,
          walletTransaction: result.walletTransaction,
          utrNumber: result.utrNumber,
          addedInr: result.addedInr,
          requestedInr: result.pendingAmountInr,
          pendingAmountInr: result.pendingAmountInr,
          status: result.walletTransaction?.status || 'PENDING',
          ownerUpiId: result.ownerUpiId,
          positions: portfolio.positions,
          transactions: portfolio.transactions,
          walletTransactions: portfolio.walletTransactions,
          predictors,
        });
      } catch (error: any) {
        console.error('Manual UPI deposit submission error:', error);
        res
          .status(400)
          .json({ error: error.message || 'Failed to add funds via Owner UPI' });
      }
    }
  );

  // 15b. Owner Admin Panel: Approve or Reject/Reverse Manual UPI Deposit
  app.post(
    '/api/admin/wallet/deposit-review',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { walletTransactionId, transactionId, decision } = req.body || {};
        const txId = Number(walletTransactionId || transactionId || 0);
        if (!txId || !['APPROVED', 'REJECTED'].includes(decision)) {
          return res.status(400).json({
            error:
              'Valid transactionId and decision (APPROVED or REJECTED) required.',
          });
        }

        const result = await reviewManualUpiDepositByOwner({
          adminUid: req.user.uid,
          adminEmail: req.user.email,
          walletTransactionId: txId,
          decision,
        });

        const [adminProfile, predictors, adminWalletTransactions] =
          await Promise.all([
            getUserProfileByUid(req.user.uid, req.user.email),
            getAllProfilesWithPositions(),
            getAllWalletTransactionsForAdmin(),
          ]);
        const portfolio = adminProfile
          ? await getUserPortfolio(adminProfile.id)
          : { positions: [], transactions: [], walletTransactions: [] };

        res.json({
          ...result,
          user: adminProfile,
          positions: portfolio.positions,
          transactions: portfolio.transactions,
          walletTransactions: portfolio.walletTransactions,
          adminWalletTransactions,
          predictors,
        });
      } catch (error: any) {
        console.error('Admin deposit review error:', error);
        res.status(403).json({
          error: error.message || 'Failed to review deposit',
        });
      }
    }
  );

  // 16. Withdrawal Request System: Submit UPI ID to Request Payout (Saved as PENDING for Owner Manual UPI Transfer)
  app.post(
    '/api/wallet/upi-withdraw',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { amountInr, upiId } = req.body || {};
        const result = await submitUpiWithdrawalRequest({
          uid: req.user.uid,
          email: req.user.email,
          amountInr: Number(amountInr),
          upiId: String(upiId || ''),
        });

        const [portfolio, predictors] = await Promise.all([
          getUserPortfolio(result.user.id),
          getAllProfilesWithPositions(),
        ]);

        res.json({
          user: result.user,
          walletTransaction: result.walletTransaction,
          withdrawnInr: result.withdrawnInr,
          positions: portfolio.positions,
          transactions: portfolio.transactions,
          walletTransactions: portfolio.walletTransactions,
          predictors,
        });
      } catch (error: any) {
        console.error('UPI withdrawal request error:', error);
        res.status(400).json({
          error: error.message || 'Failed to submit withdrawal request',
        });
      }
    }
  );

  // 16b. Owner Admin Panel: Mark Withdrawal Request Completed (or Reject & Refund)
  app.post(
    '/api/admin/wallet/withdraw-review',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const {
          walletTransactionId,
          transactionId,
          decision,
          payoutUtrNumber,
        } = req.body || {};
        const txId = Number(walletTransactionId || transactionId || 0);
        if (!txId || !['COMPLETED', 'REJECTED'].includes(decision)) {
          return res.status(400).json({
            error:
              'Valid transactionId and decision (COMPLETED or REJECTED) required.',
          });
        }

        const result = await reviewUpiWithdrawalByOwner({
          adminUid: req.user.uid,
          adminEmail: req.user.email,
          walletTransactionId: txId,
          decision,
          payoutUtrNumber: payoutUtrNumber
            ? String(payoutUtrNumber)
            : undefined,
        });

        const [adminProfile, predictors, adminWalletTransactions] =
          await Promise.all([
            getUserProfileByUid(req.user.uid, req.user.email),
            getAllProfilesWithPositions(),
            getAllWalletTransactionsForAdmin(),
          ]);
        const portfolio = adminProfile
          ? await getUserPortfolio(adminProfile.id)
          : { positions: [], transactions: [], walletTransactions: [] };

        res.json({
          ...result,
          user: adminProfile,
          positions: portfolio.positions,
          transactions: portfolio.transactions,
          walletTransactions: portfolio.walletTransactions,
          adminWalletTransactions,
          predictors,
        });
      } catch (error: any) {
        console.error('Admin withdrawal review error:', error);
        res.status(403).json({
          error: error.message || 'Failed to update withdrawal request',
        });
      }
    }
  );

  // 17. Cryptographic UPI Payment Gateway Signature Verification (`/api/wallet/verify-payment`)
  app.post(
    '/api/wallet/verify-payment',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { amountInr, orderId, paymentId, signature } = req.body || {};
        const result = await verifyAndCreditGatewayPayment({
          uid: req.user.uid,
          email: req.user.email,
          amountInr: Number(amountInr),
          orderId: String(orderId || ''),
          paymentId: String(paymentId || ''),
          signature: String(signature || ''),
        });
        const portfolio = await getUserPortfolio(result.user.id);
        res.json({
          user: result.user,
          walletTransaction: result.walletTransaction,
          positions: portfolio.positions,
          transactions: portfolio.transactions,
          walletTransactions: portfolio.walletTransactions,
        });
      } catch (error: any) {
        console.error('Gateway payment verification error:', error);
        res.status(400).json({
          error: error.message || 'Payment signature verification failed',
        });
      }
    }
  );

  // 18. Cryptographic Webhook Endpoint for `payment.captured` (`/api/wallet/webhook`)
  app.post('/api/wallet/webhook', async (req, res) => {
    try {
      const webhookSecret = process.env.WEBHOOK_SECRET;
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = (req as AuthRequest & { rawBody?: Buffer }).rawBody;
      if (!webhookSecret || !signature || !rawBody) {
        return res
          .status(400)
          .json({ error: 'Missing WEBHOOK_SECRET or signature header' });
      }
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
      if (!/^[a-f0-9]{64}$/i.test(signature)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      const expectedBytes = Buffer.from(expectedSig, 'hex');
      const providedBytes = Buffer.from(signature, 'hex');
      if (
        expectedBytes.length !== providedBytes.length ||
        !crypto.timingSafeEqual(expectedBytes, providedBytes)
      ) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      // A valid signature is acknowledged only; this endpoint does not credit wallets.
      res.json({ received: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Webhook error' });
    }
  });

  const distPath = path.join(process.cwd(), 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isTsxDevRuntime =
    process.execArgv.some((arg) => arg.includes('tsx')) ||
    Boolean(process.env._ && process.env._.includes('tsx'));
  const isProductionRuntime =
    process.env.NODE_ENV === 'production' ||
    process.cwd().startsWith('/srv') ||
    process.env.npm_lifecycle_event === 'start' ||
    (!isTsxDevRuntime && hasBuiltDist);

  if (!isProductionRuntime) {
    const vitePromise = import('vite')
      .then(({ createServer }) =>
        createServer({
          server: { middlewareMode: true, allowedHosts: true },
          appType: 'spa',
        })
      )
      .catch((err) => {
        console.error(
          'Vite dev server initialization error, falling back to static dist if available:',
          err
        );
        return null;
      });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        if (vite) {
          vite.middlewares(req, res, next);
        } else if (hasBuiltDist) {
          express.static(distPath)(req, res, () => {
            res.sendFile(path.join(distPath, 'index.html'));
          });
        } else {
          next();
        }
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Up & Down server running on http://localhost:${PORT}`);
  });
}

startServer();
