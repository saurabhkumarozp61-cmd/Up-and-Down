import React, { useState } from 'react';
import {
  Coins,
  Share2,
  Copy,
  Check,
  Gift,
  Sparkles,
  History,
  Briefcase,
  LogOut,
  GraduationCap,
} from 'lucide-react';
import {
  UserProfile,
  PositionItem,
  TransactionItem,
  FlexCardData,
} from '../types.ts';

interface PortfolioViewProps {
  user: UserProfile | null;
  positions: PositionItem[];
  transactions: TransactionItem[];
  isClaimingRefill: boolean;
  onClaimRefill: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenFlexCard: (data: FlexCardData) => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  user,
  positions,
  transactions,
  isClaimingRefill,
  onClaimRefill,
  onOpenAuth,
  onLogout,
  onOpenFlexCard,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const [subTab, setSubTab] = useState<'positions' | 'history'>('positions');

  if (!user) {
    return (
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/30 flex items-center justify-center mx-auto text-[#10B981]">
          <Coins className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">
            Track Your Campus Portfolio
          </h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Sign up in 10 seconds to claim 1,000 Free Virtual Coins, track active YES/NO
            positions, and represent your college on the national leaderboard.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAuth}
          className="w-full min-h-[48px] rounded-2xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all"
        >
          Claim 1,000 Free Coins &amp; Sign In
        </button>
      </div>
    );
  }

  const activePositions = positions.filter((p) => !p.settled);
  const activePortfolioValue = activePositions.reduce(
    (sum, p) => sum + (p.currentValue || 0),
    0
  );
  const totalNetWorth = user.coinBalance + activePortfolioValue;
  const winRate =
    user.resolvedCount > 0
      ? Math.round((user.winsCount / user.resolvedCount) * 100)
      : 0;

  const referralLink = `${window.location.origin}/?ref=${encodeURIComponent(
    user.username
  )}`;

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2500);
    } catch {
      setCopiedRef(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* User Identity & Net Worth Card */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">@{user.username}</h2>
              <span className="text-xs text-slate-400">· {user.role.toUpperCase()}</span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <GraduationCap className="w-3.5 h-3.5 text-[#10B981]" />
              <span>{user.collegeName}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out of account"
            className="min-h-[38px] px-3 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-xs font-medium text-slate-300 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-[#090D16] border border-[#1E293B]">
          <div>
            <p className="text-[11px] text-slate-400">Net Worth</p>
            <p className="text-sm font-bold font-mono-tabular text-[#10B981]">
              {totalNetWorth.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Available Cash</p>
            <p className="text-sm font-bold font-mono-tabular text-white">
              {user.coinBalance.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Active Value</p>
            <p className="text-sm font-bold font-mono-tabular text-amber-300">
              {activePortfolioValue.toLocaleString()} ({winRate}% W)
            </p>
          </div>
        </div>
      </div>

      {/* Vault Refill & Viral Referral Loop Card */}
      <div
        className={`rounded-2xl p-4 border ${
          user.coinBalance < 50
            ? 'bg-amber-500/15 border-amber-400/50'
            : 'bg-[#131B2E] border-[#1E293B]'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-amber-400" />
            <span>
              {user.coinBalance < 50
                ? 'Out of Coins? Refill Your Campus Vault!'
                : 'Campus Vault & Referral Drops'}
            </span>
          </h3>
          <span className="text-xs font-mono-tabular text-amber-300">
            +500 / Friend
          </span>
        </div>

        <p className="text-xs text-slate-300 mb-3 leading-relaxed">
          Claim a Daily 100 Coin Login Drop or share your invite link on WhatsApp /
          Insta DMs to earn <strong className="text-white">+500 Bonus Coins</strong> for
          both you and your classmate.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={isClaimingRefill}
            onClick={onClaimRefill}
            className="min-h-[44px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {isClaimingRefill ? 'Claiming...' : 'Claim +100 Daily Drop'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleCopyReferral}
            className="min-h-[44px] px-3 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            {copiedRef ? (
              <>
                <Check className="w-4 h-4 text-[#10B981]" />
                <span className="text-[#10B981]">Invite Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-300" />
                <span>Copy +500 Invite Link</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Positions & Transactions Switcher */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-[#131B2E] rounded-xl border border-[#1E293B]">
        <button
          type="button"
          onClick={() => setSubTab('positions')}
          className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'positions'
              ? 'bg-[#090D16] text-white border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
          <span>My Positions ({positions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('history')}
          className={`min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
            subTab === 'history'
              ? 'bg-[#090D16] text-white border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5 text-sky-400" />
          <span>Coin Ledger ({transactions.length})</span>
        </button>
      </div>

      {subTab === 'positions' ? (
        <div className="space-y-2.5">
          {positions.length === 0 ? (
            <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-6 text-center text-xs text-slate-400">
              No active positions yet. Back a YES or NO outcome on the Markets tab!
            </div>
          ) : (
            positions.map((pos) => {
              const retPct =
                pos.investedCoins > 0
                  ? Math.round(
                      ((pos.potentialPayout - pos.investedCoins) /
                        pos.investedCoins) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={pos.id}
                  className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">
                        {pos.marketCategory} ·{' '}
                        {pos.settled
                          ? `Settled (${pos.payoutCoins} Coins Paid)`
                          : 'Active Position'}
                      </p>
                      <h4 className="text-sm font-semibold text-white leading-snug">
                        {pos.marketTitle}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onOpenFlexCard({
                          marketId: pos.marketId,
                          marketTitle: pos.marketTitle,
                          category: pos.marketCategory,
                          side: pos.side,
                          entryOdds: pos.entryPrice,
                          investedCoins: pos.investedCoins,
                          potentialPayout: pos.potentialPayout,
                          returnPercentage: retPct,
                          username: user.username,
                          collegeName: user.collegeName,
                        })
                      }
                      aria-label={`Share flex card for ${pos.marketTitle.slice(0, 24)}`}
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-emerald-400 flex items-center gap-1 shrink-0"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Flex</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono-tabular">
                    <div>
                      <span className="text-slate-400 block">Side &amp; Odds</span>
                      <span
                        className={`font-bold ${
                          pos.side === 'YES' ? 'text-[#10B981]' : 'text-[#F43F5E]'
                        }`}
                      >
                        {pos.side} @ {pos.entryPrice}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Invested</span>
                      <span className="font-semibold text-white">
                        {pos.investedCoins.toLocaleString()} Coins
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Win Payout</span>
                      <span className="font-bold text-[#10B981]">
                        {pos.potentialPayout.toLocaleString()} Coins
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl divide-y divide-[#1E293B] overflow-hidden">
          {transactions.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No transactions recorded yet.
            </div>
          ) : (
            transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {tx.description}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {tx.type.replace(/_/g, ' ')}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono-tabular font-bold shrink-0 ${
                    tx.amount >= 0 ? 'text-[#10B981]' : 'text-slate-300'
                  }`}
                >
                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} Coins
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
