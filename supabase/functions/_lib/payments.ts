// The payment provider: a merchant of record (MoR), for example Dodo Payments, that sells runs
// and Premium months to customers and handles card payments, local tax and refunds.
//
// PLACEHOLDER: no provider is chosen yet. Both functions below answer "not configured", so
// free runs (the trial and Premium pages) work and paid runs say payments are not connected.
//
// MISSING, once the provider is chosen:
// 1. Implement createCheckoutSession with its API: create a hosted checkout for one item
//    (amount in centavos, PHP), with success and cancel links and our payment id as reference
//    and metadata, and return its id and URL. (Dodo Payments: a checkout session returns a
//    hosted checkout URL.)
// 2. Implement readPaymentWebhook: check the signature on the raw body, and return the
//    checkout id of a successful payment. (Dodo Payments follows the Standard Webhooks spec:
//    headers webhook-id, webhook-timestamp and webhook-signature, signed with a whsec_ secret.)
// 3. Set PROVIDER below, and its secrets in Supabase (for example PAYMENTS_API_KEY and
//    PAYMENTS_WEBHOOK_SECRET), and point the provider's webhook at
//    https://thiznrxojzrxkjwqhtjt.supabase.co/functions/v1/payments-webhook.
import { NotConfiguredError } from "./http.ts";

/** Stored on each payment row. MISSING: the chosen provider's name, for example "dodo". */
export const PROVIDER = "unset";

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
}

export interface CheckoutInput {
  amountCentavos: number;
  name: string;
  description: string;
  /** Our payments.id, to find the payment again from the webhook. */
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

/** What a webhook says, once its signature has been checked. */
export type PaymentEvent =
  | { kind: "paid"; checkoutId: string; paymentId: string | null }
  | { kind: "ignored"; type: string };

/** Throws NotConfiguredError until a provider is set up. Call before creating any rows. */
export function assertPaymentsConfigured(): void {
  throw new NotConfiguredError(["PAYMENT_PROVIDER"]);
}

export function createCheckoutSession(_input: CheckoutInput): Promise<CheckoutSession> {
  assertPaymentsConfigured();
  return Promise.reject(new Error("unreachable"));
}

export function readPaymentWebhook(_request: Request, _rawBody: string): Promise<PaymentEvent> {
  assertPaymentsConfigured();
  return Promise.reject(new Error("unreachable"));
}
