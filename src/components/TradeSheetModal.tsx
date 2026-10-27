import React, { useState, useEffect } from 'react';
import { X, TrendingUp, Coins, ArrowRight, ShieldCheck } from 'lucide-react';
import { MarketItem, UserProfile } from '../types.ts';
import {
  calculateMarketPrices,
  calculateTradePreview,
  TradeSide,
} from '../utils/marketMath.ts';

interface TradeSheetModalProps {
  market: MarketItem | null;
  initialSide: TradeSide;
  user: UserProfile | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirmTrade: (marketId: number, side: TradeSide, amount: number) => void;
  onRequireAuth: () => void;
}

const PRESET_AMOUNTS = [50, 100, 200, 500];

export const TradeSheetModal: React.FC<TradeSheetModalProps> = ({
  market,
  initialSide,
  user,
  isSubmitting,
  error,
  onClose,
  onConfirmTrade,
  onRequireAuth,
}) => {
  const [side, setSide] = useState<TradeSide>(initialSide);
  const [amount, setAmount] = useState<number>(200);

  useEffect(() => {
    setSide(initialSide);
  }, [initialSide, market]);

  if (!market) return null;

  const { yesPrice, noPrice } = calculateMarketPrices(market.yesPool, market.noPool);
  const preview = calculateTradePreview(market.yesPool, market.noPool, side, amount);
  const availableCoins = user ? user.coinBalance : 1000;

  const handleQuickAmount = (val: number) => {
    if (user && val > user.coinBalance && user.coinBalance > 0) {
      setAmount(user.coinBalance);
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
    if (amount <= 0) return;
    onConfirmTrade(market.id, side, amount);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-sheet-title"
    >
      <div className="w-full max-w-[430px] bg-[#131B2E] border-t border-x border-[#1E293B] rounded-t-3xl p-5 text-white shadow-2xl animate-in slide-in-from-bottom duration-200">
        {/* Grab Handle */}
        <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">
              {market.category} · 100 Coins per Winning Share
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
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-800/70 text-slate-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* YES / NO Side Toggle */}
          <div className="grid grid-cols-2 gap-2.5 p-1 bg-[#090D16] rounded-2xl border border-[#1E293B]">
            <button
              type="button"
              onClick={() => setSide('YES')}
              className={`min-h-[48px] px-3 py-2 rounded-xl font-semibold text-sm flex items-center justify-between transition-all ${
                side === 'YES'
                  ? 'bg-[#10B981] text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>YES</span>
              <span className="font-mono-tabular">{yesPrice} Coins</span>
            </button>

            <button
              type="button"
              onClick={() => setSide('NO')}
              className={`min-h-[48px] px-3 py-2 rounded-xl font-semibold text-sm flex items-center justify-between transition-all ${
                side === 'NO'
                  ? 'bg-[#F43F5E] text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>NO</span>
              <span className="font-mono-tabular">{noPrice} Coins</span>
            </button>
          </div>

          {/* Investment Input & Balance */}
          <div className="bg-[#090D16] border border-[#1E293B] rounded-2xl p-3.5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <label htmlFor="trade-amount-input" className="font-medium">
                Investment Amount (Virtual Coins)
              </label>
              <span className="font-mono-tabular text-slate-300">
                Available: {availableCoins.toLocaleString()} Coins
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-amber-400 shrink-0" />
              <input
                id="trade-amount-input"
                type="number"
                min={10}
                max={user ? Math.max(10, user.coinBalance) : 10000}
                value={amount}
                onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-transparent text-2xl font-bold font-mono-tabular text-white focus:outline-none"
              />
              {user && user.coinBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(user.coinBalance)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 shrink-0"
                >
                  MAX
                </button>
              )}
            </div>

            {/* Quick Preset Chips */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleQuickAmount(preset)}
                  className={`min-h-[38px] rounded-xl text-xs font-mono-tabular font-semibold border transition-colors ${
                    amount === preset
                      ? 'bg-slate-800 border-slate-500 text-white'
                      : 'bg-[#131B2E] border-[#1E293B] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  +{preset}
                </button>
              ))}
            </div>
          </div>

          {/* Live Payout Preview Box (Required Spec Formula) */}
          <div
            data-testid="trade-live-preview"
            className={`rounded-2xl p-3.5 border ${
              side === 'YES'
                ? 'bg-[#10B981]/10 border-[#10B981]/30'
                : 'bg-[#F43F5E]/10 border-[#F43F5E]/30'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold mb-2">
              <TrendingUp
                className={`w-4 h-4 ${
                  side === 'YES' ? 'text-[#10B981]' : 'text-[#F43F5E]'
                }`}
              />
              <span className="text-white">
                Investing {preview.investedCoins.toLocaleString()} Coins &rarr; Potential
                Payout: {preview.potentialPayout.toLocaleString()} Coins (+
                {preview.returnPercentage}% Return)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div>
                <p className="text-slate-400">Share Price</p>
                <p className="font-mono-tabular font-semibold text-white">
                  {preview.executionPrice} Coins
                </p>
              </div>
              <div>
                <p className="text-slate-400">Shares Formula</p>
                <p className="font-mono-tabular font-semibold text-white">
                  {preview.shares.toFixed(1)} pts
                </p>
              </div>
              <div>
                <p className="text-slate-400">Odds Impact</p>
                <p className="font-mono-tabular font-semibold text-emerald-300">
                  YES {yesPrice}% &rarr; {preview.newYesPrice}%
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
            disabled={isSubmitting || (user !== null && amount > user.coinBalance)}
            className={`w-full min-h-[50px] rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 ${
              side === 'YES'
                ? 'bg-[#10B981] hover:bg-emerald-400 text-slate-950'
                : 'bg-[#F43F5E] hover:bg-rose-400 text-white'
            }`}
          >
            {!user ? (
              <>
                <span>Sign In to Buy {side} &amp; Claim 1,000 Free Coins</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : amount > user.coinBalance ? (
              <span>Insufficient Coins ({user.coinBalance} Available)</span>
            ) : isSubmitting ? (
              <span>Executing Atomic Trade...</span>
            ) : (
              <>
                <span>
                  Confirm Buy {side} · {amount.toLocaleString()} Coins
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>100% Virtual Demo Coins · Zero Real Money · Instant Settlement</span>
          </p>
        </form>
      </div>
    </div>
  );
};
