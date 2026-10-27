import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import {
  AuthRequest,
  createInAppToken,
  requireAuth,
} from './src/middleware/auth.ts';
import {
  claimDailyRefillCoins,
  createMarketByCreatorOrAdmin,
  getAllMarkets,
  getAllProfilesWithPositions,
  getUserPortfolio,
  getUserProfileByEmailOrUsername,
  getUserProfileByUid,
  placeTradeAtomic,
  registerOrSyncUser,
  resolveMarketAtomic,
  selfSwitchDemoRole,
  updateRoleByIdentifier,
} from './src/db/repository.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Healthcheck endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'Up & Down' });
  });

  // 1. Public: Get all markets (Zero Sign-In Wall)
  app.get('/api/markets', async (_req, res) => {
    try {
      const allMarkets = await getAllMarkets();
      res.json({ markets: allMarkets });
    } catch (error: any) {
      console.error('Failed to fetch markets:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch markets' });
    }
  });

  // 2. Public: Get Leaderboard data (Top Predictors & College Wars)
  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const predictors = await getAllProfilesWithPositions();
      res.json({ predictors });
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
      const { email, password, username, collegeName, referredBy } = req.body || {};
      if (!email || !username || !password || !collegeName) {
        return res.status(400).json({
          error: 'Please fill in Username, College, Email, and Password.',
        });
      }

      const existing = await getUserProfileByEmailOrUsername(email);
      if (existing) {
        return res.status(400).json({
          error: 'An account with this email already exists. Please log in instead.',
        });
      }

      const existingUser = await getUserProfileByEmailOrUsername(username);
      if (existingUser) {
        return res.status(400).json({
          error: 'That username is already taken. Try another handle!',
        });
      }

      const uid = `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const profile = await registerOrSyncUser({
        uid,
        email,
        username,
        passwordHash: password,
        collegeName,
        referredBy,
      });

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
      });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(400).json({ error: error.message || 'Failed to sign up' });
    }
  });

  // 5. In-App Browser Proof Auth: Email / Username + Password Login (or Demo Quick Login)
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { identifier, password, isDemoQuickLogin } = req.body || {};
      if (!identifier) {
        return res.status(400).json({ error: 'Please enter your email or username.' });
      }

      const profile = await getUserProfileByEmailOrUsername(identifier);
      if (!profile) {
        return res.status(404).json({
          error: 'No account found with that email or username. Sign up to claim 1,000 Free Coins!',
        });
      }

      if (
        !isDemoQuickLogin &&
        password &&
        profile.passwordHash !== password &&
        profile.passwordHash !== 'demo_pass'
      ) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
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
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message || 'Login failed' });
    }
  });

  // 6. Firebase Google Sign-In Sync
  app.post('/api/auth/firebase-sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { collegeName, referredBy, username } = req.body || {};
      const derivedUsername =
        username ||
        req.user.username ||
        req.user.email.split('@')[0] ||
        `campus_${req.user.uid.slice(0, 6)}`;

      const profile = await registerOrSyncUser({
        uid: req.user.uid,
        email: req.user.email,
        username: derivedUsername,
        collegeName: collegeName || 'IIT Bombay',
        referredBy,
      });

      const portfolio = await getUserPortfolio(profile.id);
      res.json({
        user: profile,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
      });
    } catch (error: any) {
      console.error('Firebase sync error:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user profile' });
    }
  });

  // 7. Authenticated User Profile + Portfolio + Transactions
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const profile = await getUserProfileByUid(req.user.uid, req.user.email);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      const portfolio = await getUserPortfolio(profile.id);
      res.json({
        user: profile,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
      });
    } catch (error: any) {
      console.error('Failed to load /api/me:', error);
      res.status(500).json({ error: error.message || 'Failed to load profile' });
    }
  });

  // 8. Place Trade (Atomic balance deduction, pool shift & share creation)
  app.post('/api/trade', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { marketId, side, amount } = req.body || {};
      if (!marketId || (side !== 'YES' && side !== 'NO') || !amount) {
        return res.status(400).json({ error: 'Invalid trade parameters' });
      }

      const result = await placeTradeAtomic({
        uid: req.user.uid,
        email: req.user.email,
        marketId: Number(marketId),
        side,
        amount: Number(amount),
      });

      const profile = await getUserProfileByUid(req.user.uid, req.user.email);
      const portfolio = profile
        ? await getUserPortfolio(profile.id)
        : { positions: [], transactions: [] };

      res.json({
        ...result,
        user: profile,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
      });
    } catch (error: any) {
      console.error('Trade error:', error);
      res.status(400).json({ error: error.message || 'Failed to place trade' });
    }
  });

  // 9. Claim Daily 100 Coin Vault Refill Drop
  app.post('/api/vault/refill', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const updatedUser = await claimDailyRefillCoins(req.user.uid, req.user.email);
      const portfolio = await getUserPortfolio(updatedUser.id);
      res.json({
        user: updatedUser,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
      });
    } catch (error: any) {
      console.error('Refill error:', error);
      res.status(400).json({ error: error.message || 'Failed to claim vault refill' });
    }
  });

  // 10. Create New Market (Admin & Verified Community Creators Only)
  app.post('/api/admin/markets', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { title, category, closesAt, startingYesProbability, resolutionRules } =
        req.body || {};
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
      res.status(403).json({ error: error.message || 'Failed to create market' });
    }
  });

  // 11. Resolve or Cancel Market (Admin Only)
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

      const allMarkets = await getAllMarkets();
      const profile = await getUserProfileByUid(req.user.uid, req.user.email);
      const portfolio = profile
        ? await getUserPortfolio(profile.id)
        : { positions: [], transactions: [] };

      res.json({
        ...result,
        markets: allMarkets,
        user: profile,
        positions: portfolio.positions,
        transactions: portfolio.transactions,
      });
    } catch (error: any) {
      console.error('Resolve market error:', error);
      res.status(403).json({ error: error.message || 'Failed to resolve market' });
    }
  });

  // 12. Promote User Role (Admin Only - Community Creator Manager)
  app.post('/api/admin/promote', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { targetIdentifier, newRole } = req.body || {};
      if (!targetIdentifier || !['user', 'creator', 'admin'].includes(newRole)) {
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
      res.status(400).json({ error: error.message || 'Failed to update role' });
    }
  });

  // 13. Demo Role Switcher (For testing User / Creator / Admin Studio flows seamlessly)
  app.post('/api/demo/role', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { role } = req.body || {};
      if (!['user', 'creator', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      const updated = await selfSwitchDemoRole(req.user.uid, role, req.user.email);
      res.json({ user: updated });
    } catch (error: any) {
      console.error('Role switch error:', error);
      res.status(400).json({ error: error.message || 'Failed to switch role' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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
