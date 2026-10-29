import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPredictorPayload } from './predictorPrivacy.ts';

const profile = {
  id: 42,
  username: 'sample_user',
  collegeName: 'Example College',
  coinBalance: 125,
  activePortfolioValue: 80,
  winsCount: 3,
  resolvedCount: 5,
  email: 'sample@example.com',
  uid: 'private-firebase-uid',
  realMoneyBalance: 700,
  walletBalanceInr: 700,
  realMoneyStatus: 'approved',
  upiId: 'sender@upi',
  realMoneyInviteNote: 'Phone: 9000000000; UPI: sender@upi',
  inviteCodeUsed: 'PRIVATE-CODE',
};

const publicProfile = {
  id: '42',
  username: 'sample_user',
  collegeName: 'Example College',
  coinBalance: 125,
  activePortfolioValue: 80,
  winsCount: 3,
  resolvedCount: 5,
};

test('public predictor payload contains only virtual-game standings', () => {
  const payload = buildPredictorPayload([profile]);

  assert.deepEqual(payload, { predictors: [publicProfile] });
  assert.equal(JSON.stringify(payload).includes('sample@example.com'), false);
  assert.equal(JSON.stringify(payload).includes('sender@upi'), false);
  assert.equal(JSON.stringify(payload).includes('9000000000'), false);
  assert.equal(JSON.stringify(payload).includes('PRIVATE-CODE'), false);
});

test('owner payload separates full profiles from public predictor summaries', () => {
  const payload = buildPredictorPayload([profile], true);

  assert.deepEqual(payload.predictors, [publicProfile]);
  assert.deepEqual(payload.adminPredictors, [profile]);
});
