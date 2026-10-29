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
  Clock,
  IndianRupee,
  Lock,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';
import {
  UserProfile,
  PositionItem,
  TransactionItem,
  FlexCardData,
} from '../types.ts';
import {
  calculateEarlyExitSell,
  checkDailyClaimEligibility,
  isOwnerEmail,
  isRealMoneyEligible,
} from '../utils/marketMath.ts';

interface PortfolioViewProps {
  user: UserProfile | null;
  positions: PositionItem[];
  transactions: TransactionItem[];
  isClaimingRefill: boolean;
  onClaimRefill: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenFlexCard: (data: FlexCardData) => void;
  onOpenUpiWallet: () => void;
  onSellPositionEarly?: (
    positionId: number,
    sharesToSell: number
  ) => Promise<{ sharesSold: number; creditedAmount: number; executionPrice: number }>;
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
  onOpenUpiWallet,
  onSellPositionEarly,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const [subTab, setSubTab] = useState<'positions' | 'history'>('positions');
  const [sellingPositionId, setSellingPositionId] = useState<number | null>(
    null
  );
  const [sellPercentByPos, setSellPercentByPos] = useState<
    Record<number, number>
  >({});
  const [sellStatusBanner, setSellStatusBanner] = useState<string | null>(null);
  const [sellErrorBanner, setSellErrorBanner] = useState<string | null>(null);

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
            Sign up in 10 seconds to claim 1,000 Free Virtual Coins, track
            active YES/NO positions, and book profit anytime before final
            resolution.
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
  const winRate =
    user.resolvedCount > 0
      ? Math.round((user.winsCount / user.resolvedCount) * 100)
      : 0;

  const dailyEligibility = checkDailyClaimEligibility(user.lastDailyClaim);
  const isOwner = isOwnerEmail(user.email);
  const realMoneyEligible = isRealMoneyEligible(user);

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

  const handleEarlyExitSell = async (pos: PositionItem) => {
    if (!onSellPositionEarly) return;
    setSellErrorBanner(null);
    setSellStatusBanner(null);
    const pct = sellPercentByPos[pos.id] ?? 100;
    const sharesHeld = Number(pos.sharesQuantity || pos.shares / 100 || 0);
    const requestedShares =
      pct === 100
        ? sharesHeld
        : Number(((sharesHeld * pct) / 100).toFixed(4));
    const fallbackYes =
      pos.side === 'YES' ? pos.currentPrice * 100 : (100 - pos.currentPrice) * 100;
    const fallbackNo =
      pos.side === 'NO' ? pos.currentPrice * 100 : (100 - pos.currentPrice) * 100;
    const quote = calculateEarlyExitSell({
      yesPool: pos.marketYesPool ?? fallbackYes,
      noPool: pos.marketNoPool ?? fallbackNo,
      side: pos.side,
      sharesHeld,
      sharesToSell: requestedShares,
      entryPrice: pos.entryPrice,
    });
    const sharesToSell = quote.sharesToSell;
    if (sharesToSell <= 0) return;

    setSellingPositionId(pos.id);
    try {
      const result = await onSellPositionEarly(pos.id, sharesToSell);
      const payout = Number(result.creditedAmount || 0);
      const executionPrice = Number(result.executionPrice || quote.executionPrice);
      const unitLabel = pos.walletType === 'REAL_INR' ? '₹' : '';
      setSellStatusBanner(
        `Sale confirmed: ${Number(result.sharesSold || sharesToSell).toFixed(4)} ${pos.side} shares filled at an average ₹${executionPrice.toFixed(2)}. Credited ${unitLabel}${payout.toLocaleString('en-IN')}${pos.walletType === 'REAL_INR' ? '' : ' Coins'}.`
      );
    } catch (err: any) {
      setSellErrorBanner(err.message || 'Early exit sell failed');
    } finally {
      setSellingPositionId(null);
    }
  };

  return (
    <div className="space-y-4">
      {sellStatusBanner && (
        <div
          data-testid="early-exit-status-banner"
          className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-300"
        >
          {sellStatusBanner}
        </div>
      )}

      {sellErrorBanner && (
        <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200">
          {sellErrorBanner}
        </div>
      )}

      {/* User Identity & Net Worth Card */}
      <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">
                @{user.username}
              </h2>
              <span className="text-xs text-emerald-400 font-semibold">
                · {isOwner ? 'OWNER & ADMIN' : user.role.toUpperCase()}
              </span>
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
            <p className="text-[11px] text-slate-400">UPI Real ₹</p>
            <p className="text-sm font-bold font-mono-tabular text-emerald-400">
              ₹
              {Number(
                user.walletBalanceInr ?? user.realMoneyBalance ?? 0
              ).toLocaleString('en-IN')}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Virtual Coins</p>
            <p className="text-sm font-bold font-mono-tabular text-white">
              {user.coinBalance.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">Estimated Exit Value</p>
            <p className="text-sm font-bold font-mono-tabular text-amber-300">
              ₹{Math.round(activePortfolioValue).toLocaleString('en-IN')} (
              {winRate}% W)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUpiWallet}
          className="w-full min-h-[42px] px-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
        >
          {realMoneyEligible ? (
            <>
              <IndianRupee className="w-4 h-4" />
              <span>Open UPI Wallet &amp; Share Calculator</span>
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Invite-Only Real Money UPI Wallet &amp; Calculator</span>
            </>
          )}
        </button>
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
                : 'Daily 100 Coin Claim & Friend Referral'}
            </span>
          </h3>
          <span className="text-xs font-mono-tabular text-amber-300">
            1x / Day · +500 / Friend
          </span>
        </div>

        <p className="text-xs text-slate-300 mb-3 leading-relaxed">
          Claim your Daily 100 Coin Drop (once every 24h) or share your invite
          link to earn <strong className="text-white">+500 Bonus Coins</strong>{' '}
          per friend.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={isClaimingRefill || !dailyEligibility.canClaim}
            onClick={onClaimRefill}
            className={`min-h-[44px] px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
              dailyEligibility.canClaim
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                : 'bg-[#090D16] border border-[#1E293B] text-slate-400 cursor-not-allowed'
            }`}
          >
            {dailyEligibility.canClaim ? (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  {isClaimingRefill ? 'Claiming...' : 'Claim +100 Daily Coins'}
                </span>
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Next in {dailyEligibility.remainingLabel}</span>
              </>
            )}
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
          <span>Passbook &amp; Ledger ({transactions.length})</span>
        </button>
      </div>

      {subTab === 'positions' ? (
        <div className="space-y-2.5">
          {positions.length === 0 ? (
            <div className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-6 text-center text-xs text-slate-400">
              No active positions yet. Back a YES or NO outcome on the Markets
              tab!
            </div>
          ) : (
            positions.map((pos) => {
              const isRealInr = pos.walletType === 'REAL_INR';
              const sharesHeld = Number(
                pos.sharesQuantity || pos.shares / 100 || 0
              );
              const selectedSellPct = sellPercentByPos[pos.id] ?? 100;
              const requestedShares =
                selectedSellPct === 100
                  ? sharesHeld
                  : Number(((sharesHeld * selectedSellPct) / 100).toFixed(4));
              const fallbackYes =
                pos.side === 'YES' ? pos.currentPrice * 100 : (100 - pos.currentPrice) * 100;
              const fallbackNo =
                pos.side === 'NO' ? pos.currentPrice * 100 : (100 - pos.currentPrice) * 100;
              const exitQuote = calculateEarlyExitSell({
                yesPool: pos.marketYesPool ?? fallbackYes,
                noPool: pos.marketNoPool ?? fallbackNo,
                side: pos.side,
                sharesHeld,
                sharesToSell: requestedShares,
                entryPrice: pos.entryPrice,
              });
              const sharesToSell = exitQuote.sharesToSell;
              const liveExitPayout =
                pos.walletType === 'REAL_INR'
                  ? exitQuote.payoutAmount
                  : Math.floor(exitQuote.payoutAmount);
              const costOfSold = Number(
                (sharesToSell * pos.entryPrice).toFixed(2)
              );
              const liveExitPnl = Number(
                (liveExitPayout - costOfSold).toFixed(2)
              );

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
                  data-testid={`portfolio-position-card-${pos.id}`}
                  className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-xs text-slate-400">
                          {pos.marketCategory} ·{' '}
                          {pos.exitedEarly
                            ? `Sold Early @ ₹${pos.exitPrice || pos.currentPrice}`
                            : pos.settled
                            ? isRealInr
                              ? `Settled (₹${pos.payoutCoins} Paid)`
                              : `Settled (${pos.payoutCoins} Coins Paid)`
                            : 'Active Open Position'}
                        </span>
                        {isRealInr && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                            ₹ REAL MONEY
                          </span>
                        )}
                      </div>
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
                      aria-label={`Share flex card for ${pos.marketTitle.slice(
                        0,
                        24
                      )}`}
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#090D16] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-emerald-400 flex items-center gap-1 shrink-0"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Flex</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono-tabular">
                    <div>
                      <span className="text-slate-400 block">
                        Side &amp; Entry
                      </span>
                      <span
                        className={`font-bold ${
                          pos.side === 'YES'
                            ? 'text-[#10B981]'
                            : 'text-[#F43F5E]'
                        }`}
                      >
                        {pos.side} @ ₹{pos.entryPrice.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Shares Held</span>
                      <span className="font-bold text-emerald-300">
                        {sharesHeld} sh
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Mid Price</span>
                      <span className="font-semibold text-white">
                        ₹{pos.currentPrice}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Win @ ₹100</span>
                      <span className="font-bold text-[#10B981]">
                        {isRealInr
                          ? `₹${pos.potentialPayout.toLocaleString('en-IN')}`
                          : `${pos.potentialPayout.toLocaleString()} C`}
                      </span>
                    </div>
                  </div>

                  {/* EARLY EXIT (SELL BEFORE FINAL RESULT / PROFIT BOOKING & STOP-LOSS) */}
                  {!pos.settled &&
                    pos.marketStatus === 'open' &&
                    sharesHeld > 0 &&
                    onSellPositionEarly && (
                      <div
                        data-testid={`early-exit-box-${pos.id}`}
                        className="p-3 rounded-xl bg-[#090D16] border border-[#1E293B] space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sky-300 flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>
                              Estimated Exit After Pool Impact
                            </span>
                          </span>
                          <span
                            className={`font-mono-tabular font-bold ${
                              liveExitPnl >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {liveExitPnl >= 0 ? '+' : ''}
                            {isRealInr ? '₹' : ''}
                            {liveExitPnl} P&amp;L
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                          {[25, 50, 75, 100].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() =>
                                setSellPercentByPos((prev) => ({
                                  ...prev,
                                  [pos.id]: pct,
                                }))
                              }
                              className={`min-h-[30px] rounded-lg font-mono-tabular font-bold text-[11px] border ${
                                selectedSellPct === pct
                                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                                  : 'bg-[#131B2E] border-[#1E293B] text-slate-400'
                              }`}
                            >
                              {pct === 100 ? '100% All' : `${pct}%`}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          disabled={sellingPositionId === pos.id}
                          data-testid={`early-exit-sell-btn-${pos.id}`}
                          onClick={() => handleEarlyExitSell(pos)}
                          className="w-full min-h-[38px] rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          <span>
                            {sellingPositionId === pos.id
                              ? 'Selling at the quoted market amount...'
                              : `Sell ${sharesToSell} sh · Est. ${
                                  isRealInr ? '₹' : ''
                                }${liveExitPayout.toLocaleString('en-IN')}${
                                  isRealInr ? '' : ' Coins'
                                }`}
                          </span>
                        </button>
                      </div>
                    )}
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
            transactions.map((tx) => {
              const isRealTx = tx.type.startsWith('REAL_');
              return (
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
                    {isRealTx
                      ? `${tx.amount >= 0 ? '+' : '-'}₹${Math.abs(
                          tx.amount
                        ).toLocaleString('en-IN')}`
                      : `${
                          tx.amount >= 0 ? `+${tx.amount}` : tx.amount
                        } Coins`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
