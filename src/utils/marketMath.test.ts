import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEarlyExitSell,
  calculateMarketPrices,
  calculateRealMoneyBet,
  calculateTradePreview,
  canUserCreateEvents,
  isCommunityApprovedUser,
  isRealMoneyEligible,
  OWNER_EMAIL,
  validateUtrNumber,
} from './marketMath';

test('YES Price + NO Price always equals ₹100 and clamps between ₹1 and ₹99', () => {
  const prices = calculateMarketPrices(6000, 4000);
  assert.equal(prices.yesPrice, 60);
  assert.equal(prices.noPrice, 40);
  assert.equal(prices.yesPrice + prices.noPrice, 100);
});

test('AMM buys price all shares along the curve instead of using the pre-trade spot', () => {
  const wholePreview = calculateTradePreview(6000, 4000, 'YES', 6000);
  assert.ok(wholePreview.executionPrice > 60);
  assert.ok(wholePreview.executionPrice < 99);
  assert.ok(wholePreview.sharesAllocated < 100);
  assert.equal(
    wholePreview.potentialPayout,
    Number((wholePreview.sharesAllocated * 100).toFixed(2))
  );
  assert.ok(wholePreview.netProfit < wholePreview.potentialPayout);
  assert.ok(wholePreview.newYesPrice > 60);
  assert.equal(wholePreview.newYesPrice + wholePreview.newNoPrice, 100);

  const fracPreview = calculateTradePreview(6000, 4000, 'YES', 10);
  assert.ok(fracPreview.executionPrice > 60);
  assert.ok(fracPreview.sharesAllocated > 0.16);
  assert.ok(fracPreview.sharesAllocated < 10 / 60);
  assert.equal(fracPreview.sharesAllocated, Number(fracPreview.sharesAllocated.toFixed(4)));
  assert.equal(
    fracPreview.potentialPayout,
    Number((fracPreview.sharesAllocated * 100).toFixed(2))
  );
});

test('early exit pays the executable reverse-curve amount, not shares × spot price', () => {
  const profitExit = calculateEarlyExitSell({
    yesPool: 8000,
    noPool: 2000,
    side: 'YES',
    sharesHeld: 100,
    sharesToSell: 100,
    entryPrice: 60,
  });
  assert.equal(profitExit.currentLivePrice, 80);
  assert.ok(profitExit.payoutAmount > 0);
  assert.ok(profitExit.payoutAmount < 100 * profitExit.currentLivePrice);
  assert.equal(
    profitExit.realizedPnl,
    Number((profitExit.payoutAmount - profitExit.costBasisSold).toFixed(2))
  );
  assert.equal(profitExit.remainingShares, 0);
  assert.ok(profitExit.newYesPool > 0);
  assert.ok(profitExit.newYesPrice < profitExit.currentLivePrice);

  const stopLossExit = calculateEarlyExitSell({
    yesPool: 2500,
    noPool: 7500,
    side: 'YES',
    sharesHeld: 100,
    sharesToSell: 100,
    entryPrice: 60,
  });
  assert.equal(stopLossExit.currentLivePrice, 25);
  assert.ok(stopLossExit.payoutAmount < 100 * stopLossExit.currentLivePrice);
  assert.ok(stopLossExit.realizedPnl < 0);
  assert.equal(stopLossExit.remainingShares, 0);
});

test('regression: buying 12.5 YES shares for ₹1,000 at spot ₹80 cannot create coins on immediate resale', () => {
  const buy = calculateTradePreview(8000, 2000, 'YES', 1000);
  assert.equal(buy.newYesPrice, 82);
  assert.ok(buy.sharesAllocated < 12.5);

  const sell = calculateEarlyExitSell({
    yesPool: buy.newYesPool,
    noPool: buy.newNoPool,
    side: 'YES',
    sharesHeld: buy.sharesAllocated,
    sharesToSell: buy.sharesAllocated,
    entryPrice: buy.executionPrice,
  });

  assert.ok(sell.payoutAmount <= buy.investmentAmount);
  assert.ok(sell.realizedPnl <= 0);
  assert.ok(sell.newYesPool >= 8000);
  assert.equal(sell.remainingShares, 0);
});

test('buy/sell round trip is symmetric for NO and remains bounded after share rounding', () => {
  const buy = calculateTradePreview(2000, 8000, 'NO', 1000);
  const sell = calculateEarlyExitSell({
    yesPool: buy.newYesPool,
    noPool: buy.newNoPool,
    side: 'NO',
    sharesHeld: buy.sharesAllocated,
    sharesToSell: buy.sharesAllocated,
    entryPrice: buy.executionPrice,
  });
  assert.ok(sell.payoutAmount <= 1000);
  assert.ok(sell.realizedPnl <= 0);
  assert.ok(sell.newNoPool >= 8000);
});

test('regression: minimum buy at the ₹99 odds ceiling keeps average fill within database bounds', () => {
  const yesBuy = calculateTradePreview(9900, 100, 'YES', 10);
  const noBuy = calculateTradePreview(100, 9900, 'NO', 10);

  assert.equal(yesBuy.sharesAllocated, 0.101);
  assert.equal(noBuy.sharesAllocated, 0.101);
  assert.equal(yesBuy.executionPrice, 99);
  assert.equal(noBuy.executionPrice, 99);
  for (const preview of [yesBuy, noBuy]) {
    assert.ok(preview.executionPrice >= 1 && preview.executionPrice <= 99);
  }
});

test('invalid or non-finite trade inputs do not mint shares', () => {
  assert.equal(calculateTradePreview(6000, 4000, 'YES', Number.NaN).sharesAllocated, 0);
  assert.equal(calculateTradePreview(6000, 4000, 'YES', Number.POSITIVE_INFINITY).sharesAllocated, 0);
  assert.equal(calculateTradePreview(6000, 4000, 'YES', -10).sharesAllocated, 0);
});

test('12-digit UTR validation strictly accepts only 12-digit numeric strings', () => {
  assert.equal(validateUtrNumber('412839405812').valid, true);
  assert.equal(validateUtrNumber('12345').valid, false);
  assert.equal(validateUtrNumber('41283940581A').valid, false);
});

test('Granular RBAC permissions enforce Owner override and explicit flags', () => {
  const owner = {
    email: OWNER_EMAIL,
    role: 'admin',
    isCommunityApproved: false,
    canCreateEvents: false,
    hasPaymentAndTradingAccess: false,
  };
  assert.equal(isCommunityApprovedUser(owner), true);
  assert.equal(canUserCreateEvents(owner), true);
  assert.equal(isRealMoneyEligible(owner), true);

  const uninvitedUser = {
    email: 'newbie@campus.in',
    role: 'user',
    isCommunityApproved: false,
    canCreateEvents: false,
    hasPaymentAndTradingAccess: false,
    realMoneyStatus: 'none',
  };
  assert.equal(isCommunityApprovedUser(uninvitedUser), false);
  assert.equal(canUserCreateEvents(uninvitedUser), false);
  assert.equal(isRealMoneyEligible(uninvitedUser), false);

  const whitelistedTester = {
    email: 'tester@campus.in',
    role: 'user',
    isCommunityApproved: true,
    canCreateEvents: true,
    hasPaymentAndTradingAccess: true,
    realMoneyStatus: 'approved',
  };
  assert.equal(isCommunityApprovedUser(whitelistedTester), true);
  assert.equal(canUserCreateEvents(whitelistedTester), true);
  assert.equal(isRealMoneyEligible(whitelistedTester), true);

  const betCalc = calculateRealMoneyBet(6000, 4000, 'YES', 600);
  const tradePreview = calculateTradePreview(6000, 4000, 'YES', 600);
  assert.equal(betCalc.contracts, tradePreview.sharesAllocated);
  assert.equal(betCalc.grossPayoutInr, tradePreview.potentialPayout);
});
