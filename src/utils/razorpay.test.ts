import test from 'node:test';
import assert from 'node:assert/strict';
import { createRazorpayOrder } from './razorpay';

const makeResponse = (body: unknown, ok = true) =>
  ({
    ok,
    json: async () => body,
  }) as Response;

test('creates an INR order using server credentials and the exact paise amount', async () => {
  let request: { url: string; init: RequestInit } | undefined;
  const receipt = 'b9cb711a-9b22-4d45-b95f-f80db5c348b1';
  const result = await createRazorpayOrder({
    keyId: 'rzp_test_public',
    keySecret: 'server-only-secret',
    amountPaise: 50000,
    receipt,
    fetcher: async (input, init) => {
      request = { url: String(input), init: init || {} };
      return makeResponse({
        id: 'order_AbCd1234',
        amount: 50000,
        amount_due: 50000,
        amount_paid: 0,
        currency: 'INR',
        receipt,
        status: 'created',
      });
    },
  });

  assert.equal(request?.url, 'https://api.razorpay.com/v1/orders');
  assert.equal(request?.init.method, 'POST');
  const headers = new Headers(request?.init.headers);
  assert.equal(
    headers.get('Authorization'),
    `Basic ${Buffer.from('rzp_test_public:server-only-secret').toString('base64')}`
  );
  assert.deepEqual(JSON.parse(String(request?.init.body)), {
    amount: 50000,
    currency: 'INR',
    receipt,
  });
  assert.deepEqual(result, {
    id: 'order_AbCd1234',
    amount: 50000,
    currency: 'INR',
    receipt,
  });
});

test('rejects invalid order amounts before contacting Razorpay', async () => {
  let called = false;
  await assert.rejects(
    createRazorpayOrder({
      keyId: 'key',
      keySecret: 'secret',
      amountPaise: 999,
      receipt: 'receipt',
      fetcher: async () => {
        called = true;
        return makeResponse({});
      },
    }),
    /Invalid payment order details/
  );
  assert.equal(called, false);
});

test('rejects provider orders whose amount, status, receipt, or identity does not match', async () => {
  const mismatches = [
    { id: 'order_AbCd1234', amount: 100, amount_due: 50000, amount_paid: 0, currency: 'INR', receipt: 'receipt', status: 'created' },
    { id: 'order_AbCd1234', amount: 50000, amount_due: 50000, amount_paid: 0, currency: 'INR', receipt: 'receipt', status: 'paid' },
    { id: 'order_AbCd1234', amount: 50000, amount_due: 50000, amount_paid: 0, currency: 'INR', receipt: 'different', status: 'created' },
    { id: 'not-an-order', amount: 50000, amount_due: 50000, amount_paid: 0, currency: 'INR', receipt: 'receipt', status: 'created' },
  ];
  for (const responseBody of mismatches) {
    await assert.rejects(
      createRazorpayOrder({
        keyId: 'key',
        keySecret: 'secret',
        amountPaise: 50000,
        receipt: 'receipt',
        fetcher: async () => makeResponse(responseBody),
      }),
      /does not match the requested INR amount/
    );
  }
});

test('does not trust an unsuccessful or malformed provider response', async () => {
  await assert.rejects(
    createRazorpayOrder({
      keyId: 'key',
      keySecret: 'secret',
      amountPaise: 50000,
      receipt: 'receipt',
      fetcher: async () => makeResponse({}, false),
    }),
    /Could not create a payment order/
  );
  await assert.rejects(
    createRazorpayOrder({
      keyId: 'key',
      keySecret: 'secret',
      amountPaise: 50000,
      receipt: 'receipt',
      fetcher: async () =>
        ({ ok: true, json: async () => { throw new Error('bad json'); } }) as unknown as Response,
    }),
    /invalid order response/
  );
});
