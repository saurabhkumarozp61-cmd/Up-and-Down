import React, { useState } from 'react';
import { Clock, Share2, Info, CheckCircle2, XCircle } from 'lucide-react';
import { MarketItem } from '../types.ts';
import { calculateMarketPrices, TradeSide } from '../utils/marketMath.ts';

interface MarketCardProps {
  market: MarketItem;
  onSelectTrade: (market: MarketItem, side: TradeSide) => void;
  onInspectMarket?: (market: MarketItem) => void;
  onShareMarket: (market: MarketItem) => void;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  market,
  onSelectTrade,
  onInspectMarket,
  onShareMarket,
}) => {
  const [showRules, setShowRules] = useState(false);
  const { yesPrice, noPrice } = calculateMarketPrices(market.yesPool, market.noPool);

  const formatVolume = (vol: number) => {
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
    return `${vol}`;
  };

  const getDaysRemaining = (closesAt: string) => {
    const diff = new Date(closesAt).getTime() - Date.now();
    if (diff <= 0) return 'Closed';
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days === 1) return '1d left';
    return `${days}d left`;
  };

  return (
    <article
      data-testid={`market-card-${market.id}`}
      className="bg-[#131B2E] border border-[#1E293B] rounded-2xl p-4 transition-colors hover:border-slate-700/80"
    >
      {/* Top Unboxed Metadata Row (Zero-Pill Discipline) */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2">
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-medium text-slate-300 truncate">{market.category}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">{formatVolume(market.totalVolume)} Coins Vol</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            {getDaysRemaining(market.closesAt)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 -mr-1">
          <button
            type="button"
            onClick={() => setShowRules((prev) => !prev)}
            aria-label={`View rules for ${market.title.slice(0, 28)}`}
            aria-expanded={showRules}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onShareMarket(market)}
            aria-label={`Share flex card for ${market.title.slice(0, 28)}`}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800/60 transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Market Question Headline (Clickable to inspect details & live calculator publicly) */}
      <h3 className="text-[15px] font-semibold leading-snug text-slate-50 mb-3">
        <button
          type="button"
          onClick={() =>
            onInspectMarket ? onInspectMarket(market) : setShowRules((prev) => !prev)
          }
          className="text-left hover:text-emerald-300 transition-colors"
        >
          {market.title}
        </button>
      </h3>

      {/* Optional Collapsible Resolution Rules */}
      {showRules && (
        <div className="mb-3 p-3 rounded-xl bg-[#090D16]/80 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
          <p className="font-medium text-slate-200 mb-1">
            Resolution Source &amp; Rules (Created by @{market.creatorUsername}):
          </p>
          <p>{market.resolutionRules}</p>
        </div>
      )}

      {/* Live Probability Bar */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between text-xs font-semibold mb-1.5 font-mono-tabular">
          <span className="text-[#10B981]">YES {yesPrice}%</span>
          <span className="text-[#F43F5E]">NO {noPrice}%</span>
        </div>
        <div className="w-full h-2.5 bg-[#090D16] rounded-full overflow-hidden flex p-0.5 gap-0.5 border border-slate-800/80">
          <div
            className="h-full bg-[#10B981] rounded-l-full transition-all duration-200"
            style={{ width: `${yesPrice}%` }}
          />
          <div
            className="h-full bg-[#F43F5E] rounded-r-full transition-all duration-200"
            style={{ width: `${noPrice}%` }}
          />
        </div>
      </div>

      {/* Action Buttons or Resolved Banner */}
      {market.status === 'open' ? (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onSelectTrade(market, 'YES')}
            className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#10B981]/15 hover:bg-[#10B981]/25 active:scale-[0.98] border border-[#10B981]/40 text-[#10B981] font-semibold text-xs flex items-center justify-between transition-all whitespace-nowrap"
          >
            <span>Buy YES</span>
            <span className="font-mono-tabular text-emerald-200">{yesPrice} Coins</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTrade(market, 'NO')}
            className="min-h-[44px] px-3 py-2.5 rounded-xl bg-[#F43F5E]/15 hover:bg-[#F43F5E]/25 active:scale-[0.98] border border-[#F43F5E]/40 text-[#F43F5E] font-semibold text-xs flex items-center justify-between transition-all whitespace-nowrap"
          >
            <span>Buy NO</span>
            <span className="font-mono-tabular text-rose-200">{noPrice} Coins</span>
          </button>
        </div>
      ) : market.status === 'resolved' ? (
        <div
          className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            market.outcome === 'YES'
              ? 'bg-[#10B981]/10 border-[#10B981]/30 text-[#10B981]'
              : 'bg-[#F43F5E]/10 border-[#F43F5E]/30 text-[#F43F5E]'
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            Resolved {market.outcome}
          </span>
          <span className="text-slate-300 font-mono-tabular">100 Coins / Winning Share</span>
        </div>
      ) : (
        <div className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between text-xs font-medium text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="w-4 h-4 text-slate-400" />
            Market Cancelled
          </span>
          <span>100% Coins Refunded</span>
        </div>
      )}
    </article>
  );
};
