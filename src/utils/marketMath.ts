/**
 * Pure Polymarket-style virtual coin pricing, pool odds, and leaderboard math.
 * Strictly uses Virtual Demo Coins (no Web3 / no real money).
 */

export type TradeSide = 'YES' | 'NO';

export interface MarketPools {
  yesPool: number;
  noPool: number;
}

export interface MarketPrices {
  yesPrice: number; // Clamped 1..99 Coins
  noPrice: number;  // 100 - yesPrice
  yesProbability: number;
  noProbability: number;
}

export interface TradePreview {
  side: TradeSide;
  investedCoins: number;
  executionPrice: number;
  shares: number;          // Exact formula: (amount / current_price) * 100
  contracts: number;       // Number of 100-coin payout contracts: amount / current_price
  potentialPayout: number; // Total coins paid if side wins (100 coins per contract = round(shares))
  netProfit: number;
  returnPercentage: number;
  newYesPrice: number;
  newNoPrice: number;
  newYesPool: number;
  newNoPool: number;
}

/**
 * Calculates implied YES and NO prices in Virtual Coins (clamped between 1 and 99).
 * Formula:
 *   YES Price = Math.round((yes_pool / (yes_pool + no_pool)) * 100)
 *   NO Price = 100 - YES Price
 */
export function calculateMarketPrices(yesPool: number, noPool: number): MarketPrices {
  const safeYes = Math.max(1, Number(yesPool) || 5000);
  const safeNo = Math.max(1, Number(noPool) || 5000);
  const total = safeYes + safeNo;

  const rawYes = Math.round((safeYes / total) * 100);
  const yesPrice = Math.max(1, Math.min(99, rawYes));
  const noPrice = 100 - yesPrice;

  return {
    yesPrice,
    noPrice,
    yesProbability: yesPrice,
    noProbability: noPrice,
  };
}

/**
 * Calculates live trade preview before confirming in the Trade Bottom-Sheet.
 * Every winning share contract pays out 100 Coins when the market resolves.
 * Exact formula from spec:
 *   shares = (amount / current_price) * 100
 */
export function calculateTradePreview(
  yesPool: number,
  noPool: number,
  side: TradeSide,
  amount: number
): TradePreview {
  const cleanAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const { yesPrice, noPrice } = calculateMarketPrices(yesPool, noPool);
  const executionPrice = side === 'YES' ? yesPrice : noPrice;

  // Exact shares calculation from specification
  const rawShares = cleanAmount > 0 ? (cleanAmount / executionPrice) * 100 : 0;
  const shares = Number(rawShares.toFixed(2));
  const contracts = Number((cleanAmount / executionPrice).toFixed(2));

  // Potential payout in Coins when market resolves in favour of `side`
  const potentialPayout = Math.round(rawShares);
  const netProfit = Math.max(0, potentialPayout - cleanAmount);
  const returnPercentage =
    cleanAmount > 0 ? Math.round(((potentialPayout - cleanAmount) / cleanAmount) * 100) : 0;

  const newYesPool = side === 'YES' ? Number(yesPool) + cleanAmount : Number(yesPool);
  const newNoPool = side === 'NO' ? Number(noPool) + cleanAmount : Number(noPool);
  const newPrices = calculateMarketPrices(newYesPool, newNoPool);

  return {
    side,
    investedCoins: cleanAmount,
    executionPrice,
    shares,
    contracts,
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
 * Converts a starting YES probability (1..99%) into initial YES and NO liquidity pools
 * totaling `totalInitialLiquidity` (default 10,000 coins).
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
