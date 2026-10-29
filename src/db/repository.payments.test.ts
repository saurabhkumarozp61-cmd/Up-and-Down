import test from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayPaymentOrder } from './repository';

test('gateway order creation refuses when the feature flag is not explicitly enabled', async () => {
  const previousFlag = process.env.PAYMENT_GATEWAY_ENABLED;
  const previousKeyId = process.env.PAYMENT_KEY_ID;
  const previousKeySecret = process.env.PAYMENT_KEY_SECRET;
  process.env.PAYMENT_GATEWAY_ENABLED = 'false';
  process.env.PAYMENT_KEY_ID = 'test-key';
  process.env.PAYMENT_KEY_SECRET = 'test-secret';
  try {
    await assert.rejects(
      createGatewayPaymentOrder({ uid: 'not-looked-up', amountInr: 500 }),
      /deposits are disabled/
    );
  } finally {
    if (previousFlag === undefined) delete process.env.PAYMENT_GATEWAY_ENABLED;
    else process.env.PAYMENT_GATEWAY_ENABLED = previousFlag;
    if (previousKeyId === undefined) delete process.env.PAYMENT_KEY_ID;
    else process.env.PAYMENT_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.PAYMENT_KEY_SECRET;
    else process.env.PAYMENT_KEY_SECRET = previousKeySecret;
  }
});

test('gateway order creation refuses missing credentials before looking up the user', async () => {
  const previousFlag = process.env.PAYMENT_GATEWAY_ENABLED;
  const previousKeyId = process.env.PAYMENT_KEY_ID;
  const previousKeySecret = process.env.PAYMENT_KEY_SECRET;
  process.env.PAYMENT_GATEWAY_ENABLED = 'true';
  process.env.PAYMENT_KEY_ID = '';
  process.env.PAYMENT_KEY_SECRET = '';
  try {
    await assert.rejects(
      createGatewayPaymentOrder({ uid: 'not-looked-up', amountInr: 500 }),
      /credentials are not configured/
    );
  } finally {
    if (previousFlag === undefined) delete process.env.PAYMENT_GATEWAY_ENABLED;
    else process.env.PAYMENT_GATEWAY_ENABLED = previousFlag;
    if (previousKeyId === undefined) delete process.env.PAYMENT_KEY_ID;
    else process.env.PAYMENT_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.PAYMENT_KEY_SECRET;
    else process.env.PAYMENT_KEY_SECRET = previousKeySecret;
  }
});
