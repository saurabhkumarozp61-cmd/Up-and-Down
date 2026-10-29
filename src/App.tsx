/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  TrendingUp,
  Trophy,
  Briefcase,
  Coins,
  Search,
  Gift,
  Sparkles,
  User,
  Clock,
  Sun,
  Moon,
  IndianRupee,
  Lock,
  KeyRound,
  RefreshCw,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import {
  MarketCategory,
  MarketItem,
  PositionItem,
  TransactionItem,
  UserProfile,
  UserRole,
  FlexCardData,
  WalletTransactionItem,
} from './types.ts';
import {
  calculateMarketPrices,
  calculateTradePreview,
  checkDailyClaimEligibility,
  DEFAULT_OWNER_UPI_ID,
  DEFAULT_OWNER_UPI_NAME,
  isCommunityApprovedUser,
  isOwnerEmail,
  isRealMoneyEligible,
  OWNER_EMAIL,
  RealMoneyAccessStatus,
  TradeSide,
  WalletMode,
} from './utils/marketMath.ts';
import { MarketCard } from './components/MarketCard.tsx';
import { TradeSheetModal } from './components/TradeSheetModal.tsx';
import { AuthSheetModal } from './components/AuthSheetModal.tsx';
import { FlexCardModal } from './components/FlexCardModal.tsx';
import { LeaderboardView } from './components/LeaderboardView.tsx';
import { PortfolioView } from './components/PortfolioView.tsx';
import {
  AdminStudioView,
  type AccountPredictorEntry,
} from './components/AdminStudioView.tsx';
import { UpiWalletModal } from './components/UpiWalletModal.tsx';

type NavTab = 'markets' | 'leaderboard' | 'portfolio' | 'account';

const CATEGORIES: MarketCategory[] = [
  'All',
  'Cricket & Sports',
  'Campus Gossip',
  'Pop-Culture & Creators',
  'Tech & Finance',
];

const AUTH_TOKEN_KEY = 'updown_auth_token';
const THEME_STORAGE_KEY = 'updown_theme';

export default function App() {
  // Detect ?ref=username referral query parameter and ?invite=creator Owner invite parameter
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialReferral = useMemo(() => urlParams.get('ref') || '', [urlParams]);
  const hasCreatorInvite = useMemo(
    () =>
      urlParams.get('invite') === 'creator' ||
      urlParams.get('invite') === 'admin' ||
      urlParams.get('admin_invite') === '1',
    [urlParams]
  );

  // Theme State (Polymarket-inspired dark market board, with an optional light theme)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage errors
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // ignore storage errors
    }
  }, [themeMode]);

  const handleToggleTheme = () => {
    setThemeMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<NavTab>(() =>
    hasCreatorInvite ? 'account' : 'markets'
  );
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Data State
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [predictors, setPredictors] = useState<AccountPredictorEntry[]>([]);
  const [adminPredictors, setAdminPredictors] = useState<AccountPredictorEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Auth & User State
  const tokenRef = useRef<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<
    WalletTransactionItem[]
  >([]);
  const [adminWalletTransactions, setAdminWalletTransactions] = useState<
    WalletTransactionItem[]
  >([]);
  const [ownerUpiId, setOwnerUpiId] = useState<string>(DEFAULT_OWNER_UPI_ID);
  const [ownerUpiName, setOwnerUpiName] = useState<string>(
    DEFAULT_OWNER_UPI_NAME
  );
  const [inAppInviteCodes, setInAppInviteCodes] = useState<
    Array<{
      code: string;
      label: string;
      isCommunityApproved: boolean;
      canCreateEvents: boolean;
      hasPaymentAndTradingAccess: boolean;
    }>
  >([]);

  // Invite-Only Waiting Gate State (for uninvited new users)
  const [inviteCodeInput, setInviteCodeInput] = useState<string>('');
  const [inviteGateMessage, setInviteGateMessage] = useState<string | null>(
    null
  );
  const [inviteGateError, setInviteGateError] = useState<string | null>(null);
  const [isRedeemingCode, setIsRedeemingCode] = useState<boolean>(false);

  // Modals & Action State
  const [selectedMarket, setSelectedMarket] = useState<MarketItem | null>(null);
  const [selectedSide, setSelectedSide] = useState<TradeSide>('YES');
  const [selectedWalletType, setSelectedWalletType] =
    useState<WalletMode>('COINS');
  const [selectedInitialAmount, setSelectedInitialAmount] =
    useState<number>(200);
  const [pendingTradeAfterAuth, setPendingTradeAfterAuth] = useState<{
    market: MarketItem;
    side: TradeSide;
  } | null>(null);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [isUpiWalletOpen, setIsUpiWalletOpen] = useState(false);

  const [tradeError, setTradeError] = useState<string | null>(null);
  const [isTradeSubmitting, setIsTradeSubmitting] = useState(false);
  const [isClaimingRefill, setIsClaimingRefill] = useState(false);

  const [flexCardData, setFlexCardData] = useState<FlexCardData | null>(null);

  const saveToken = (token: string | null) => {
    tokenRef.current = token;
    try {
      if (token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        window.localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const applySessionPayload = (data: any) => {
    if (data.token) saveToken(data.token);
    if (data.user) {
      setUser(data.user);
      if (!isOwnerEmail(data.user.email || '')) setAdminPredictors([]);
    }
    if (Array.isArray(data.adminPredictors))
      setAdminPredictors(data.adminPredictors);
    if (Array.isArray(data.predictors)) setPredictors(data.predictors);
    if (data.positions) setPositions(data.positions);
    if (data.transactions) setTransactions(data.transactions);
    if (data.walletTransactions) setWalletTransactions(data.walletTransactions);
    if (data.adminWalletTransactions)
      setAdminWalletTransactions(data.adminWalletTransactions);
    if (data.ownerUpiId) setOwnerUpiId(data.ownerUpiId);
    if (data.ownerUpiName) setOwnerUpiName(data.ownerUpiName);
    if (data.upiConfig?.ownerUpiId) setOwnerUpiId(data.upiConfig.ownerUpiId);
    if (data.upiConfig?.ownerUpiName)
      setOwnerUpiName(data.upiConfig.ownerUpiName);
    if (data.inAppInviteCodes) setInAppInviteCodes(data.inAppInviteCodes);
    if (data.inviteCodes) setInAppInviteCodes(data.inviteCodes);
  };

  const fetchPublicData = useCallback(async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        fetch('/api/markets'),
        fetch('/api/leaderboard'),
      ]);
      if (mRes.ok) {
        const mData = await mRes.json();
        setMarkets(mData.markets || []);
      }
      if (lRes.ok) {
        const lData = await lRes.json();
        setPredictors(lData.predictors || []);
        if (lData.upiConfig?.ownerUpiId)
          setOwnerUpiId(lData.upiConfig.ownerUpiId);
        if (lData.upiConfig?.ownerUpiName)
          setOwnerUpiName(lData.upiConfig.ownerUpiName);
        if (lData.inAppInviteCodes)
          setInAppInviteCodes(lData.inAppInviteCodes);
      }
    } catch (err) {
      console.error('Error loading public market feed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const activeToken = tokenRef.current;
    if (!activeToken) return;
    try {
      const [meRes, lRes] = await Promise.all([
        fetch('/api/me', {
          headers: { Authorization: `Bearer ${activeToken}` },
        }),
        fetch('/api/leaderboard'),
      ]);
      if (meRes.ok) {
        const meData = await meRes.json();
        applySessionPayload(meData);
      } else if (meRes.status === 401) {
        saveToken(null);
        setUser(null);
        setAdminWalletTransactions([]);
        setAdminPredictors([]);
      }
      if (lRes.ok) {
        const lData = await lRes.json();
        setPredictors(lData.predictors || []);
        if (lData.upiConfig?.ownerUpiId)
          setOwnerUpiId(lData.upiConfig.ownerUpiId);
        if (lData.inAppInviteCodes)
          setInAppInviteCodes(lData.inAppInviteCodes);
      }
    } catch (err) {
      console.error('Error refreshing user session:', err);
    }
  }, []);

  // Initial load: fetch public markets & restore saved session token if present
  useEffect(() => {
    fetchPublicData();
    try {
      const savedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (savedToken) {
        tokenRef.current = savedToken;
        refreshCurrentUser();
      }
    } catch {
      // ignore storage errors
    }
  }, [fetchPublicData, refreshCurrentUser]);

  // Keep Account & Creator/Admin approval status live-synced when viewing Account tab
  useEffect(() => {
    if (activeTab === 'account') {
      fetchPublicData();
      if (tokenRef.current) {
        refreshCurrentUser();
      }
      const interval = window.setInterval(() => {
        if (tokenRef.current) {
          refreshCurrentUser();
        } else {
          fetchPublicData();
        }
      }, 5000);
      return () => window.clearInterval(interval);
    }
  }, [activeTab, fetchPublicData, refreshCurrentUser]);

  // Filtered Markets
  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      const matchesCat =
        selectedCategory === 'All' || m.category === selectedCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        m.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [markets, selectedCategory, searchQuery]);

  // Handlers: Buy YES / Buy NO click on MarketCard
  const handleSelectTrade = (market: MarketItem, side: TradeSide) => {
    setTradeError(null);
    if (!user) {
      setPendingTradeAfterAuth({ market, side });
      setAuthError(null);
      setIsAuthOpen(true);
      return;
    }
    setSelectedWalletType('COINS');
    setSelectedInitialAmount(200);
    setSelectedMarket(market);
    setSelectedSide(side);
  };

  // Handler: Share Market Flex Card
  const handleShareMarket = (market: MarketItem) => {
    const { yesPrice } = calculateMarketPrices(market.yesPool, market.noPool);
    const preview = calculateTradePreview(market.yesPool, market.noPool, 'YES', 200);
    setFlexCardData({
      marketId: market.id,
      marketTitle: market.title,
      category: market.category,
      side: 'YES',
      entryOdds: yesPrice,
      investedCoins: 200,
      potentialPayout: preview.potentialPayout,
      returnPercentage: preview.returnPercentage,
      username: user ? user.username : 'campus_predictor',
      collegeName: user ? user.collegeName : 'IIT Bombay',
    });
  };

  // Handler: Bottom Nav Tab Switch
  const handleNavClick = (tab: NavTab) => {
    if (tab === 'portfolio' && !user) {
      setAuthError(null);
      setIsAuthOpen(true);
      setActiveTab('portfolio');
      return;
    }
    setActiveTab(tab);
  };

  // Auth: Email + Password Signup
  const handleSignup = async (payload: {
    username: string;
    collegeName: string;
    email: string;
    password: string;
    referredBy?: string;
    requestCreatorInvite?: boolean;
  }) => {
    setAuthError(null);
    setIsAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      applySessionPayload(data);
      setIsAuthOpen(false);

      if (pendingTradeAfterAuth && isCommunityApprovedUser(data.user)) {
        setSelectedMarket(pendingTradeAfterAuth.market);
        setSelectedSide(pendingTradeAfterAuth.side);
        setPendingTradeAfterAuth(null);
      }

      await fetchPublicData();
    } catch (err: any) {
      setAuthError(err.message || 'Could not create account');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  // Auth: Email / Username + Password Login
  const handleLogin = async (
    identifier: string,
    password: string,
    requestCreatorInvite = false
  ) => {
    setAuthError(null);
    setIsAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          password,
          requestCreatorInvite,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      applySessionPayload(data);
      setIsAuthOpen(false);

      if (pendingTradeAfterAuth && isCommunityApprovedUser(data.user)) {
        setSelectedMarket(pendingTradeAfterAuth.market);
        setSelectedSide(pendingTradeAfterAuth.side);
        setPendingTradeAfterAuth(null);
      }

      await fetchPublicData();
      await refreshCurrentUser();
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  // Auth: Firebase Google Sign-In Popup
  const handleGoogleLogin = async (
    collegeName: string,
    referredBy?: string,
    customUsername?: string,
    requestCreatorInvite?: boolean
  ) => {
    setAuthError(null);
    setIsAuthSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      saveToken(idToken);

      const res = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          collegeName,
          referredBy,
          customUsername,
          requestCreatorInvite,
          username: cred.user.displayName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync Google account');
      }

      applySessionPayload(data);
      setIsAuthOpen(false);

      if (pendingTradeAfterAuth && isCommunityApprovedUser(data.user)) {
        setSelectedMarket(pendingTradeAfterAuth.market);
        setSelectedSide(pendingTradeAfterAuth.side);
        setPendingTradeAfterAuth(null);
      }

      await fetchPublicData();
      await refreshCurrentUser();
    } catch (err: any) {
      setAuthError(
        err.message ||
          'Google popup blocked by in-app browser. Use instant Email/Password login above!'
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    saveToken(null);
    setUser(null);
    setPositions([]);
    setTransactions([]);
    setWalletTransactions([]);
    setAdminWalletTransactions([]);
    setAdminPredictors([]);
    setActiveTab('markets');
  };

  // Redeem Owner Invite Code (unlocks `is_community_approved` for uninvited new signups)
  const handleRedeemInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenRef.current || !inviteCodeInput.trim()) return;
    setInviteGateError(null);
    setInviteGateMessage(null);
    setIsRedeemingCode(true);
    try {
      const res = await fetch('/api/account/redeem-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ inviteCode: inviteCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid Owner Invite Code');
      }
      applySessionPayload(data);
      setInviteGateMessage(
        'Invite Code accepted! Welcome to the Up & Down community.'
      );
      await fetchPublicData();
    } catch (err: any) {
      setInviteGateError(err.message || 'Could not redeem invite code');
    } finally {
      setIsRedeemingCode(false);
    }
  };

  // Update Custom User ID (@username) and College Name
  const handleUpdateProfile = async (
    newUsername: string,
    newCollegeName: string
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({
        username: newUsername,
        collegeName: newCollegeName,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update User ID');
    }
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
  };

  // Request Creator / Event Host Approval from Owner
  const handleRequestCreatorAccess = async () => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/account/request-access', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
      },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request creator access');
    }
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
  };

  // Execute Atomic Buy Trade (Virtual Coins or Real Money ₹ UPI)
  const handleConfirmTrade = async (
    marketId: number,
    side: TradeSide,
    amount: number,
    walletType: WalletMode = 'COINS'
  ) => {
    if (!tokenRef.current || !user) {
      setIsAuthOpen(true);
      return;
    }
    setTradeError(null);
    setIsTradeSubmitting(true);
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({ marketId, side, amount, walletType }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Trade failed');
      }

      const targetMarket = markets.find((m) => m.id === marketId);
      applySessionPayload(data);
      setMarkets((prev) =>
        prev.map((m) => (m.id === marketId ? data.updatedMarket : m))
      );
      setSelectedMarket(null);

      // Show "Share Flex Card" Modal right after placing a trade
      if (targetMarket && data.preview) {
        setFlexCardData({
          marketId,
          marketTitle: targetMarket.title,
          category: targetMarket.category,
          side,
          entryOdds: data.preview.executionPrice,
          investedCoins: amount,
          potentialPayout: data.preview.potentialPayout,
          returnPercentage: data.preview.returnPercentage,
          username: data.user.username,
          collegeName: data.user.collegeName,
        });
      }

      await fetchPublicData();
    } catch (err: any) {
      setTradeError(err.message || 'Could not execute trade');
    } finally {
      setIsTradeSubmitting(false);
    }
  };

  // Early Exit: Sell YES/NO Shares Before Final Result (Profit Booking & Stop-Loss)
  const handleSellPositionEarly = async (
    positionId: number,
    sharesToSell: number
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/trade/sell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ positionId, sharesToSell }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Early exit sell failed');
    }
    applySessionPayload(data);
    if (data.updatedMarket) {
      setMarkets((prev) =>
        prev.map((m) =>
          m.id === data.updatedMarket.id ? data.updatedMarket : m
        )
      );
    }
    await fetchPublicData();
    return {
      sharesSold: Number(data.sellPreview?.sharesToSell || sharesToSell),
      creditedAmount: Number(data.creditedAmount || 0),
      executionPrice: Number(data.sellPreview?.executionPrice || 0),
    };
  };

  // Claim Daily 100 Coin Vault Refill Drop (Strictly 1x per 24 hours)
  const handleClaimRefill = async () => {
    if (!tokenRef.current) {
      setIsAuthOpen(true);
      return;
    }
    setIsClaimingRefill(true);
    try {
      const res = await fetch('/api/vault/refill', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Daily +100 Coins already claimed today');
      }
      applySessionPayload(data);
      await fetchPublicData();
    } finally {
      setIsClaimingRefill(false);
    }
  };

  // Owner/Creator: Create Market
  const handleCreateMarket = async (payload: {
    title: string;
    category: string;
    closesAt: string;
    startingYesProbability: number;
    resolutionRules: string;
  }) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/markets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create market');
    setMarkets(data.markets || []);
  };

  // Owner/Admin: Resolve or Cancel Market
  const handleResolveMarket = async (
    marketId: number,
    resolution: 'YES' | 'NO' | 'CANCEL'
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ marketId, resolution }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resolve market');
    setMarkets(data.markets || []);
    applySessionPayload(data);
    await fetchPublicData();
  };

  // Owner/Admin: Approve or Revoke Creator / Admin Role
  const handlePromoteUser = async (
    targetIdentifier: string,
    newRole: UserRole
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/promote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ targetIdentifier, newRole }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update role');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
    if (
      data.updatedProfile &&
      user &&
      (String(data.updatedProfile.id) === String(user.id) ||
        data.updatedProfile.username.toLowerCase() ===
          user.username.toLowerCase())
    ) {
      setUser(data.updatedProfile);
    }
  };

  // Owner: Granular 3-Permission RBAC Update (`is_community_approved`, `can_create_events`, `has_payment_and_trading_access`)
  const handleUpdateGranularPermissions = async (
    targetIdentifier: string,
    permissions: {
      isCommunityApproved?: boolean;
      canCreateEvents?: boolean;
      hasPaymentAndTradingAccess?: boolean;
    }
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/permissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({
        targetIdentifier,
        ...permissions,
      }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || 'Failed to update granular permissions');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
    if (
      data.updatedProfile &&
      user &&
      (String(data.updatedProfile.id) === String(user.id) ||
        data.updatedProfile.username.toLowerCase() ===
          user.username.toLowerCase())
    ) {
      setUser(data.updatedProfile);
    }
  };

  // Direct Manual UPI Wallet: Submit 12-Digit UTR Deposit Request (Saved as PENDING)
  const handleDepositUpi = async (
    amountInr: number,
    utrNumber: string,
    upiId: string,
    paymentApp: string
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/wallet/upi-deposit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ amountInr, utrNumber, upiId, paymentApp }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || 'Failed to submit UPI deposit UTR');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
    return {
      utrNumber: data.utrNumber,
      requestedInr: data.requestedInr ?? amountInr,
      addedInr: data.addedInr ?? 0,
      status: data.status || 'PENDING',
      message: data.message,
    };
  };

  // Direct Manual UPI Wallet: Submit Withdrawal Request (Saved as PENDING)
  const handleWithdrawUpi = async (amountInr: number, upiId: string) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/wallet/upi-withdraw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ amountInr, upiId }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || 'Failed to submit withdrawal request');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
    return {
      withdrawnInr: data.withdrawnInr ?? amountInr,
      status: data.status || 'PENDING',
      message: data.message,
    };
  };

  // Owner Admin Panel: Approve or Reject a Pending 12-Digit UTR Deposit
  const handleReviewDeposit = async (
    transactionId: number,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/wallet/deposit-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ transactionId, decision }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to review deposit');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
  };

  // Owner Admin Panel: Mark Completed or Reject & Refund a Pending UPI Withdrawal
  const handleReviewWithdrawal = async (
    transactionId: number,
    decision: 'COMPLETED' | 'REJECTED',
    payoutUtrNumber?: string
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/wallet/withdraw-review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ transactionId, decision, payoutUtrNumber }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to review withdrawal');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
  };

  // Invite-Only Form: Submit Real Money UPI Access Application
  const handleSubmitRealMoneyInvite = async (payload: {
    fullName: string;
    upiId: string;
    phone: string;
    inviteNote: string;
  }) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/wallet/upi-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || 'Failed to submit Invite-Only request');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
  };

  // Owner: Approve or Revoke Real Money UPI Access for any user
  const handleApproveRealMoney = async (
    targetIdentifier: string,
    status: RealMoneyAccessStatus
  ) => {
    if (!tokenRef.current) throw new Error('Please sign in first.');
    const res = await fetch('/api/admin/real-money-approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ targetIdentifier, status }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.error || 'Failed to update Real Money UPI status');
    applySessionPayload(data);
    if (data.predictors) setPredictors(data.predictors);
    if (
      data.updatedProfile &&
      user &&
      (String(data.updatedProfile.id) === String(user.id) ||
        data.updatedProfile.username.toLowerCase() ===
          user.username.toLowerCase())
    ) {
      setUser(data.updatedProfile);
    }
  };

  const dailyEligibility = checkDailyClaimEligibility(user?.lastDailyClaim);
  const realMoneyEligible = isRealMoneyEligible(user);
  const communityApproved = user ? isCommunityApprovedUser(user) : true;

  return (
    <div className="app-root">
      <div className="app-frame">
        <header className="app-header">
          <button
            type="button"
            onClick={() => setActiveTab('markets')}
            className="app-brand"
            aria-label="Up and Down home"
          >
            <span className="brand-mark"><TrendingUp aria-hidden="true" /></span>
            <span className="brand-wordmark"><span>UP</span><span className="brand-amp">&amp;</span><span>DOWN</span></span>
          </button>

          <div className="header-search-wrap">
            <Search className="header-search-icon" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search markets"
              placeholder="Search markets, events, or topics"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="header-search-input"
            />
          </div>

          <div className="app-header-actions">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} theme`}
              data-testid="header-theme-toggle"
              className="theme-toggle"
            >
              {themeMode === 'light' ? (
                <Moon className="w-4 h-4 text-slate-700" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" />
              )}
            </button>

            {user ? (
              <>
                <button
                  type="button"
                  data-testid="header-upi-wallet-btn"
                  onClick={() => {
                    if (!communityApproved) return;
                    setIsUpiWalletOpen(true);
                  }}
                  aria-label="Open UPI Real Money Wallet and Bet Calculator"
                  className="header-balance header-balance-real"
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span data-testid="header-real-money-balance">
                    {Number(
                      user.walletBalanceInr ?? user.realMoneyBalance ?? 0
                    ).toLocaleString('en-IN')}
                  </span>
                  {!realMoneyEligible && (
                    <Lock className="w-3 h-3 text-amber-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!communityApproved) return;
                    setActiveTab('portfolio');
                  }}
                  aria-label="Available virtual coins balance"
                  className="header-balance"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span data-testid="header-coin-balance">
                    {user.coinBalance.toLocaleString()}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!communityApproved) return;
                    setActiveTab('account');
                  }}
                  aria-label="Open account settings and profile"
                  className="header-profile-button"
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline max-w-[60px] truncate">@{user.username}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setIsAuthOpen(true);
                }}
                className="header-join-button"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Join free</span>
              </button>
            )}
          </div>
        </header>

        <div className="app-body">
          <aside className="desktop-sidebar" aria-label="Workspace navigation">
            <p className="sidebar-section-label">Discover</p>
            <nav className="sidebar-nav">
              <button type="button" onClick={() => handleNavClick('markets')} aria-current={activeTab === 'markets' ? 'page' : undefined} className={`sidebar-nav-link ${activeTab === 'markets' ? 'is-active' : ''}`}>
                <TrendingUp aria-hidden="true" /><span>Markets</span><span className="nav-count">{markets.length}</span>
              </button>
              <button type="button" onClick={() => handleNavClick('leaderboard')} aria-current={activeTab === 'leaderboard' ? 'page' : undefined} className={`sidebar-nav-link ${activeTab === 'leaderboard' ? 'is-active' : ''}`}>
                <Trophy aria-hidden="true" /><span>Leaderboard</span>
              </button>
              <button type="button" onClick={() => handleNavClick('portfolio')} aria-current={activeTab === 'portfolio' ? 'page' : undefined} className={`sidebar-nav-link ${activeTab === 'portfolio' ? 'is-active' : ''}`}>
                <Briefcase aria-hidden="true" /><span>Portfolio</span>
              </button>
              <button type="button" onClick={() => handleNavClick('account')} aria-current={activeTab === 'account' ? 'page' : undefined} className={`sidebar-nav-link ${activeTab === 'account' ? 'is-active' : ''}`}>
                <User aria-hidden="true" /><span>Account</span>
              </button>
            </nav>

            {user ? (
              <div className="sidebar-account-card">
                <div className="sidebar-account-heading"><span className="sidebar-avatar">{user.username.slice(0, 1).toUpperCase()}</span><span className="sidebar-user-name">@{user.username}</span></div>
                <div className="sidebar-account-balance"><Coins aria-hidden="true" /><span>{user.coinBalance.toLocaleString()} Coins</span></div>
                <button type="button" onClick={() => handleNavClick('portfolio')} className="sidebar-account-link">View portfolio <span aria-hidden="true">→</span></button>
              </div>
            ) : (
              <div className="sidebar-invite-card">
                <span className="sidebar-invite-icon"><Sparkles aria-hidden="true" /></span>
                <strong>Make your call</strong>
                <p>Join your community and start with 1,000 free virtual Coins.</p>
                <button type="button" onClick={() => { setAuthError(null); setIsAuthOpen(true); }}>Create account</button>
              </div>
            )}
            <p className="sidebar-footnote">A community market for campus, sports &amp; culture.</p>
          </aside>

        <main className="app-main">
          {activeTab !== 'markets' && (!user || communityApproved) && (
            <section className="workspace-page-heading">
              <p className="workspace-page-kicker">UP &amp; DOWN <span>/</span> WORKSPACE</p>
              <h1>
                {activeTab === 'leaderboard'
                  ? 'Community leaderboard'
                  : activeTab === 'portfolio'
                  ? 'Your portfolio'
                  : 'Account & creator studio'}
              </h1>
              <p>
                {activeTab === 'leaderboard'
                  ? 'See how your calls stack up across predictors and campuses.'
                  : activeTab === 'portfolio'
                  ? 'Track your positions, balances and recent activity in one place.'
                  : 'Manage your profile, community access and market tools.'}
              </p>
            </section>
          )}
          {/* STRICT RBAC GATE: INVITE-ONLY / WAITING FOR OWNER APPROVAL SCREEN */}
          {user && !communityApproved ? (
            <div
              data-testid="invite-only-waiting-screen"
              className="w-full max-w-2xl mx-auto bg-[#131B2E] border border-amber-400/50 rounded-3xl p-5 sm:p-7 space-y-4 shadow-xl"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-400 mx-auto">
                <Lock className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[10px] font-extrabold uppercase tracking-wider">
                  PRIVATE BETA · INVITE-ONLY MODE
                </span>
                <h1 className="text-lg font-extrabold text-white">
                  Invite-Only / Waiting for Owner Approval
                </h1>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Hi <strong className="text-white">@{user.username}</strong> (
                  {user.email}) — the platform is currently in private testing.
                  Only users invited or approved by the Owner (
                  <strong className="text-emerald-400">{OWNER_EMAIL}</strong>)
                  with <code className="text-amber-300">is_community_approved</code>{' '}
                  can access the community, events, and payment system.
                </p>
              </div>

              {inviteGateMessage && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{inviteGateMessage}</span>
                </div>
              )}

              {inviteGateError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200">
                  {inviteGateError}
                </div>
              )}

              <form
                onSubmit={handleRedeemInviteCode}
                data-testid="redeem-invite-code-form"
                className="p-3.5 rounded-2xl bg-[#090D16] border border-[#1E293B] space-y-2.5"
              >
                <label
                  htmlFor="invite-code-input"
                  className="block text-xs font-bold text-white flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>Have an Owner Invite Code? Enter Below:</span>
                </label>
                <input
                  id="invite-code-input"
                  data-testid="invite-code-input"
                  type="text"
                  required
                  placeholder="Enter Owner Invite Code (e.g. UPDOWN2026)"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={isRedeemingCode}
                  data-testid="redeem-invite-code-btn"
                  className="w-full min-h-[42px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs transition-all disabled:opacity-50"
                >
                  {isRedeemingCode
                    ? 'Verifying Invite Code...'
                    : 'Unlock Community Access with Invite Code'}
                </button>
              </form>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    refreshCurrentUser().catch(() => {});
                  }}
                  className="min-h-[42px] rounded-xl bg-[#090D16] border border-[#1E293B] text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check Approval</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="min-h-[42px] rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Low Coin / Bankrupt Viral Loop Banner (Automatically shown when coin_balance < 50) */}
              {user && user.coinBalance < 50 && (
                <div
                  data-testid="low-coin-banner"
                  className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Gift className="w-4 h-4 shrink-0" />
                      <span>Out of Coins? Refill Vault</span>
                    </p>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Claim +100 Daily Drop (1x/day) or share `?ref=
                      {user.username}` for +500 Coins!
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isClaimingRefill || !dailyEligibility.canClaim}
                    onClick={() => {
                      handleClaimRefill().catch(() => {});
                    }}
                    className={`min-h-[38px] px-3 rounded-xl font-bold text-xs shrink-0 flex items-center gap-1 ${
                      dailyEligibility.canClaim
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-[#090D16] border border-[#1E293B] text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {dailyEligibility.canClaim ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>+100 Coins</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>{dailyEligibility.remainingLabel}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* TAB 1: MARKETS FEED */}
              {activeTab === 'markets' && (
                <div className="market-page">
                  <section className="market-hero">
                    <div className="market-hero-copy">
                      <p className="market-kicker"><span className="market-live-dot" /> THE COMMUNITY PREDICTION MARKET</p>
                      <h1>What happens next?</h1>
                      <p className="market-hero-description">Trade your take on campus, sports, creators and culture. Follow the crowd, find your edge, and watch the odds move.</p>
                      <div className="market-hero-details"><span>YES + NO shares</span><span>Virtual Coins to get started</span><span>Sell before resolution</span></div>
                    </div>
                    {!user && <button type="button" className="market-hero-cta" onClick={() => { setAuthError(null); setIsAuthOpen(true); }}>Get 1,000 free Coins <span aria-hidden="true">→</span></button>}
                  </section>

                  <div className="market-search-wrap">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="search"
                      aria-label="Search campus prediction markets"
                      placeholder="Search IPL, Mood Indigo, GTA 6, Exams, F1..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="market-search-input w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#131B2E] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
                    />
                  </div>

                  {/* Interactive Category Filter Controls */}
                  <div
                    className="market-category-tabs flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
                    role="tablist"
                    aria-label="Market categories"
                  >
                    {CATEGORIES.map((cat) => {
                      const isActive = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setSelectedCategory(cat)}
                          className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-all border ${
                            isActive
                              ? 'poly-blue-pill shadow-sm'
                              : 'bg-[#131B2E] text-slate-300 border-[#1E293B] hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>

                  {/* Markets List */}
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((n) => (
                        <div
                          key={n}
                          className="h-40 rounded-2xl bg-[#131B2E] border border-[#1E293B] animate-pulse p-4"
                        />
                      ))}
                    </div>
                  ) : filteredMarkets.length === 0 ? (
                    <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-8 text-center space-y-2">
                      <p className="text-sm font-semibold text-white">
                        No matching campus markets
                      </p>
                      <p className="text-xs text-slate-400">
                        Try clearing your search filter or switch to another
                        category.
                      </p>
                    </div>
                  ) : (
                    <div className="market-grid grid grid-cols-1 md:grid-cols-2 gap-3.5 lg:gap-5">
                      {filteredMarkets.map((market) => (
                        <MarketCard
                          key={market.id}
                          market={market}
                          onSelectTrade={handleSelectTrade}
                          onInspectMarket={(m) => {
                            setTradeError(null);
                            setSelectedMarket(m);
                            setSelectedSide('YES');
                          }}
                          onShareMarket={handleShareMarket}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LEADERBOARD (TOP PREDICTORS & COLLEGE WARS) */}
              {activeTab === 'leaderboard' && (
                <LeaderboardView
                  predictors={predictors}
                  currentUsername={user?.username}
                />
              )}

              {/* TAB 3: PORTFOLIO & EARLY EXIT (PROFIT BOOKING & STOP-LOSS) */}
              {activeTab === 'portfolio' && (
                <PortfolioView
                  user={user}
                  positions={positions}
                  transactions={transactions}
                  isClaimingRefill={isClaimingRefill}
                  onClaimRefill={() => {
                    handleClaimRefill().catch(() => {});
                  }}
                  onOpenAuth={() => {
                    setAuthError(null);
                    setIsAuthOpen(true);
                  }}
                  onLogout={handleLogout}
                  onOpenFlexCard={(data) => setFlexCardData(data)}
                  onOpenUpiWallet={() => setIsUpiWalletOpen(true)}
                  onSellPositionEarly={handleSellPositionEarly}
                />
              )}

              {/* TAB 4: ACCOUNT HUB (PROFILE, CUSTOM USER ID, DAILY 100 COINS, REFERRAL, OWNER ADMIN STUDIO) */}
              {activeTab === 'account' && (
                <AdminStudioView
                  user={user}
                  markets={markets}
                  predictors={
                    user && isOwnerEmail(user.email)
                      ? adminPredictors
                      : predictors
                  }
                  adminWalletTransactions={adminWalletTransactions}
                  hasCreatorInvite={hasCreatorInvite}
                  themeMode={themeMode}
                  onToggleTheme={handleToggleTheme}
                  onRefreshAccount={refreshCurrentUser}
                  isClaimingRefill={isClaimingRefill}
                  onClaimRefill={handleClaimRefill}
                  onUpdateProfile={handleUpdateProfile}
                  onRequestCreatorAccess={handleRequestCreatorAccess}
                  onOpenAuth={() => {
                    setAuthError(null);
                    setIsAuthOpen(true);
                  }}
                  onLogout={handleLogout}
                  onCreateMarket={handleCreateMarket}
                  onResolveMarket={handleResolveMarket}
                  onPromoteUser={handlePromoteUser}
                  onOpenUpiWallet={() => setIsUpiWalletOpen(true)}
                  onApproveRealMoney={handleApproveRealMoney}
                  onUpdateGranularPermissions={handleUpdateGranularPermissions}
                  onReviewDeposit={handleReviewDeposit}
                  onReviewWithdrawal={handleReviewWithdrawal}
                  ownerUpiId={ownerUpiId}
                  onUpdateOwnerUpi={async (newOwnerUpiId) => {
                    if (!tokenRef.current)
                      throw new Error('Please sign in first.');
                    const res = await fetch('/api/admin/owner-upi', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tokenRef.current}`,
                      },
                      body: JSON.stringify({ newOwnerUpiId }),
                    });
                    const data = await res.json();
                    if (!res.ok)
                      throw new Error(
                        data.error || 'Failed to update Owner UPI ID'
                      );
                    applySessionPayload(data);
                  }}
                  inAppInviteCodes={inAppInviteCodes}
                  onCreateInviteCode={async (payload) => {
                    if (!tokenRef.current)
                      throw new Error('Please sign in first.');
                    const res = await fetch('/api/admin/invite-codes', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tokenRef.current}`,
                      },
                      body: JSON.stringify(payload),
                    });
                    const data = await res.json();
                    if (!res.ok)
                      throw new Error(
                        data.error || 'Failed to create invite code'
                      );
                    applySessionPayload(data);
                  }}
                />
              )}
            </>
          )}
        </main>

          {activeTab === 'markets' && (!user || communityApproved) && (
            <aside className="market-right-rail" aria-label="Market overview">
              <section className="rail-card market-pulse-card">
                <div className="rail-card-heading"><div><p className="rail-eyebrow">MARKET SNAPSHOT</p><h2>Market pulse</h2></div><TrendingUp aria-hidden="true" /></div>
                <div className="market-pulse-stats">
                  <div><span>Open markets</span><strong>{markets.filter((market) => market.status === 'open').length}</strong></div>
                  <div><span>Total volume</span><strong>{markets.reduce((sum, market) => sum + Number(market.totalVolume || 0), 0).toLocaleString('en-IN')} <small>Coins</small></strong></div>
                </div>
              </section>

              <section className="rail-card rail-trending-card">
                <div className="rail-card-heading"><div><p className="rail-eyebrow">BY COMMUNITY VOLUME</p><h2>Trending markets</h2></div><TrendingUp aria-hidden="true" /></div>
                {markets.length ? (
                  <div className="trending-market-list">
                    {[...markets].sort((a, b) => Number(b.totalVolume || 0) - Number(a.totalVolume || 0)).slice(0, 5).map((market) => {
                      const { yesPrice } = calculateMarketPrices(market.yesPool, market.noPool);
                      return <button type="button" className="trending-market-row" key={market.id} onClick={() => { setSelectedMarket(market); setSelectedSide('YES'); setTradeError(null); }}><span className="trending-market-copy"><span className="trending-market-category">{market.category}</span><strong>{market.title}</strong></span><span className="trending-market-odds">{yesPrice}% <small>YES</small></span></button>;
                    })}
                  </div>
                ) : <p className="rail-empty-state">Markets will appear here when available.</p>}
              </section>

              {!user ? (
                <section className="rail-card rail-join-card"><p className="rail-eyebrow">YOUR NEXT GOOD CALL</p><h2>Make your prediction count.</h2><p>Create a free account to trade virtual Coins and track your portfolio.</p><button type="button" onClick={() => { setAuthError(null); setIsAuthOpen(true); }}>Join the market <span aria-hidden="true">→</span></button></section>
              ) : (
                <section className="rail-card rail-account-card"><p className="rail-eyebrow">YOUR ACCOUNT</p><div className="rail-account-balance"><span>Virtual balance</span><strong><Coins aria-hidden="true" /> {user.coinBalance.toLocaleString()} <small>Coins</small></strong></div><button type="button" onClick={() => handleNavClick('portfolio')}>Open portfolio <span aria-hidden="true">→</span></button></section>
              )}
            </aside>
          )}
        </div>

        {/* Sticky Bottom Navigation Bar (Markets, Leaderboard, Portfolio, Account) */}
        <nav
          aria-label="Primary bottom navigation"
          className="mobile-bottom-nav fixed bottom-0 sm:bottom-5 w-full max-w-[430px] sm:max-w-[640px] h-16 bg-[#090D16]/95 backdrop-blur-md border-t border-x sm:border border-[#1E293B] rounded-t-2xl sm:rounded-2xl grid grid-cols-4 items-center z-30 px-2 shadow-2xl"
        >
          <button
            type="button"
            aria-current={activeTab === 'markets' ? 'page' : undefined}
            onClick={() => handleNavClick('markets')}
            className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
              activeTab === 'markets'
                ? 'text-[#10B981]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
              Markets
            </span>
          </button>

          <button
            type="button"
            aria-current={activeTab === 'leaderboard' ? 'page' : undefined}
            onClick={() => handleNavClick('leaderboard')}
            className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
              activeTab === 'leaderboard'
                ? 'text-[#10B981]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
              Leaderboard
            </span>
          </button>

          <button
            type="button"
            aria-current={activeTab === 'portfolio' ? 'page' : undefined}
            onClick={() => handleNavClick('portfolio')}
            className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
              activeTab === 'portfolio'
                ? 'text-[#10B981]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
              Portfolio
            </span>
          </button>

          <button
            type="button"
            aria-current={activeTab === 'account' ? 'page' : undefined}
            onClick={() => handleNavClick('account')}
            className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
              activeTab === 'account'
                ? 'text-[#10B981]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
              Account
            </span>
          </button>
        </nav>

        {/* Interactive Trade Bottom-Sheet Modal */}
        <TradeSheetModal
          market={selectedMarket}
          initialSide={selectedSide}
          initialWalletType={selectedWalletType}
          initialAmount={selectedInitialAmount}
          user={user}
          isSubmitting={isTradeSubmitting}
          error={tradeError}
          onClose={() => setSelectedMarket(null)}
          onConfirmTrade={handleConfirmTrade}
          onRequireAuth={() => {
            setSelectedMarket(null);
            setIsAuthOpen(true);
          }}
          onOpenUpiWallet={() => setIsUpiWalletOpen(true)}
        />

        {/* Direct Manual UPI Wallet, 12-Digit UTR Verification & Calculator Modal */}
        <UpiWalletModal
          isOpen={isUpiWalletOpen}
          onClose={() => setIsUpiWalletOpen(false)}
          user={user}
          markets={markets}
          transactions={transactions}
          walletTransactions={walletTransactions}
          ownerUpiId={ownerUpiId}
          ownerUpiName={ownerUpiName}
          onRequireAuth={() => setIsAuthOpen(true)}
          onDepositUpi={handleDepositUpi}
          onWithdrawUpi={handleWithdrawUpi}
          onSubmitInviteForm={handleSubmitRealMoneyInvite}
          onRefreshStatus={refreshCurrentUser}
          onLaunchRealMoneyTrade={(m, side, stakeInr) => {
            setTradeError(null);
            setSelectedMarket(m);
            setSelectedSide(side);
            setSelectedWalletType('REAL_INR');
            setSelectedInitialAmount(stakeInr);
          }}
        />

        {/* In-App Browser Safe Auth Bottom-Sheet Modal */}
        <AuthSheetModal
          isOpen={isAuthOpen}
          initialReferral={initialReferral}
          hasCreatorInvite={hasCreatorInvite}
          isSubmitting={isAuthSubmitting}
          error={authError}
          onClose={() => {
            setIsAuthOpen(false);
            setPendingTradeAfterAuth(null);
          }}
          onSignup={handleSignup}
          onLogin={handleLogin}
          onGoogleLogin={handleGoogleLogin}
        />

        {/* Vertical Story "Share Flex Card" Modal */}
        <FlexCardModal
          flexData={flexCardData}
          onClose={() => setFlexCardData(null)}
        />
      </div>
    </div>
  );
}
