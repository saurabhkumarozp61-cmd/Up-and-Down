import { useState } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  GraduationCap,
  Flame,
  Trophy,
} from 'lucide-react';
import { FlexCardData } from '../types.ts';

interface FlexCardModalProps {
  flexData: FlexCardData | null;
  onClose: () => void;
}

export function FlexCardModal({ flexData, onClose }: FlexCardModalProps) {
  const [copied, setCopied] = useState(false);

  if (!flexData) return null;

  const challengeUrl = `${window.location.origin}/?ref=${encodeURIComponent(
    flexData.username
  )}&market=${flexData.marketId}`;

  const shareText = `I just backed ${flexData.side} (${flexData.entryOdds}% odds) on "${flexData.marketTitle}" on Up & Down! Potential Payout: ${flexData.potentialPayout} Coins (+${flexData.returnPercentage}%). Think I'm wrong? Bet against me & claim 1,000 Free Coins:`;

  const handleCopyChallenge = async () => {
    try {
      await navigator.clipboard.writeText(`${shareText} ${challengeUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Up & Down — Challenge My Pick!',
          text: shareText,
          url: challengeUrl,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    await handleCopyChallenge();
  };

  const isYes = flexData.side === 'YES';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flex-card-title"
    >
      <div className="w-full max-w-[375px] flex flex-col items-center">
        {/* Top Close Action */}
        <div className="w-full flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400" />
            <span>Snap / Insta / Telegram Flex Card</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close flex card modal"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Vertical Story Card (Instagram / Snapchat 9:16 Feel) */}
        <div
          data-testid="story-flex-card"
          className="w-full rounded-3xl p-6 bg-gradient-to-b from-[#131B2E] via-[#090D16] to-[#131B2E] border-2 border-[#1E293B] shadow-2xl relative overflow-hidden"
        >
          {/* Top Brand & Category */}
          <div className="flex items-center justify-between text-xs text-slate-400 mb-5">
            <span className="font-display font-bold tracking-wider text-white">
              <span className="text-[#10B981]">UP</span> &amp;{' '}
              <span className="text-[#F43F5E]">DOWN</span>
            </span>
            <span>{flexData.category}</span>
          </div>

          {/* Predictor Identity */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-[#10B981]">
              @{flexData.username.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-white">@{flexData.username}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
                <span>{flexData.collegeName}</span>
              </p>
            </div>
          </div>

          {/* Market Question */}
          <h3
            id="flex-card-title"
            className="text-lg font-bold leading-snug text-white mb-5"
          >
            &ldquo;{flexData.marketTitle}&rdquo;
          </h3>

          {/* Position & Odds Highlight Box */}
          <div
            className={`rounded-2xl p-4 mb-5 border ${
              isYes
                ? 'bg-[#10B981]/15 border-[#10B981]/40'
                : 'bg-[#F43F5E]/15 border-[#F43F5E]/40'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-300">MY POSITION</span>
              <span className="text-xs font-mono-tabular text-slate-300">
                ENTRY ODDS: {flexData.entryOdds}%
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span
                className={`text-2xl font-extrabold font-display ${
                  isYes ? 'text-[#10B981]' : 'text-[#F43F5E]'
                }`}
              >
                BACKING {flexData.side}
              </span>
              <span className="text-sm font-mono-tabular font-bold text-white">
                +{flexData.returnPercentage}% Return
              </span>
            </div>
          </div>

          {/* Stake & Potential Payout Grid */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-[#090D16]/90 border border-[#1E293B] mb-5">
            <div>
              <p className="text-[11px] text-slate-400">Staked Coins</p>
              <p className="text-base font-bold font-mono-tabular text-white">
                {flexData.investedCoins.toLocaleString()} Coins
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Potential Payout</p>
              <p className="text-base font-bold font-mono-tabular text-[#10B981] flex items-center gap-1">
                <Trophy className="w-4 h-4 text-amber-400" />
                {flexData.potentialPayout.toLocaleString()} Coins
              </p>
            </div>
          </div>

          {/* Challenge Footer */}
          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-xs font-semibold text-slate-200">
              Think I&apos;m wrong? Fade my pick on Up &amp; Down
            </p>
            <p className="text-[11px] text-[#10B981] mt-0.5">
              Claim 1,000 Free Coins + 500 Referral Bonus with @{flexData.username}
            </p>
          </div>
        </div>

        {/* Share Controls */}
        <div className="w-full grid grid-cols-2 gap-2.5 mt-4">
          <button
            type="button"
            onClick={handleCopyChallenge}
            className="min-h-[48px] px-4 rounded-2xl bg-[#131B2E] hover:bg-slate-800 border border-[#1E293B] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#10B981]" />
                <span className="text-[#10B981]">Challenge Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-300" />
                <span>Copy Challenge Link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleNativeShare}
            className="min-h-[48px] px-4 rounded-2xl bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Share to Story / DM</span>
          </button>
        </div>
      </div>
    </div>
  );
}
