// POST from PayMongo (not from browsers): checkout_session.payment.paid
//
// Checks the Paymongo-Signature header, then marks the payment paid and either the run paid
// (so read-documents will read it) or the account's Premium window extended by 30 days.
// Safe to receive twice: a payment that is already paid is left alone.
//
// Deployed without JWT verification (supabase/config.toml), since PayMongo has no Supabase
// login; the signature is the check. MISSING: PAYMONGO_WEBHOOK_SECRET, and register this
// function's URL as a webhook for checkout_session.payment.paid in the PayMongo dashboard.
import { adminClient } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { verifyWebhookSignature } from "../_lib/paymongo.ts";

const DAY = 86_400_000;

serve(async (request) => {
  const raw = await request.text();
  const event = JSON.parse(raw) as {
    data?: {
      attributes?: {
        type?: string;
        livemode?: boolean;
        data?: { id?: string; attributes?: { payments?: { id?: string }[] } };
      };
    };
  };
  const attributes = event.data?.attributes;
  const valid = await verifyWebhookSignature(
    request.headers.get("Paymongo-Signature"),
    raw,
    attributes?.livemode === true,
  );
  if (!valid) throw new HttpError(401, "bad_signature", "Signature does not match");
  if (attributes?.type !== "checkout_session.payment.paid")
    return json({ ignored: attributes?.type });

  const checkoutId = attributes.data?.id;
  if (!checkoutId) throw new HttpError(400, "bad_event", "No checkout session in the event");
  const admin = adminClient();
  const now = new Date();

  const { data: payment, error } = await admin
    .from("payments")
    .update({
      status: "paid",
      paid_at: now.toISOString(),
      provider_payment_id: attributes.data?.attributes?.payments?.[0]?.id ?? null,
    })
    .eq("provider_checkout_id", checkoutId)
    .eq("status", "pending")
    .select("id, purpose, run_id, account_id")
    .maybeSingle();
  if (error) throw error;
  if (!payment) return json({ received: true, alreadyHandled: true });

  if (payment.purpose === "run" && payment.run_id) {
    const { error: runError } = await admin
      .from("runs")
      .update({ status: "paid", paid_at: now.toISOString() })
      .eq("id", payment.run_id)
      .eq("status", "awaiting_payment");
    if (runError) throw runError;
  }

  if (payment.purpose === "premium_month") {
    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("premium_started_at, premium_until")
      .eq("id", payment.account_id)
      .single();
    if (accountError) throw accountError;
    const active = account.premium_until && Date.parse(account.premium_until) > now.getTime();
    const from = active ? Date.parse(account.premium_until) : now.getTime();
    const { error: premiumError } = await admin
      .from("accounts")
      .update({
        premium_started_at: active ? account.premium_started_at : now.toISOString(),
        premium_until: new Date(from + 30 * DAY).toISOString(),
      })
      .eq("id", payment.account_id);
    if (premiumError) throw premiumError;
  }

  return json({ received: true });
});
