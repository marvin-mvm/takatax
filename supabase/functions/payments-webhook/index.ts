// POST from the payment provider (Xendit, not from browsers) when a checkout is paid.
//
// readPaymentWebhook (_lib/payments.ts) checks the signature and says which checkout was paid;
// this function then marks the payment paid and either the run paid (so read-documents will
// read it) or the account's Premium window extended by 30 days. Safe to receive twice: a payment
// that is already paid is left alone.
//
// Deployed without JWT verification (supabase/config.toml), since the provider has no Supabase
// login; the provider's token is the check. Answers 503 { code: "not_configured" } while
// payments are "coming soon" (see _lib/payments.ts).
import { adminClient } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { readPaymentWebhook } from "../_lib/payments.ts";

const DAY = 86_400_000;

serve(async (request) => {
  const raw = await request.text();
  const event = await readPaymentWebhook(request, raw).catch((error: unknown) => {
    if (error instanceof Error && /token does not match/.test(error.message)) {
      throw new HttpError(401, "bad_signature", "Webhook token does not match");
    }
    throw error;
  });
  if (event.kind !== "paid") return json({ ignored: event.type });

  const admin = adminClient();
  const now = new Date();
  const { data: payment, error } = await admin
    .from("payments")
    .update({ status: "paid", paid_at: now.toISOString(), provider_payment_id: event.paymentId })
    .eq("provider_checkout_id", event.checkoutId)
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
