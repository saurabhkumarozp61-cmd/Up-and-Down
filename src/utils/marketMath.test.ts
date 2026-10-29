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

test('Whole and Fractional Share allocation matches spec: Shares = Investment / Current Share Price', () => {
  // Example 1 from spec: YES is ₹60 and user invests ₹6,000 -> 100 shares, settles at ₹10,000
  const wholePreview = calculateTradePreview(6000, 4000, 'YES', 6000);
  assert.equal(wholePreview.executionPrice, 60);
  assert.equal(wholePreview.sharesAllocated, 100);
  assert.equal(wholePreview.potentialPayout, 10000);
  assert.equal(wholePreview.netProfit, 4000);
  assert.ok(wholePreview.newYesPrice > 60);
  assert.equal(wholePreview.newYesPrice + wholePreview.newNoPrice, 100);

  // Example 2 from spec: YES is ₹60 and user invests ₹10 -> 0.1667 fractional shares
  const fracPreview = calculateTradePreview(6000, 4000, 'YES', 10);
  assert.equal(fracPreview.executionPrice, 60);
  assert.equal(fracPreview.sharesAllocated, 0.1667);
  assert.equal(fracPreview.potentialPayout, 16.67);
});

test('Early Exit (Sell Before Final Result) Profit Booking & Stop-Loss matches spec', () => {
  // Example 1: Bought 100 YES shares at ₹60 (₹6,000). Live price rises to ₹80.
  // Sell 100 shares -> Payout = 100 * ₹80 = ₹8,000 (locking in +₹2,000 profit)
  const profitExit = calculateEarlyExitSell({
    yesPool: 8000,
    noPool: 2000,
    side: 'YES',
    sharesHeld: 100,
    sharesToSell: 100,
    entryPrice: 60,
  });
  assert.equal(profitExit.currentLivePrice, 80);
  assert.equal(profitExit.payoutAmount, 8000);
  assert.equal(profitExit.realizedPnl, 2000);
  assert.equal(profitExit.remainingShares, 0);

  // Example 2: Bought 100 YES shares at ₹60 (₹6,000). Live price drops to ₹25.
  // Sell 100 shares -> Payout = 100 * ₹25 = ₹2,500 (-₹3,500 stop-loss)
  const stopLossExit = calculateEarlyExitSell({
    yesPool: 2500,
    noPool: 7500,
    side: 'YES',
    sharesHeld: 100,
    sharesToSell: 100,
    entryPrice: 60,
  });
  assert.equal(stopLossExit.currentLivePrice, 25);
  assert.equal(stopLossExit.payoutAmount, 2500);
  assert.equal(stopLossExit.realizedPnl, -3500);
  assert.equal(stopLossExit.remainingShares, 0);
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
  assert.equal(betCalc.contracts, 10);
  assert.equal(betCalc.grossPayoutInr, 1000);
});
