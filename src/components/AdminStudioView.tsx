import React, { useState } from 'react';
import {
  PlusCircle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  UserCheck,
  Database,
  Copy,
  Check,
  Sparkles,
  Lock,
} from 'lucide-react';
import { MarketItem, UserProfile, UserRole } from '../types.ts';
import { calculateMarketPrices } from '../utils/marketMath.ts';

interface AdminStudioViewProps {
  user: UserProfile | null;
  markets: MarketItem[];
  onOpenAuth: () => void;
  onCreateMarket: (data: {
    title: string;
    category: string;
    closesAt: string;
    startingYesProbability: number;
    resolutionRules: string;
  }) => Promise<void>;
  onResolveMarket: (
    marketId: number,
    resolution: 'YES' | 'NO' | 'CANCEL'
  ) => Promise<void>;
  onPromoteUser: (targetIdentifier: string, newRole: UserRole) => Promise<void>;
  onSwitchDemoRole: (role: UserRole) => Promise<void>;
}

const CATEGORIES = [
  'Cricket & Sports',
  'Campus Gossip',
  'Pop-Culture & Creators',
  'Tech & Finance',
];

export const AdminStudioView: React.FC<AdminStudioViewProps> = ({
  user,
  markets,
  onOpenAuth,
  onCreateMarket,
  onResolveMarket,
  onPromoteUser,
  onSwitchDemoRole,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [closesAt, setClosesAt] = useState(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [startingProb, setStartingProb] = useState(50);
  const [resolutionRules, setResolutionRules] = useState(
    'Resolves YES based on official announcement or verified campus circular.'
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Creator Manager State
  const [targetHandle, setTargetHandle] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('creator');

  // SQL Deliverable Viewer State
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [sqlText, setSqlText] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState(false);

  const handleLoadSqlSchema = async () => {
    setShowSqlModal(true);
    if (!sqlText) {
      try {
        const res = await fetch('/api/schema-sql');
        const data = await res.json();
        setSqlText(data.sql || '-- supabase/schema.sql');
      } catch {
        setSqlText('-- Error loading supabase/schema.sql');
      }
    }
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      setCopiedSql(true);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    if (!title.trim()) {
      setErrorMessage('Please enter a market question.');
      return;
    }
    setIsBusy(true);
    try {
      await onCreateMarket({
        title: title.trim(),
        category,
        closesAt,
        startingYesProbability: startingProb,
        resolutionRules,
      });
      setTitle('');
      setStatusMessage('Market published live to the Campus Feed!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create market');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResolveClick = async (
    marketId: number,
    resolution: 'YES' | 'NO' | 'CANCEL'
  ) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onResolveMarket(marketId, resolution);
      setStatusMessage(
        resolution === 'CANCEL'
          ? 'Market cancelled & 100% of invested coins refunded.'
          : `Market resolved ${resolution}! Winning shareholders paid 100 Coins/share.`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Resolution failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHandle.trim()) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsBusy(true);
    try {
      await onPromoteUser(targetHandle.trim(), targetRole);
      setStatusMessage(
        `Updated @${targetHandle.trim()} to ${targetRole.toUpperCase()} role!`
      );
      setTargetHandle('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update role');
    } finally {
      setIsBusy(false);
    }
  };

  const canCreate = user && (user.role === 'admin' || user.role === 'creator');
  const isAdmin = user && user.role === 'admin';
  const openMarkets = markets.filter((m) => m.status === 'open');

  return (
    <div className="space-y-4">
      {/* Top Studio Header & SQL Schema Button */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">
              Admin &amp; Creator Studio
            </h2>
            <p className="text-xs text-slate-400">
              Only Verified Community Creators &amp; Admins can launch markets.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLoadSqlSchema}
            className="min-h-[38px] px-3 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-emerald-400 flex items-center gap-1.5 shrink-0"
          >
            <Database className="w-3.5 h-3.5" />
            <span>schema.sql</span>
          </button>
        </div>

        {/* Instant Role Switcher for Testing RBAC */}
        {user ? (
          <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Active Role:</span>
              </span>
              <span className="font-mono-tabular font-bold text-[#10B981]">
                {user.role.toUpperCase()} (@{user.username})
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['user', 'creator', 'admin'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onSwitchDemoRole(r)}
                  className={`min-h-[36px] rounded-lg text-xs font-semibold border transition-colors ${
                    user.role === r
                      ? 'bg-[#10B981]/20 border-[#10B981] text-[#10B981]'
                      : 'bg-[#131B2E] border-[#1E293B] text-slate-400 hover:text-white'
                  }`}
                >
                  Test {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] flex items-center justify-between gap-3">
            <p className="text-xs text-slate-300">
              Sign in as Admin (<strong className="text-white">@arjun_iitb</strong>) or
              Creator (<strong className="text-white">@anya_du</strong>) to create &amp;
              resolve markets.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#10B981] text-slate-950 font-bold text-xs shrink-0"
            >
              Sign In
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/40 text-xs font-semibold text-emerald-200">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200">
          {errorMessage}
        </div>
      )}

      {/* 1. Create New Market Form (Admin & Creators Only) */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <PlusCircle className="w-4 h-4 text-[#10B981]" />
            <span>1. Create New Campus Market</span>
          </h3>
          <span className="text-[11px] text-slate-400">Admin / Creator</span>
        </div>

        {!canCreate ? (
          <div className="p-4 rounded-xl bg-[#090D16] border border-[#1E293B] text-center space-y-2">
            <Lock className="w-5 h-5 text-slate-400 mx-auto" />
            <p className="text-xs text-slate-300 font-medium">
              Regular predictors (`role = user`) can trade &amp; share markets, but
              cannot create events.
            </p>
            <p className="text-[11px] text-slate-400">
              Use the Role Switcher above to switch to <strong>Creator</strong> or{' '}
              <strong>Admin</strong> to test creating a market!
            </p>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="market-title-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Market Question (YES / NO)
              </label>
              <input
                id="market-title-input"
                type="text"
                required
                placeholder="e.g. Will RCB win today's IPL match?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="market-category-select"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Category
                </label>
                <select
                  id="market-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-[#10B981]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="market-closes-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Closing Date &amp; Time
                </label>
                <input
                  id="market-closes-input"
                  type="datetime-local"
                  required
                  value={closesAt}
                  onChange={(e) => setClosesAt(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
              </div>
            </div>

            {/* Starting Probability Slider */}
            <div className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B]">
              <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                <label htmlFor="starting-prob-slider" className="text-slate-300 truncate">
                  Starting Odds (10K Liquidity Pool)
                </label>
                <span className="font-mono-tabular font-bold text-[#10B981] whitespace-nowrap shrink-0">
                  YES {startingProb}% / NO {100 - startingProb}%
                </span>
              </div>
              <input
                id="starting-prob-slider"
                type="range"
                min={10}
                max={90}
                value={startingProb}
                onChange={(e) => setStartingProb(Number(e.target.value))}
                className="w-full accent-[#10B981]"
              />
            </div>

            <div>
              <label
                htmlFor="market-rules-input"
                className="block text-xs font-medium text-slate-300 mb-1"
              >
                Resolution Source &amp; Rules Note
              </label>
              <textarea
                id="market-rules-input"
                rows={2}
                value={resolutionRules}
                onChange={(e) => setResolutionRules(e.target.value)}
                className="w-full p-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
              />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full min-h-[46px] rounded-xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all disabled:opacity-50"
            >
              {isBusy ? 'Publishing Market...' : 'Publish Live Campus Market'}
            </button>
          </form>
        )}
      </div>

      {/* 2. Market Resolution Engine (Admin Only) */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>2. Market Resolution Engine ({openMarkets.length} Open)</span>
          </h3>
          <span className="text-[11px] text-slate-400">Admin Only</span>
        </div>

        <p className="text-xs text-slate-400">
          Resolving a market executes <code className="text-emerald-300">resolve_market</code>{' '}
          and automatically pays <strong>100 Coins per winning share</strong> into
          all winning shareholders&apos; balances.
        </p>

        {!isAdmin ? (
          <div className="p-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-slate-400 text-center">
            Switch to <strong>Admin</strong> role above to resolve or refund active
            markets.
          </div>
        ) : (
          <div className="space-y-2.5">
            {openMarkets.map((m) => {
              const { yesPrice, noPrice } = calculateMarketPrices(
                m.yesPool,
                m.noPool
              );
              return (
                <div
                  key={m.id}
                  className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-white leading-snug">
                      {m.title}
                    </p>
                    <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                      YES {yesPrice}% / NO {noPrice}%
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleResolveClick(m.id, 'YES')}
                      className="min-h-[38px] px-2 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-[#10B981] font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve YES</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleResolveClick(m.id, 'NO')}
                      className="min-h-[38px] px-2 rounded-lg bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 border border-[#F43F5E]/40 text-[#F43F5E] font-bold text-xs flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Resolve NO</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleResolveClick(m.id, 'CANCEL')}
                      className="min-h-[38px] px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Refund</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Community Creator Manager (Admin Only) */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-sky-400" />
            <span>3. Community Creator Manager</span>
          </h3>
          <span className="text-[11px] text-slate-400">Admin Only</span>
        </div>

        <p className="text-xs text-slate-400">
          Promote trusted campus ambassadors or club heads to{' '}
          <strong className="text-white">creator</strong> role so they can launch
          college events.
        </p>

        {!isAdmin ? (
          <div className="p-3.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-slate-400 text-center">
            Switch to <strong>Admin</strong> role above to promote community
            creators.
          </div>
        ) : (
          <form onSubmit={handlePromoteSubmit} className="flex gap-2">
            <input
              type="text"
              required
              aria-label="Username or email to promote"
              placeholder="Username or email (e.g. kabir_vit)"
              value={targetHandle}
              onChange={(e) => setTargetHandle(e.target.value)}
              className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#10B981]"
            />
            <select
              aria-label="Select new role"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as UserRole)}
              className="min-h-[42px] px-2.5 rounded-xl bg-[#090D16] border border-[#1E293B] text-xs text-white"
            >
              <option value="creator">Creator</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
            <button
              type="submit"
              disabled={isBusy}
              className="min-h-[42px] px-3.5 rounded-xl bg-[#10B981] text-slate-950 font-bold text-xs shrink-0"
            >
              Promote
            </button>
          </form>
        )}
      </div>

      {/* Modal for viewing/copying supabase/schema.sql */}
      {showSqlModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sql-modal-title"
        >
          <div className="w-full max-w-[430px] max-h-[85vh] bg-[#131B2E] border border-[#1E293B] rounded-3xl p-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
              <div>
                <h3 id="sql-modal-title" className="text-sm font-bold text-white">
                  supabase/schema.sql
                </h3>
                <p className="text-[11px] text-slate-400">
                  Complete PostgreSQL Schema, RPCs (`place_trade`, `resolve_market`) &amp;
                  Seeds
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="min-h-[36px] px-3 rounded-xl bg-[#10B981] text-slate-950 font-bold text-xs flex items-center gap-1"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy SQL</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlModal(false)}
                  className="min-h-[36px] px-3 rounded-xl bg-slate-800 text-xs text-slate-300 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            <pre className="mt-3 p-3 rounded-xl bg-[#090D16] border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-auto flex-1 leading-relaxed">
              {sqlText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
