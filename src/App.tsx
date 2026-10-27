/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Trophy,
  Briefcase,
  Shield,
  Coins,
  Search,
  Gift,
  Sparkles,
  User,
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
} from './types.ts';
import {
  calculateMarketPrices,
  calculateTradePreview,
  LeaderboardEntryInput,
  TradeSide,
} from './utils/marketMath.ts';
import { MarketCard } from './components/MarketCard.tsx';
import { TradeSheetModal } from './components/TradeSheetModal.tsx';
import { AuthSheetModal } from './components/AuthSheetModal.tsx';
import { FlexCardModal } from './components/FlexCardModal.tsx';
import { LeaderboardView } from './components/LeaderboardView.tsx';
import { PortfolioView } from './components/PortfolioView.tsx';
import { AdminStudioView } from './components/AdminStudioView.tsx';

type NavTab = 'markets' | 'leaderboard' | 'portfolio' | 'admin';

const CATEGORIES: MarketCategory[] = [
  'All',
  'Cricket & Sports',
  'Campus Gossip',
  'Pop-Culture & Creators',
  'Tech & Finance',
];

export default function App() {
  // Navigation & Filter State
  const [activeTab, setActiveTab] = useState<NavTab>('markets');
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Data State
  const [markets, setMarkets] = useState<MarketItem[]>([]);
  const [predictors, setPredictors] = useState<LeaderboardEntryInput[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Auth & User State (Token stored strictly in memory)
  const tokenRef = useRef<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  // Modals & Action State
  const [selectedMarket, setSelectedMarket] = useState<MarketItem | null>(null);
  const [selectedSide, setSelectedSide] = useState<TradeSide>('YES');
  const [pendingTradeAfterAuth, setPendingTradeAfterAuth] = useState<{
    market: MarketItem;
    side: TradeSide;
  } | null>(null);

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const [tradeError, setTradeError] = useState<string | null>(null);
  const [isTradeSubmitting, setIsTradeSubmitting] = useState(false);
  const [isClaimingRefill, setIsClaimingRefill] = useState(false);

  const [flexCardData, setFlexCardData] = useState<FlexCardData | null>(null);

  // Detect ?ref=username referral query parameter
  const initialReferral = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || '';
  }, []);

  const fetchPublicData = async () => {
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
      }
    } catch (err) {
      console.error('Error loading public market feed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPublicData();
  }, []);

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
      // Trigger Auth Bottom-Sheet Modal when unauthenticated user clicks Buy YES or Buy NO,
      // and remember their chosen market + side so the Trade Sheet opens right after login
      setPendingTradeAfterAuth({ market, side });
      setAuthError(null);
      setIsAuthOpen(true);
      return;
    }
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

      tokenRef.current = data.token;
      setUser(data.user);
      setPositions(data.positions || []);
      setTransactions(data.transactions || []);
      setIsAuthOpen(false);

      if (pendingTradeAfterAuth) {
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

  // Auth: Email / Username + Password Login (or Demo 1-Tap Login)
  const handleLogin = async (
    identifier: string,
    password: string,
    isDemoQuickLogin = false
  ) => {
    setAuthError(null);
    setIsAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, isDemoQuickLogin }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      tokenRef.current = data.token;
      setUser(data.user);
      setPositions(data.positions || []);
      setTransactions(data.transactions || []);
      setIsAuthOpen(false);

      if (pendingTradeAfterAuth) {
        setSelectedMarket(pendingTradeAfterAuth.market);
        setSelectedSide(pendingTradeAfterAuth.side);
        setPendingTradeAfterAuth(null);
      }

      await fetchPublicData();
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  // Auth: Firebase Google Sign-In Popup
  const handleGoogleLogin = async (collegeName: string, referredBy?: string) => {
    setAuthError(null);
    setIsAuthSubmitting(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      tokenRef.current = idToken;

      const res = await fetch('/api/auth/firebase-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          collegeName,
          referredBy,
          username: cred.user.displayName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync Google account');
      }

      setUser(data.user);
      setPositions(data.positions || []);
      setTransactions(data.transactions || []);
      setIsAuthOpen(false);

      if (pendingTradeAfterAuth) {
        setSelectedMarket(pendingTradeAfterAuth.market);
        setSelectedSide(pendingTradeAfterAuth.side);
        setPendingTradeAfterAuth(null);
      }

      await fetchPublicData();
    } catch (err: any) {
      setAuthError(
        err.message ||
          'Google popup blocked by in-app browser. Use instant Email/Password or 1-Tap Demo login above!'
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    tokenRef.current = null;
    setUser(null);
    setPositions([]);
    setTransactions([]);
    setActiveTab('markets');
  };

  // Execute Atomic Trade
  const handleConfirmTrade = async (
    marketId: number,
    side: TradeSide,
    amount: number
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
        body: JSON.stringify({ marketId, side, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Trade failed');
      }

      const targetMarket = markets.find((m) => m.id === marketId);
      setUser(data.user);
      setPositions(data.positions || []);
      setTransactions(data.transactions || []);
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

  // Claim Daily 100 Coin Vault Refill Drop
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
      if (res.ok && data.user) {
        setUser(data.user);
        setPositions(data.positions || []);
        setTransactions(data.transactions || []);
        await fetchPublicData();
      }
    } finally {
      setIsClaimingRefill(false);
    }
  };

  // Admin/Creator: Create Market
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

  // Admin: Resolve or Cancel Market
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
    if (data.user) setUser(data.user);
    if (data.positions) setPositions(data.positions);
    if (data.transactions) setTransactions(data.transactions);
    await fetchPublicData();
  };

  // Admin: Promote Community Creator
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
    if (data.predictors) setPredictors(data.predictors);
  };

  // Demo Role Switcher
  const handleSwitchDemoRole = async (role: UserRole) => {
    if (!tokenRef.current) return;
    const res = await fetch('/api/demo/role', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      setUser(data.user);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-white">
      {/* Strictly Mobile-First Shell (max-w-[430px] mx-auto) */}
      <div className="max-w-[430px] min-h-screen mx-auto bg-[#090D16] text-white border-x border-slate-800/60 flex flex-col relative pb-20">
        {/* Sticky Glassmorphism Top Header */}
        <header className="sticky top-0 z-30 h-14 px-4 bg-[#090D16]/85 backdrop-blur-md border-b border-[#1E293B] flex items-center justify-between gap-3">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('markets')}
            className="text-lg font-extrabold font-display tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <span className="text-[#10B981]">UP</span>
            <span className="text-slate-400">&amp;</span>
            <span className="text-[#F43F5E]">DOWN</span>
          </button>

          {/* Zone 2 & 3: Live Coin Balance & Profile/Auth Action */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('portfolio')}
                  aria-label="Available virtual coins balance"
                  className="min-h-[36px] px-3 rounded-xl bg-[#131B2E] border border-[#1E293B] flex items-center gap-1.5 text-xs font-mono-tabular font-bold text-white hover:border-emerald-500/50 transition-colors"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span data-testid="header-coin-balance">
                    {user.coinBalance.toLocaleString()}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  aria-label="Open profile and creator studio"
                  className="min-h-[36px] min-w-[36px] px-2.5 rounded-xl bg-[#131B2E] border border-[#1E293B] flex items-center justify-center gap-1 text-xs font-semibold text-emerald-400 hover:bg-slate-800 transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  <span className="max-w-[72px] truncate">@{user.username}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setIsAuthOpen(true);
                }}
                className="min-h-[36px] px-3.5 rounded-xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Claim 1,000 Coins</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Scrollable Viewport Body */}
        <main className="flex-1 px-4 pt-3.5 pb-6 space-y-4">
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
                  Claim +100 Daily Drop or share `?ref={user.username}` for +500 Coins!
                </p>
              </div>
              <button
                type="button"
                disabled={isClaimingRefill}
                onClick={handleClaimRefill}
                className="min-h-[38px] px-3 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs shrink-0 flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+100 Coins</span>
              </button>
            </div>
          )}

          {/* TAB 1: MARKETS FEED */}
          {activeTab === 'markets' && (
            <div className="space-y-3.5">
              {/* Compact Welcome & Value Banner */}
              <div className="bg-gradient-to-br from-[#131B2E] to-[#0D1424] border border-[#1E293B] rounded-2xl p-4">
                <p className="text-[11px] font-medium text-[#10B981] mb-1">
                  UP &amp; DOWN · INDIA GEN-Z PREDICTION EXCHANGE
                </p>
                <h1 className="text-lg font-extrabold font-display text-white leading-snug">
                  Predict &amp; Outsmart Your Campus
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Back YES or NO with virtual coins on IPL, college fests, creator drama &amp;
                  tech. Every winning share pays <strong className="text-slate-200">100 Coins</strong>.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <input
                  type="search"
                  aria-label="Search campus prediction markets"
                  placeholder="Search IPL, Mood Indigo, GTA 6, Exams, F1..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full min-h-[42px] pl-10 pr-4 rounded-xl bg-[#131B2E] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600"
                />
              </div>

              {/* Interactive Category Filter Controls */}
              <div
                className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
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
                      className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors border ${
                        isActive
                          ? 'bg-[#10B981] text-slate-950 border-[#10B981]'
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
                    Try clearing your search filter or switch to another category.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
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

          {/* TAB 3: PORTFOLIO & VAULT REFILL */}
          {activeTab === 'portfolio' && (
            <PortfolioView
              user={user}
              positions={positions}
              transactions={transactions}
              isClaimingRefill={isClaimingRefill}
              onClaimRefill={handleClaimRefill}
              onOpenAuth={() => {
                setAuthError(null);
                setIsAuthOpen(true);
              }}
              onLogout={handleLogout}
              onOpenFlexCard={(data) => setFlexCardData(data)}
            />
          )}

          {/* TAB 4: CREATE / ADMIN STUDIO */}
          {activeTab === 'admin' && (
            <AdminStudioView
              user={user}
              markets={markets}
              onOpenAuth={() => {
                setAuthError(null);
                setIsAuthOpen(true);
              }}
              onCreateMarket={handleCreateMarket}
              onResolveMarket={handleResolveMarket}
              onPromoteUser={handlePromoteUser}
              onSwitchDemoRole={handleSwitchDemoRole}
            />
          )}
        </main>

        {/* Sticky Bottom Navigation Bar (Markets, Leaderboard, Portfolio, Create/Admin) */}
        <nav
          aria-label="Primary bottom navigation"
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-16 bg-[#090D16]/95 backdrop-blur-md border-t border-x border-[#1E293B] grid grid-cols-4 items-center z-30 px-2"
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
            aria-current={activeTab === 'admin' ? 'page' : undefined}
            onClick={() => handleNavClick('admin')}
            className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
              activeTab === 'admin'
                ? 'text-[#10B981]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
              Create/Admin
            </span>
          </button>
        </nav>

        {/* Interactive Trade Bottom-Sheet Modal */}
        <TradeSheetModal
          market={selectedMarket}
          initialSide={selectedSide}
          user={user}
          isSubmitting={isTradeSubmitting}
          error={tradeError}
          onClose={() => setSelectedMarket(null)}
          onConfirmTrade={handleConfirmTrade}
          onRequireAuth={() => {
            setSelectedMarket(null);
            setIsAuthOpen(true);
          }}
        />

        {/* In-App Browser Safe Auth Bottom-Sheet Modal */}
        <AuthSheetModal
          isOpen={isAuthOpen}
          initialReferral={initialReferral}
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
