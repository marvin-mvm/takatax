// The payment provider: Xendit (Philippine payments: GCash, Maya, cards and more), through its
// hosted Invoice checkout.
//
// "COMING SOON": payments are off while PAYMENTS_LIVE (supabase/functions/_shared/uploads/rules.ts)
// is false. Then Standard runs of up to 250 pages are free, and everything that needs a payment
// (pages over 250 and Premium) is blocked before reaching this file.
//
// MISSING, to switch payments on:
// 1. Xendit dashboard -> Settings -> API keys: a secret key with "Money-in" write access.
//    Supabase secret: XENDIT_SECRET_KEY.
// 2. Xendit dashboard -> Settings -> Webhooks: set the Invoices "paid" webhook to
//    https://thiznrxojzrxkjwqhtjt.supabase.co/functions/v1/payments-webhook and copy the
//    verification token. Supabase secret: XENDIT_CALLBACK_TOKEN.
// 3. Confirm the request and webhook shapes below against Xendit's current docs and test them in
//    test mode, then set PAYMENTS_LIVE to true and redeploy the site and the edge functions.
import { PAYMENTS_LIVE } from "../_shared/uploads/rules.ts";
import { NotConfiguredError, requireEnv } from "./http.ts";

/** Stored on each payment row. */
export const PROVIDER = "xendit";

const API = "https://api.xendit.co";

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
}

export interface CheckoutInput {
  amountCentavos: number;
  name: string;
  description: string;
  /** Our payments.id, sent as Xendit's external_id to find the payment again. */
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

/** What a webhook says, once it has been checked. */
export type PaymentEvent =
  | { kind: "paid"; checkoutId: string; paymentId: string | null }
  | { kind: "ignored"; type: string };

/**
 * Throws NotConfiguredError while payments are "coming soon" or Xendit's key is missing. Call
 * before creating any rows.
 */
export function assertPaymentsConfigured(): void {
  if (!PAYMENTS_LIVE) throw new NotConfiguredError(["PAYMENTS_LIVE"]);
  requireEnv("XENDIT_SECRET_KEY");
}

/** A Xendit Invoice: a hosted checkout page for one amount in pesos. */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutSession> {
  assertPaymentsConfigured();
  const { XENDIT_SECRET_KEY } = requireEnv("XENDIT_SECRET_KEY");
  const response = await fetch(`${API}/v2/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${XENDIT_SECRET_KEY}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: input.referenceNumber,
      amount: input.amountCentavos / 100,
      currency: "PHP",
      description: `${input.name}: ${input.description}`,
      success_redirect_url: input.successUrl,
      failure_redirect_url: input.cancelUrl,
      metadata: input.metadata,
    }),
  });
  if (!response.ok) {
    throw new Error(`Xendit ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const invoice = (await response.json()) as { id: string; invoice_url: string };
  return { id: invoice.id, checkoutUrl: invoice.invoice_url };
}

/** Constant-time comparison of two strings. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * Xendit's invoice webhook: checks the x-callback-token header against the verification token,
 * and reports a paid invoice (status PAID or SETTLED) by its invoice id.
 */
export function readPaymentWebhook(request: Request, rawBody: string): Promise<PaymentEvent> {
  if (!PAYMENTS_LIVE) throw new NotConfiguredError(["PAYMENTS_LIVE"]);
  const { XENDIT_CALLBACK_TOKEN } = requireEnv("XENDIT_CALLBACK_TOKEN");
  const token = request.headers.get("x-callback-token") ?? "";
  if (!sameText(token, XENDIT_CALLBACK_TOKEN)) {
    return Promise.reject(new Error("Webhook token does not match"));
  }
  const invoice = JSON.parse(rawBody) as { id?: string; status?: string; payment_id?: string };
  if (invoice.id && (invoice.status === "PAID" || invoice.status === "SETTLED")) {
    return Promise.resolve({
      kind: "paid",
      checkoutId: invoice.id,
      paymentId: invoice.payment_id ?? null,
    });
  }
  return Promise.resolve({ kind: "ignored", type: invoice.status ?? "unknown" });
}
