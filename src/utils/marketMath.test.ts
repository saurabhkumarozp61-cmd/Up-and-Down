import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMarketPrices,
  calculateTradePreview,
  getInitialPoolsFromProbability,
  rankPredictors,
  aggregateCollegeWars,
} from './marketMath';

test('calculateMarketPrices computes 50/50 starting odds and clamps between 1 and 99', () => {
  const equal = calculateMarketPrices(5000, 5000);
  assert.equal(equal.yesPrice, 50);
  assert.equal(equal.noPrice, 50);

  const highYes = calculateMarketPrices(99900, 100);
  assert.equal(highYes.yesPrice, 99);
  assert.equal(highYes.noPrice, 1);

  const lowYes = calculateMarketPrices(10, 99990);
  assert.equal(lowYes.yesPrice, 1);
  assert.equal(lowYes.noPrice, 99);
});

test('calculateTradePreview computes exact shares, potential payout, return %, and pool shift', () => {
  // At 50/50 odds (5,000 / 5,000), buying 200 Coins of YES at price 50:
  // shares = (200 / 50) * 100 = 400, potentialPayout = 400 (+100% return)
  const preview = calculateTradePreview(5000, 5000, 'YES', 200);
  assert.equal(preview.executionPrice, 50);
  assert.equal(preview.shares, 400);
  assert.equal(preview.potentialPayout, 400);
  assert.equal(preview.netProfit, 200);
  assert.equal(preview.returnPercentage, 100);
  assert.equal(preview.newYesPool, 5200);
  assert.equal(preview.newNoPool, 5000);
  assert.equal(preview.newYesPrice, 51);
  assert.equal(preview.newNoPrice, 49);
});

test('getInitialPoolsFromProbability converts slider probability into balanced liquidity pools', () => {
  const pools = getInitialPoolsFromProbability(65, 10000);
  assert.equal(pools.yesPool, 6500);
  assert.equal(pools.noPool, 3500);
});

test('rankPredictors and aggregateCollegeWars rank individuals and colleges accurately', () => {
  const predictors = [
    {
      id: '1',
      username: 'arjun_iitb',
      collegeName: 'IIT Bombay',
      coinBalance: 2000,
      activePortfolioValue: 1500,
      winsCount: 8,
      resolvedCount: 10,
    },
    {
      id: '2',
      username: 'anya_du',
      collegeName: 'DU North Campus (SRCC)',
      coinBalance: 3200,
      activePortfolioValue: 900,
      winsCount: 9,
      resolvedCount: 10,
    },
    {
      id: '3',
      username: 'rahul_iitb',
      collegeName: 'IIT Bombay',
      coinBalance: 1200,
      activePortfolioValue: 300,
      winsCount: 3,
      resolvedCount: 5,
    },
  ];

  const ranked = rankPredictors(predictors);
  assert.equal(ranked[0].username, 'anya_du');
  assert.equal(ranked[0].netWorth, 4100);
  assert.equal(ranked[0].rank, 1);

  const colleges = aggregateCollegeWars(predictors);
  // IIT Bombay has 3500 + 1500 = 5000 > DU 4100
  assert.equal(colleges[0].collegeName, 'IIT Bombay');
  assert.equal(colleges[0].totalNetWorth, 5000);
  assert.equal(colleges[0].activePredictors, 2);
  assert.equal(colleges[0].topPredictor, 'arjun_iitb');
});
