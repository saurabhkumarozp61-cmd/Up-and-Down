import React, { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  Coins,
  ArrowRight,
  ShieldCheck,
  IndianRupee,
  Lock,
  Calculator,
  PlusCircle,
} from 'lucide-react';
import { MarketItem, UserProfile } from '../types.ts';
import {
  calculateMarketPrices,
  calculateRealMoneyBet,
  calculateTradePreview,
  isRealMoneyEligible,
  OWNER_EMAIL,
  TradeSide,
  WalletMode,
} from '../utils/marketMath.ts';

interface TradeSheetModalProps {
  market: MarketItem | null;
  initialSide: TradeSide;
  initialWalletType?: WalletMode;
  initialAmount?: number;
  user: UserProfile | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirmTrade: (
    marketId: number,
    side: TradeSide,
    amount: number,
    walletType: WalletMode
  ) => void;
  onRequireAuth: () => void;
  onOpenUpiWallet: () => void;
}

const PRESET_AMOUNTS = [10, 100, 250, 500];

export const TradeSheetModal: React.FC<TradeSheetModalProps> = ({
  market,
  initialSide,
  initialWalletType = 'COINS',
  initialAmount = 200,
  user,
  isSubmitting,
  error,
  onClose,
  onConfirmTrade,
  onRequireAuth,
  onOpenUpiWallet,
}) => {
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [walletType, setWalletType] = useState<WalletMode>(initialWalletType);
  const [amount, setAmount] = useState<number>(initialAmount);

  useEffect(() => {
    setSide(initialSide);
    setWalletType(initialWalletType);
    setAmount(initialAmount || 200);
  }, [initialSide, initialWalletType, initialAmount, market]);

  if (!market) return null;

  const isRealMoneyMode = walletType === 'REAL_INR';
  const eligibleForRealMoney = isRealMoneyEligible(user);

  const { yesPrice, noPrice } = calculateMarketPrices(
    market.yesPool,
    market.noPool
  );
  const preview = calculateTradePreview(
    market.yesPool,
    market.noPool,
    side,
    amount
  );
  const realBetCalc = calculateRealMoneyBet(
    market.yesPool,
    market.noPool,
    side,
    amount
  );

  const availableCoins = user ? user.coinBalance : 1000;
  const availableRealInr = user
    ? Number(user.walletBalanceInr ?? user.realMoneyBalance ?? 0)
    : 0;
  const activeAvailableBalance = isRealMoneyMode
    ? availableRealInr
    : availableCoins;

  const handleQuickAmount = (val: number) => {
    if (user && val > activeAvailableBalance && activeAvailableBalance > 0) {
      setAmount(activeAvailableBalance);
    } else {
      setAmount(val);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }
    if (isRealMoneyMode && !eligibleForRealMoney) {
      onOpenUpiWallet();
      return;
    }
    if (amount <= 0) return;
    onConfirmTrade(market.id, side, amount, walletType);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-sheet-title"
    >
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto bg-[#131B2E] border-t border-x border-[#1E293B] rounded-t-3xl p-5 text-white shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Grab Handle */}
        <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-3.5" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div>
            <p className="text-xs text-slate-400 mb-1">
              {market.category} ·{' '}
              <span className="text-emerald-400 font-semibold">
                YES ₹{yesPrice} + NO ₹{noPrice} = ₹100 Base
              </span>
            </p>
            <h2
              id="trade-sheet-title"
              className="text-base font-bold leading-snug text-white"
            >
              {market.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trade sheet"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#090D16] border border-[#1E293B] text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WALLET MODE SWITCHER: VIRTUAL COINS VS REAL MONEY (₹ UPI) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#090D16] rounded-2xl border border-[#1E293B] mb-3.5">
          <button
            type="button"
            data-testid="trade-mode-coins-btn"
            onClick={() => setWalletType('COINS')}
            className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              !isRealMoneyMode
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Virtual Coins</span>
          </button>

          <button
            type="button"
            data-testid="trade-mode-real-inr-btn"
            onClick={() => setWalletType('REAL_INR')}
            className={`min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              isRealMoneyMode
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <IndianRupee className="w-3.5 h-3.5" />
            <span>Real Money (₹ UPI)</span>
            {!eligibleForRealMoney && (
              <Lock className="w-3 h-3 text-amber-400" />
            )}
          </button>
        </div>

        {/* Invite-Only Gate Notice if User selects Real Money Mode without Owner Approval */}
        {isRealMoneyMode && user && !eligibleForRealMoney && (
          <div
            data-testid="trade-sheet-invite-gate"
            className="p-3.5 mb-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/40 space-y-2 text-xs"
          >
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300">
                  Real Money (₹ UPI) Trading is Invite-Only
                </p>
                <p className="text-slate-300 mt-0.5 leading-relaxed">
                  Only the Owner (
                  <strong className="text-white">{OWNER_EMAIL}</strong>) and
                  Owner-whitelisted users (`has_payment_and_trading_access`) can
                  trade with Real Money ₹.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenUpiWallet();
              }}
              className="w-full min-h-[38px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs"
            >
              {user.realMoneyStatus === 'pending'
                ? 'View Pending Invite Status'
                : 'Fill Invite-Only Access Form'}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* YES / NO Side Toggle */}
          <div className="grid grid-cols-2 gap-2.5 p-1 bg-[#090D16] rounded-2xl border border-[#1E293B]">
            <button
              type="button"
              onClick={() => setSide('YES')}
              className={`min-h-[46px] px-3 py-2 rounded-xl font-semibold text-sm flex items-center justify-between transition-all ${
                side === 'YES'
                  ? 'bg-[#10B981] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>YES</span>
              <span className="font-mono-tabular">₹{yesPrice}</span>
            </button>

            <button
              type="button"
              onClick={() => setSide('NO')}
              className={`min-h-[46px] px-3 py-2 rounded-xl font-semibold text-sm flex items-center justify-between transition-all ${
                side === 'NO'
                  ? 'bg-[#F43F5E] text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>NO</span>
              <span className="font-mono-tabular">₹{noPrice}</span>
            </button>
          </div>

          {/* Investment Input & Balance */}
          <div className="bg-[#090D16] border border-[#1E293B] rounded-2xl p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <label htmlFor="trade-amount-input" className="font-medium">
                {isRealMoneyMode
                  ? 'Investment Amount (₹ INR · Min ₹10 Fractional)'
                  : 'Investment Amount (Virtual Coins · Min 10)'}
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono-tabular text-slate-300">
                  Available:{' '}
                  {isRealMoneyMode
                    ? `₹${availableRealInr.toLocaleString('en-IN')}`
                    : `${availableCoins.toLocaleString()} Coins`}
                </span>
                {isRealMoneyMode && eligibleForRealMoney && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpiWallet();
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>Add ₹</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isRealMoneyMode ? (
                <IndianRupee className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <Coins className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <input
                id="trade-amount-input"
                type="number"
                min={10}
                max={user ? Math.max(10, activeAvailableBalance || 10000) : 10000}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-transparent text-2xl font-bold font-mono-tabular text-white focus:outline-none"
              />
              {user && activeAvailableBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(activeAvailableBalance)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 shrink-0"
                >
                  MAX
                </button>
              )}
            </div>

            {/* Quick Preset Chips (Includes ₹10 Fractional Test) */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleQuickAmount(preset)}
                  className={`min-h-[36px] rounded-xl text-xs font-mono-tabular font-semibold border transition-colors ${
                    amount === preset
                      ? 'bg-slate-800 border-slate-500 text-white'
                      : 'bg-[#131B2E] border-[#1E293B] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {isRealMoneyMode ? `₹${preset}` : `${preset}`}
                </button>
              ))}
            </div>
          </div>

          {/* Live Payout & Fractional Shares Box */}
          <div
            data-testid="trade-live-preview"
            className={`rounded-2xl p-3.5 border ${
              side === 'YES'
                ? 'bg-[#10B981]/10 border-[#10B981]/30'
                : 'bg-[#F43F5E]/10 border-[#F43F5E]/30'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-semibold mb-2">
              <div className="flex items-center gap-1.5">
                {isRealMoneyMode ? (
                  <Calculator className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <TrendingUp
                    className={`w-4 h-4 shrink-0 ${
                      side === 'YES' ? 'text-[#10B981]' : 'text-[#F43F5E]'
                    }`}
                  />
                )}
                <span className="text-white">
                  {isRealMoneyMode ? (
                    <>
                      Invest ₹{realBetCalc.stakeInr.toLocaleString('en-IN')}{' '}
                      &rarr; Win ₹
                      {realBetCalc.grossPayoutInr.toLocaleString('en-IN')} (+₹
                      {realBetCalc.netProfitInr.toLocaleString('en-IN')} Profit)
                    </>
                  ) : (
                    <>
                      Invest {preview.investedCoins.toLocaleString()} Coins &rarr;
                      Win {preview.potentialPayout.toLocaleString()} Coins (+
                      {preview.returnPercentage}% Return)
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div>
                <p className="text-slate-400">Entry Price</p>
                <p className="font-mono-tabular font-semibold text-white">
                  ₹{preview.executionPrice} / sh
                </p>
              </div>
              <div>
                <p className="text-slate-400">Shares Allocated</p>
                <p
                  data-testid="trade-shares-allocated"
                  className="font-mono-tabular font-bold text-emerald-300"
                >
                  {preview.sharesAllocated} sh
                </p>
              </div>
              <div>
                <p className="text-slate-400">Dynamic Price Shift</p>
                <p className="font-mono-tabular font-semibold text-emerald-300">
                  YES ₹{yesPrice} &rarr; ₹{preview.newYesPrice}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-200">
              {error}
            </div>
          )}

          {/* Confirm CTA */}
          <button
            type="submit"
            disabled={
              isSubmitting ||
              (user !== null &&
                (!isRealMoneyMode || eligibleForRealMoney) &&
                amount > activeAvailableBalance)
            }
            className="w-full min-h-[50px] rounded-2xl poly-gradient-btn font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {!user ? (
              <>
                <span>Sign In to Buy {side}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : isRealMoneyMode && !eligibleForRealMoney ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Apply for Invite-Only Real Money Access</span>
              </>
            ) : amount > activeAvailableBalance ? (
              <span>
                Insufficient {isRealMoneyMode ? 'UPI Balance' : 'Coins'} (
                {isRealMoneyMode
                  ? `₹${availableRealInr} Available`
                  : `${availableCoins} Available`}
                )
              </span>
            ) : isSubmitting ? (
              <span>Executing Atomic Trade...</span>
            ) : (
              <>
                <span>
                  {isRealMoneyMode
                    ? `Buy ${preview.sharesAllocated} ${side} Shares · ₹${amount.toLocaleString(
                        'en-IN'
                      )}`
                    : `Buy ${preview.sharesAllocated} ${side} Shares · ${amount.toLocaleString()} Coins`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              1 Winning Share = ₹100 · Sell Early Anytime at Live Market Price
            </span>
          </p>
        </form>
      </div>
    </div>
  );
};
