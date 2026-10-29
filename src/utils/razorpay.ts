export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: 'INR';
  receipt: string;
}

interface CreateRazorpayOrderOptions {
  keyId: string;
  keySecret: string;
  amountPaise: number;
  receipt: string;
  fetcher?: typeof fetch;
}

/**
 * Creates a Razorpay order using server-only credentials and validates the
 * provider response before it can be persisted or returned to an authenticated
 * caller. This helper never exposes the key secret.
 */
export async function createRazorpayOrder({
  keyId,
  keySecret,
  amountPaise,
  receipt,
  fetcher = fetch,
}: CreateRazorpayOrderOptions): Promise<RazorpayOrder> {
  if (!keyId || !keySecret) {
    throw new Error('Payment gateway credentials are not configured.');
  }
  if (
    !Number.isSafeInteger(amountPaise) ||
    amountPaise < 1000 ||
    amountPaise > 10_000_000 ||
    !receipt ||
    receipt.length > 40
  ) {
    throw new Error('Invalid payment order details.');
  }

  let response: Response;
  try {
    response = await fetcher('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('Could not create a payment order with the provider.');
  }

  if (!response.ok) {
    throw new Error('Could not create a payment order with the provider.');
  }

  let providerOrder: any;
  try {
    providerOrder = await response.json();
  } catch {
    throw new Error('The payment provider returned an invalid order response.');
  }

  if (
    typeof providerOrder?.id !== 'string' ||
    !/^order_[A-Za-z0-9]+$/.test(providerOrder.id) ||
    providerOrder.currency !== 'INR' ||
    Number(providerOrder.amount) !== amountPaise ||
    Number(providerOrder.amount_due) !== amountPaise ||
    Number(providerOrder.amount_paid) !== 0 ||
    providerOrder.status !== 'created' ||
    providerOrder.receipt !== receipt
  ) {
    throw new Error('The payment provider returned an order that does not match the requested INR amount.');
  }

  return {
    id: providerOrder.id,
    amount: amountPaise,
    currency: 'INR',
    receipt,
  };
}
