// PayMongo (Philippine payments: GCash, Maya, cards, QR Ph). Checkout sessions for runs and
// Premium months, and the webhook signature check.
//
// MISSING: set PAYMONGO_SECRET_KEY (sk_test_... or sk_live_...) and PAYMONGO_WEBHOOK_SECRET
// (whsk_..., from the webhook you create for checkout_session.payment.paid) as edge function
// secrets. Confirm the request and event shapes against developers.paymongo.com before launch.
import { requireEnv } from "./http.ts";

const API = "https://api.paymongo.com/v1";

export interface CheckoutSession {
  id: string;
  checkoutUrl: string;
}

export async function createCheckoutSession(input: {
  amountCentavos: number;
  name: string;
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<CheckoutSession> {
  const { PAYMONGO_SECRET_KEY } = requireEnv("PAYMONGO_SECRET_KEY");
  const methods = (Deno.env.get("PAYMONGO_METHODS") ?? "gcash,paymaya,card,qrph")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const response = await fetch(`${API}/checkout_sessions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${PAYMONGO_SECRET_KEY}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            {
              currency: "PHP",
              amount: input.amountCentavos,
              name: input.name,
              description: input.description,
              quantity: 1,
            },
          ],
          payment_method_types: methods,
          description: input.description,
          reference_number: input.referenceNumber,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          metadata: input.metadata,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`PayMongo ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = await response.json();
  return { id: body.data.id, checkoutUrl: body.data.attributes.checkout_url };
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/**
 * Checks the `Paymongo-Signature` header ("t=<time>,te=<test signature>,li=<live signature>"):
 * HMAC-SHA256 of "<time>.<raw body>" with the webhook secret.
 */
export async function verifyWebhookSignature(
  header: string | null,
  rawBody: string,
  livemode: boolean,
): Promise<boolean> {
  const { PAYMONGO_WEBHOOK_SECRET } = requireEnv("PAYMONGO_WEBHOOK_SECRET");
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim() ?? "", rest.join("=").trim()];
    }),
  );
  const expected = livemode ? parts["li"] : parts["te"];
  if (!parts["t"] || !expected) return false;
  const computed = await hmacHex(PAYMONGO_WEBHOOK_SECRET, `${parts["t"]}.${rawBody}`);
  return sameHex(computed, expected);
}
