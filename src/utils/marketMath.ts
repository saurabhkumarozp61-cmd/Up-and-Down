/**
 * Core Polymarket / Kalshi Trading Engine (₹100 Base Settlement per 1.0000 Full Share),
 * Early Exit (Sell Before Final Result) Profit Booking & Stop-Loss Math,
 * Manual UPI Deposit Validation, and Granular RBAC Helpers.
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
  sharesAllocated: number; // Fractional shares minted by integrating the pool curve, rounded down to 4 dp
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
  executionPrice: number; // Average executable sell price after pool impact
  costBasisSold: number;
  payoutAmount: number; // Reverse-curve cash payout after pool impact
  realizedPnl: number;
  realizedRoiPercent: number;
  remainingShares: number;
  newYesPrice: number;
  newNoPrice: number;
  newYesPool: number;
  newNoPool: number;
}

const MIN_POOL_RESERVE = 1;
const SHARE_PRECISION = 4;

function finitePositive(value: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function floorTo(value: number, precision: number): number {
  const scale = 10 ** precision;
  return Math.floor((value + Number.EPSILON) * scale) / scale;
}

/**
 * Integrates 1 / executable price while the selected outcome's pool reserve
 * grows from `fromReserve` to `toReserve`. This is the buy-side cost curve;
 * using the same integral in reverse for sells prevents a spot-price round trip
 * from creating value. Prices are bounded to the displayed ₹1..₹99 range.
 */
function sharesForReserveIncrease(
  fromReserve: number,
  toReserve: number,
  oppositeReserve: number
): number {
  const from = Math.max(MIN_POOL_RESERVE, fromReserve);
  const to = Math.max(from, toReserve);
  const other = Math.max(MIN_POOL_RESERVE, oppositeReserve);
  if (to <= from) return 0;

  const lowerBand = other / 99; // selected-side probability = 1%
  const upperBand = other * 99; // selected-side probability = 99%
  const points = [from, lowerBand, upperBand, to]
    .filter((point) => point > from && point < to)
    .sort((a, b) => a - b);
  points.unshift(from);
  points.push(to);

  let shares = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const midpoint = (start + end) / 2;
    const probability = midpoint / (midpoint + other);

    if (probability <= 0.01) {
      shares += end - start; // ₹1/share floor
    } else if (probability >= 0.99) {
      shares += (end - start) / 99; // ₹99/share cap
    } else {
      shares += (end - start + other * Math.log(end / start)) / 100;
    }
  }
  return shares;
}

function getSelectedPools(yesPool: number, noPool: number, side: TradeSide) {
  const safeYes = finitePositive(yesPool, 5000);
  const safeNo = finitePositive(noPool, 5000);
  return side === 'YES'
    ? { selected: safeYes, opposite: safeNo }
    : { selected: safeNo, opposite: safeYes };
}

/**
 * Calculates implied YES and NO prices in ₹1..₹99 (where YES Price + NO Price = ₹100).
 */
export function calculateMarketPrices(yesPool: number, noPool: number): MarketPrices {
  const safeYes = finitePositive(yesPool, 5000);
  const safeNo = finitePositive(noPool, 5000);
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
 * AMM buy preview: cash is added to the chosen outcome's pool and fractional
 * shares are calculated by integrating the changing price along the entire
 * trade, not by multiplying at the pre-trade spot price.
 */
export function calculateTradePreview(
  yesPool: number,
  noPool: number,
  side: TradeSide,
  amount: number
): TradePreview {
  const numericAmount = Number(amount);
  const cleanAmount =
    Number.isFinite(numericAmount) && numericAmount > 0
      ? Number(numericAmount.toFixed(2))
      : 0;
  const { selected, opposite } = getSelectedPools(yesPool, noPool, side);
  const { yesPrice, noPrice } = calculateMarketPrices(yesPool, noPool);
  const spotPrice = side === 'YES' ? yesPrice : noPrice;
  const rawSharesAllocated =
    cleanAmount > 0
      ? sharesForReserveIncrease(selected, selected + cleanAmount, opposite)
      : 0;
  // Round down so share precision can never give the buyer more than paid for.
  const sharesAllocated = floorTo(rawSharesAllocated, SHARE_PRECISION);
  // Quote the full-curve average before share-precision flooring; dividing by
  // the rounded quantity can spuriously exceed the ₹99 database price ceiling.
  const rawExecutionPrice =
    rawSharesAllocated > 0 ? cleanAmount / rawSharesAllocated : spotPrice;
  const executionPrice =
    Math.min(BASE_SETTLEMENT_VALUE - 1, Math.max(1, rawExecutionPrice));

  const potentialPayout = Number(
    (sharesAllocated * BASE_SETTLEMENT_VALUE).toFixed(2)
  );
  const netProfit = Number((potentialPayout - cleanAmount).toFixed(2));
  const returnPercentage =
    cleanAmount > 0
      ? Number((((potentialPayout - cleanAmount) / cleanAmount) * 100).toFixed(1))
      : 0;

  const newYesPool = side === 'YES' ? selected + cleanAmount : opposite;
  const newNoPool = side === 'NO' ? selected + cleanAmount : opposite;
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
 * Calculates the exact reverse-curve sell quote. The pool payout is found by
 * inverting the buy integral with binary search, so selling the shares just
 * bought against an unchanged market returns no more than the original stake.
 */
export function calculateEarlyExitSell(params: {
  yesPool: number;
  noPool: number;
  side: TradeSide;
  sharesHeld: number;
  sharesToSell: number;
  entryPrice: number;
}): EarlyExitSellPreview {
  const heldValue = Number(params.sharesHeld);
  const requestedValue = Number(params.sharesToSell);
  const safeHeld = floorTo(
    Number.isFinite(heldValue) ? Math.max(0, heldValue) : 0,
    SHARE_PRECISION
  );
  const requested = floorTo(
    Number.isFinite(requestedValue) ? Math.max(0, requestedValue) : 0,
    SHARE_PRECISION
  );
  const { selected, opposite } = getSelectedPools(
    params.yesPool,
    params.noPool,
    params.side
  );
  const { yesPrice, noPrice } = calculateMarketPrices(params.yesPool, params.noPool);
  const currentLivePrice = params.side === 'YES' ? yesPrice : noPrice;

  const maxPayout = Math.max(0, selected - MIN_POOL_RESERVE);
  const maxSellableShares = sharesForReserveIncrease(
    selected - maxPayout,
    selected,
    opposite
  );
  const sharesToSell = Math.min(safeHeld, requested, maxSellableShares);

  let low = 0;
  let high = maxPayout;
  for (let iteration = 0; iteration < 64 && sharesToSell > 0; iteration += 1) {
    const midpoint = (low + high) / 2;
    const reverseShares = sharesForReserveIncrease(
      selected - midpoint,
      selected,
      opposite
    );
    if (reverseShares < sharesToSell) low = midpoint;
    else high = midpoint;
  }

  // Round cash down to cents so a precision boundary cannot create a free gain.
  const payoutAmount = floorTo(low, 2);
  const executionPrice =
    sharesToSell > 0 ? payoutAmount / sharesToSell : currentLivePrice;
  const entryPrice = Number.isFinite(Number(params.entryPrice)) && Number(params.entryPrice) > 0
    ? Number(params.entryPrice)
    : currentLivePrice;
  const costBasisSold = Number((sharesToSell * entryPrice).toFixed(2));
  const realizedPnl = Number((payoutAmount - costBasisSold).toFixed(2));
  const realizedRoiPercent =
    costBasisSold > 0
      ? Number(((realizedPnl / costBasisSold) * 100).toFixed(1))
      : 0;
  const remainingShares = Number(Math.max(0, safeHeld - sharesToSell).toFixed(4));
  const sellPercentage =
    safeHeld > 0 ? Math.round((sharesToSell / safeHeld) * 100) : 0;

  const newSelectedPool = Math.max(
    MIN_POOL_RESERVE,
    selected - payoutAmount
  );
  const newYesPool = params.side === 'YES' ? newSelectedPool : opposite;
  const newNoPool = params.side === 'NO' ? newSelectedPool : opposite;
  const newPrices = calculateMarketPrices(newYesPool, newNoPool);

  return {
    side: params.side,
    sharesHeld: safeHeld,
    sharesToSell,
    sellPercentage,
    entryPrice,
    currentLivePrice,
    executionPrice,
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
