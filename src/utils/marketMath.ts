/**
 * Core Polymarket / Kalshi Trading Engine (₹100 Base Settlement per 1.0000 Full Share),
 * Early Exit (Sell Before Final Result) Profit Booking & Stop-Loss Math,
 * Direct Manual UPI QR + 12-Digit UTR Validation, and Granular RBAC Helpers.
 */

export type TradeSide = 'YES' | 'NO';
export type RealMoneyAccessStatus = 'none' | 'pending' | 'approved' | 'rejected';
export type WalletMode = 'COINS' | 'REAL_INR';

export const BASE_SETTLEMENT_VALUE = 100; // ₹100 (or 100 Coins) per 1.0000 full share
export const OWNER_EMAIL = 'saurabhhkumarr2023@gmail.com';
export const DEFAULT_OWNER_UPI_ID = '9931802215@fam';
export const DEFAULT_OWNER_UPI_NAME = 'Saurabh Kumar (Owner Main Account)';
export const DEFAULT_OWNER_INVITE_CODE = 'UPDOWN2026';
export const VIP_CREATOR_INVITE_CODE = 'SAURABHVIP';
export const DAILY_CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // Strict 24 hours (1 time per day)

export interface MarketPools {
  yesPool: number;
  noPool: number;
}

export interface MarketPrices {
  yesPrice: number; // Clamped ₹1..₹99 (YES Price + NO Price = ₹100)
  noPrice: number;  // 100 - yesPrice
  yesProbability: number;
  noProbability: number;
}

export interface TradePreview {
  side: TradeSide;
  investedCoins: number;
  investmentAmount: number;
  executionPrice: number;
  shares: number;          // Legacy compatibility: potentialPayout (sharesQuantity * 100)
  sharesAllocated: number; // Exact fractional shares: Number((amount / executionPrice).toFixed(4))
  contracts: number;       // Alias for sharesAllocated (1 full share settles at ₹100)
  potentialPayout: number; // Total payout if side wins: Number((sharesAllocated * 100).toFixed(2))
  netProfit: number;
  returnPercentage: number;
  newYesPrice: number;
  newNoPrice: number;
  newYesPool: number;
  newNoPool: number;
}

export interface EarlyExitSellPreview {
  side: TradeSide;
  sharesHeld: number;
  sharesToSell: number;
  sellPercentage: number;
  entryPrice: number;
  currentLivePrice: number;
  costBasisSold: number;
  payoutAmount: number; // Exact formula: Shares Sold * Current Live Market Price
  realizedPnl: number;
  realizedRoiPercent: number;
  remainingShares: number;
  newYesPrice: number;
  newNoPrice: number;
  newYesPool: number;
  newNoPool: number;
}

/**
 * Calculates implied YES and NO prices in ₹1..₹99 (where YES Price + NO Price = ₹100).
 */
export function calculateMarketPrices(yesPool: number, noPool: number): MarketPrices {
  const safeYes = Math.max(1, Number(yesPool) || 5000);
  const safeNo = Math.max(1, Number(noPool) || 5000);
  const total = safeYes + safeNo;

  const rawYes = Math.round((safeYes / total) * BASE_SETTLEMENT_VALUE);
  const yesPrice = Math.max(1, Math.min(99, rawYes));
  const noPrice = BASE_SETTLEMENT_VALUE - yesPrice;

  return {
    yesPrice,
    noPrice,
    yesProbability: yesPrice,
    noProbability: noPrice,
  };
}

/**
 * Polymarket / Kalshi ₹100-Base Buy Preview:
 * - Share Price is between ₹1 and ₹99 (`YES + NO = ₹100`).
 * - `Shares Allocated = Investment Amount / Current Share Price` (supports fractional & whole shares, e.g. ₹10 at ₹60 = 0.1667 shares; ₹6,000 at ₹60 = 100 shares).
 * - Each 1.0000 winning share settles at ₹100 (`Potential Payout = Shares Allocated * 100`).
 * - Dynamic AMM pool shift increases the bought side's price and decreases the opposite side's price proportionally.
 */
export function calculateTradePreview(
  yesPool: number,
  noPool: number,
  side: TradeSide,
  amount: number
): TradePreview {
  const cleanAmount = Math.max(0, Number(Number(amount || 0).toFixed(2)));
  const { yesPrice, noPrice } = calculateMarketPrices(yesPool, noPool);
  const executionPrice = side === 'YES' ? yesPrice : noPrice;

  // Fractional & Whole Shares formula: Shares Allocated = Investment Amount / Current Share Price
  const rawSharesAllocated = cleanAmount > 0 ? cleanAmount / executionPrice : 0;
  const sharesAllocated = Number(rawSharesAllocated.toFixed(4));

  // Winning shares settle at ₹100 per 1 full share
  const potentialPayout = Number((sharesAllocated * BASE_SETTLEMENT_VALUE).toFixed(2));
  const netProfit = Number(Math.max(0, potentialPayout - cleanAmount).toFixed(2));
  const returnPercentage =
    cleanAmount > 0
      ? Number((((potentialPayout - cleanAmount) / cleanAmount) * 100).toFixed(1))
      : 0;

  const poolDelta = Math.max(0, Math.round(cleanAmount));
  const newYesPool = side === 'YES' ? Math.max(100, Number(yesPool) + poolDelta) : Math.max(100, Number(yesPool));
  const newNoPool = side === 'NO' ? Math.max(100, Number(noPool) + poolDelta) : Math.max(100, Number(noPool));
  const newPrices = calculateMarketPrices(newYesPool, newNoPool);

  return {
    side,
    investedCoins: Math.round(cleanAmount),
    investmentAmount: cleanAmount,
    executionPrice,
    shares: Math.round(potentialPayout),
    sharesAllocated,
    contracts: sharesAllocated,
    potentialPayout,
    netProfit,
    returnPercentage,
    newYesPrice: newPrices.yesPrice,
    newNoPrice: newPrices.noPrice,
    newYesPool,
    newNoPool,
  };
}

/**
 * Early Exit (Sell Before Final Result / Profit Booking & Stop-Loss):
 * - Users can sell their YES or NO shares (fully or partially) at any time while the event is open.
 * - Formula on Early Exit: `Payout = Shares Sold * Current Live Market Price`
 * - Example: Bought 100 YES shares at ₹60 (₹6,000). Live price rises to ₹80 -> Payout = 100 * ₹80 = ₹8,000 (+₹2,000 profit).
 * - If live price drops to ₹25 -> Payout = 100 * ₹25 = ₹2,500 (-₹3,500 stop-loss).
 */
export function calculateEarlyExitSell(params: {
  yesPool: number;
  noPool: number;
  side: TradeSide;
  sharesHeld: number;
  sharesToSell: number;
  entryPrice: number;
}): EarlyExitSellPreview {
  const safeHeld = Math.max(0, Number(Number(params.sharesHeld || 0).toFixed(4)));
  const clampedToSell = Math.max(
    0,
    Math.min(safeHeld, Number(Number(params.sharesToSell || 0).toFixed(4)))
  );
  const { yesPrice, noPrice } = calculateMarketPrices(params.yesPool, params.noPool);
  const currentLivePrice = params.side === 'YES' ? yesPrice : noPrice;

  const payoutAmount = Number((clampedToSell * currentLivePrice).toFixed(2));
  const costBasisSold = Number((clampedToSell * Number(params.entryPrice || currentLivePrice)).toFixed(2));
  const realizedPnl = Number((payoutAmount - costBasisSold).toFixed(2));
  const realizedRoiPercent =
    costBasisSold > 0
      ? Number(((realizedPnl / costBasisSold) * 100).toFixed(1))
      : 0;
  const remainingShares = Number(Math.max(0, safeHeld - clampedToSell).toFixed(4));
  const sellPercentage =
    safeHeld > 0 ? Math.round((clampedToSell / safeHeld) * 100) : 0;

  // Selling shares reduces the active side's pool proportionally, moving price down on that side
  const poolReduction = Math.round(payoutAmount);
  const newYesPool =
    params.side === 'YES'
      ? Math.max(100, Number(params.yesPool) - poolReduction)
      : Math.max(100, Number(params.yesPool));
  const newNoPool =
    params.side === 'NO'
      ? Math.max(100, Number(params.noPool) - poolReduction)
      : Math.max(100, Number(params.noPool));
  const newPrices = calculateMarketPrices(newYesPool, newNoPool);

  return {
    side: params.side,
    sharesHeld: safeHeld,
    sharesToSell: clampedToSell,
    sellPercentage,
    entryPrice: Number(params.entryPrice || currentLivePrice),
    currentLivePrice,
    costBasisSold,
    payoutAmount,
    realizedPnl,
    realizedRoiPercent,
    remainingShares,
    newYesPrice: newPrices.yesPrice,
    newNoPrice: newPrices.noPrice,
    newYesPool,
    newNoPool,
  };
}

/**
 * Converts a starting YES probability (1..99%) into initial YES and NO liquidity pools
 * totaling `totalInitialLiquidity` (default 10,000).
 */
export function getInitialPoolsFromProbability(
  startingYesProbability: number,
  totalInitialLiquidity = 10000
): MarketPools {
  const clampedProb = Math.max(5, Math.min(95, Math.round(startingYesProbability)));
  const yesPool = Math.round((clampedProb / 100) * totalInitialLiquidity);
  const noPool = totalInitialLiquidity - yesPool;
  return { yesPool, noPool };
}

export interface LeaderboardEntryInput {
  id: string;
  username: string;
  collegeName: string;
  coinBalance: number;
  activePortfolioValue: number;
  winsCount: number;
  resolvedCount: number;
}

export interface PredictorLeaderboardItem extends LeaderboardEntryInput {
  netWorth: number;
  winRate: number;
  rank: number;
}

export interface CollegeWarsItem {
  collegeName: string;
  totalNetWorth: number;
  activePredictors: number;
  avgWinRate: number;
  topPredictor: string;
  rank: number;
}

/**
 * Computes individual Top Predictors ranked by Net Worth = Available Coins + Active Portfolio Value
 */
export function rankPredictors(entries: LeaderboardEntryInput[]): PredictorLeaderboardItem[] {
  return entries
    .map((entry) => {
      const netWorth = Math.round((entry.coinBalance || 0) + (entry.activePortfolioValue || 0));
      const winRate =
        entry.resolvedCount > 0
          ? Math.round((entry.winsCount / entry.resolvedCount) * 100)
          : 0;
      return {
        ...entry,
        netWorth,
        winRate,
        rank: 0,
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth || b.winRate - a.winRate)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

/**
 * Aggregates predictors by college_name for the national "College Wars" leaderboard.
 */
export function aggregateCollegeWars(entries: LeaderboardEntryInput[]): CollegeWarsItem[] {
  const rankedUsers = rankPredictors(entries);
  const map = new Map<
    string,
    {
      collegeName: string;
      totalNetWorth: number;
      activePredictors: number;
      winRateSum: number;
      topPredictor: string;
      topPredictorNetWorth: number;
    }
  >();

  for (const user of rankedUsers) {
    const college = user.collegeName.trim() || 'Independent Campus';
    const existing = map.get(college);
    if (!existing) {
      map.set(college, {
        collegeName: college,
        totalNetWorth: user.netWorth,
        activePredictors: 1,
        winRateSum: user.winRate,
        topPredictor: user.username,
        topPredictorNetWorth: user.netWorth,
      });
    } else {
      existing.totalNetWorth += user.netWorth;
      existing.activePredictors += 1;
      existing.winRateSum += user.winRate;
      if (user.netWorth > existing.topPredictorNetWorth) {
        existing.topPredictor = user.username;
        existing.topPredictorNetWorth = user.netWorth;
      }
    }
  }

  return Array.from(map.values())
    .map((group) => ({
      collegeName: group.collegeName,
      totalNetWorth: group.totalNetWorth,
      activePredictors: group.activePredictors,
      avgWinRate: Math.round(group.winRateSum / group.activePredictors),
      topPredictor: group.topPredictor,
      rank: 0,
    }))
    .sort((a, b) => b.totalNetWorth - a.totalNetWorth || b.activePredictors - a.activePredictors)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}

/**
 * Granular RBAC Check 1: `is_community_approved`
 * Only the Owner (`saurabhhkumarr2023@gmail.com`) and users explicitly approved by the Owner
 * can enter and interact with the community/events. Uninvited signups see the Waiting for Owner Approval screen.
 */
export function isCommunityApprovedUser(
  user?: {
    email?: string | null;
    role?: string | null;
    isCommunityApproved?: boolean | null;
  } | null
): boolean {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  if (user.role === 'admin' || user.role === 'creator') return true;
  return Boolean(user.isCommunityApproved);
}

/**
 * Granular RBAC Check 2: `can_create_events`
 * By default ONLY the Owner (`saurabhhkumarr2023@gmail.com`) can create events, unless the Owner
 * explicitly enables `can_create_events` (or creator/admin role) for a user.
 */
export function canUserCreateEvents(
  user?: {
    email?: string | null;
    role?: string | null;
    canCreateEvents?: boolean | null;
  } | null
): boolean {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  if (user.role === 'admin' || user.role === 'creator') return true;
  return Boolean(user.canCreateEvents);
}

/**
 * Granular RBAC Check 3: `has_payment_and_trading_access`
 * Real wallet deposits and real-money trading are ONLY unlocked for the Owner
 * and specific users whitelisted/approved by the Owner.
 */
export function isRealMoneyEligible(
  user?: {
    email?: string | null;
    realMoneyStatus?: string | null;
    hasPaymentAndTradingAccess?: boolean | null;
  } | null
): boolean {
  if (!user) return false;
  if (isOwnerEmail(user.email)) return true;
  if (user.hasPaymentAndTradingAccess) return true;
  return user.realMoneyStatus === 'approved';
}

export interface DailyClaimEligibility {
  canClaim: boolean;
  remainingMs: number;
  remainingLabel: string;
}

/**
 * Enforces that a user can claim the +100 Daily Coin Drop strictly ONCE every 24 hours.
 */
export function checkDailyClaimEligibility(
  lastDailyClaim: Date | string | null | undefined,
  nowMs: number = Date.now()
): DailyClaimEligibility {
  if (!lastDailyClaim) {
    return { canClaim: true, remainingMs: 0, remainingLabel: 'Available now' };
  }

  const lastTime =
    lastDailyClaim instanceof Date
      ? lastDailyClaim.getTime()
      : new Date(lastDailyClaim).getTime();

  if (isNaN(lastTime)) {
    return { canClaim: true, remainingMs: 0, remainingLabel: 'Available now' };
  }

  const elapsed = nowMs - lastTime;
  if (elapsed >= DAILY_CLAIM_COOLDOWN_MS) {
    return { canClaim: true, remainingMs: 0, remainingLabel: 'Available now' };
  }

  const remainingMs = Math.max(0, DAILY_CLAIM_COOLDOWN_MS - elapsed);
  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const remainingLabel =
    hours > 0 ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;

  return {
    canClaim: false,
    remainingMs,
    remainingLabel,
  };
}

/**
 * Sanitizes and validates a user-chosen custom User ID (@username).
 */
export function validateCustomUsername(raw: string): {
  valid: boolean;
  clean: string;
  error?: string;
} {
  const clean = (raw || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase();

  if (clean.length < 3) {
    return {
      valid: false,
      clean,
      error: 'User ID must be at least 3 characters (letters, numbers, underscores).',
    };
  }
  if (clean.length > 24) {
    return {
      valid: false,
      clean,
      error: 'User ID must be 24 characters or fewer.',
    };
  }
  return { valid: true, clean };
}

/**
 * Validates an Indian UPI ID / VPA (e.g., name@okaxis, 9876543210@ybl, user@paytm).
 */
export function validateUpiId(rawUpiId: string): {
  valid: boolean;
  clean: string;
  error?: string;
} {
  const clean = (rawUpiId || '').trim().toLowerCase();
  const upiRegex = /^[a-z0-9._-]{2,40}@[a-z0-9]{2,20}$/;
  if (!upiRegex.test(clean)) {
    return {
      valid: false,
      clean,
      error: 'Enter a valid UPI ID (e.g. name@okaxis, number@ybl, user@paytm).',
    };
  }
  return { valid: true, clean };
}

/**
 * Strictly validates a 12-digit NPCI UPI UTR / Transaction Reference Number.
 */
export function validateUtrNumber(rawUtr: string): {
  valid: boolean;
  clean: string;
  error?: string;
} {
  const clean = (rawUtr || '').replace(/\s+/g, '').trim();
  if (!/^\d{12}$/.test(clean)) {
    return {
      valid: false,
      clean,
      error: 'Please enter a valid 12-digit numeric UPI UTR / Transaction ID (e.g. 412839405812).',
    };
  }
  return { valid: true, clean };
}

/**
 * Builds a standard NPCI `upi://pay` URI for Direct Manual UPI QR Code & Deep-Link Intent.
 */
export function buildUpiPaymentUri(params: {
  upiId?: string;
  payeeName?: string;
  amountInr: number;
  note?: string;
}): string {
  const pa = (params.upiId || DEFAULT_OWNER_UPI_ID).trim();
  const pn = (params.payeeName || DEFAULT_OWNER_UPI_NAME).trim();
  const am = Math.max(10, Number(params.amountInr) || 0).toFixed(2);
  const tn = (params.note || 'Up and Down Wallet Deposit').trim();
  return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(
    pn
  )}&am=${encodeURIComponent(am)}&cu=INR&tn=${encodeURIComponent(tn)}`;
}

export interface UpiDepositCalculation {
  amountInr: number;
  gatewayFeeInr: number;
  netWalletCreditInr: number;
  equivalentContractsAt50: number;
  valid: boolean;
  error?: string;
}

/**
 * Calculates the UPI deposit breakdown (0% UPI fee, 100% wallet credit in ₹ INR upon Owner UTR approval).
 */
export function calculateUpiDepositSummary(amountInr: number): UpiDepositCalculation {
  const cleanAmount = Number(Number(amountInr || 0).toFixed(2));
  if (cleanAmount < 10) {
    return {
      amountInr: cleanAmount,
      gatewayFeeInr: 0,
      netWalletCreditInr: 0,
      equivalentContractsAt50: 0,
      valid: false,
      error: 'Minimum UPI deposit amount is ₹10.',
    };
  }
  if (cleanAmount > 100000) {
    return {
      amountInr: cleanAmount,
      gatewayFeeInr: 0,
      netWalletCreditInr: 0,
      equivalentContractsAt50: 0,
      valid: false,
      error: 'Maximum single UPI deposit is ₹1,00,000.',
    };
  }
  return {
    amountInr: cleanAmount,
    gatewayFeeInr: 0,
    netWalletCreditInr: cleanAmount,
    equivalentContractsAt50: Number((cleanAmount / 50).toFixed(4)),
    valid: true,
  };
}

export interface RealMoneyBetCalculation {
  side: TradeSide;
  stakeInr: number;
  sharePriceInr: number;
  contracts: number; // Fractional or whole shares allocated: stakeInr / sharePriceInr
  grossPayoutInr: number; // contracts * ₹100
  netProfitInr: number;
  multiplier: number;
  roiPercent: number;
  newYesPrice: number;
  newNoPrice: number;
}

/**
 * Full-featured Real Money (₹ INR) Bet & Return Calculator (₹100 Base per 1.0000 full share).
 */
export function calculateRealMoneyBet(
  yesPool: number,
  noPool: number,
  side: TradeSide,
  stakeInr: number
): RealMoneyBetCalculation {
  const preview = calculateTradePreview(yesPool, noPool, side, stakeInr);
  const multiplier =
    preview.investmentAmount > 0
      ? Number((preview.potentialPayout / preview.investmentAmount).toFixed(2))
      : 0;

  return {
    side,
    stakeInr: preview.investmentAmount,
    sharePriceInr: preview.executionPrice,
    contracts: preview.sharesAllocated,
    grossPayoutInr: preview.potentialPayout,
    netProfitInr: preview.netProfit,
    multiplier,
    roiPercent: preview.returnPercentage,
    newYesPrice: preview.newYesPrice,
    newNoPrice: preview.newNoPrice,
  };
}
