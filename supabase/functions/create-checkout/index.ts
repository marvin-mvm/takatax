// POST { purpose: "run", accountId, documentIds }          -> a new run for these documents
// POST { purpose: "run", accountId, runId }                -> pay again for an unpaid run
// POST { purpose: "premium_month", accountId }             -> 30 days of Premium
//   -> { runId, free, checkoutUrl, total, summary }
//
// Works out the price on the server with the same rules the upload screen shows (quoteRun),
// counted in pages (a photo is one page, a PDF every page) against the account's pages:
// Premium's pages left this month (then ₱2.65 a page), or the account's Standard pages, which
// last across uploads: the pages left from earlier runs first, then the free trial's 10 pages
// (once), then a new run of 80 pages for ₱149 (then ₱3.50 a page), with the 25% partner price
// when a bookkeeper, CPA or tax lawyer runs a client's pages. The figures live in PRICING
// (_shared/uploads/rules.ts); the account's pages come from account_usage() in the database.
// The run is opened by open_run(), which checks that the account's pages did not change since
// the price was worked out, so two uploads at once cannot both use the same pages left.
// Free runs are marked paid at once. Paid ones get a Xendit checkout (_lib/payments.ts);
// payments-webhook marks them paid.
//
// LAUNCH ("coming soon"): while PAYMENTS_LIVE is false, every account's first 80 pages are
// free and its runs are marked paid at once; Premium, and pages beyond the 80, answer
// 409 { code: "coming_soon" }.
//
// With payments live, answers 503 { code: "not_configured" } for paid checkouts until Xendit's
// key is set.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { PROVIDER, assertPaymentsConfigured, createCheckoutSession } from "../_lib/payments.ts";
import { PAYMENTS_LIVE, PRICING, quoteRun } from "../_shared/uploads/rules.ts";

const DAY = 86_400_000;

serve(async (request) => {
  const body = (await request.json()) as {
    purpose: "run" | "premium_month";
    accountId: string;
    documentIds?: string[];
    runId?: string;
  };
  if (!body.accountId || (body.purpose !== "run" && body.purpose !== "premium_month")) {
    throw new HttpError(400, "bad_request", "Send a purpose and an account");
  }
  const { userId, client } = await authorize(request, body.accountId);
  const admin = adminClient();
  // Where the payment provider sends the browser back: the site that called us.
  const origin = request.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "";

  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("id, owner_user_id, trial_used, premium_started_at, premium_until")
    .eq("id", body.accountId)
    .single();
  if (accountError) throw accountError;
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const partner = account.owner_user_id !== userId && profile?.role !== "taxpayer";

  // ---- Premium month -------------------------------------------------------------------------
  if (body.purpose === "premium_month") {
    if (!PAYMENTS_LIVE) throw new HttpError(409, "coming_soon", "Premium is coming soon");
    if (account.owner_user_id !== userId) {
      throw new HttpError(403, "forbidden", "Only the account owner can buy Premium");
    }
    assertPaymentsConfigured();
    const amount = PRICING.premiumMonthly * 100;
    const { data: payment, error } = await admin
      .from("payments")
      .insert({
        account_id: account.id,
        payer_user_id: userId,
        purpose: "premium_month",
        amount_centavos: amount,
        provider: PROVIDER,
      })
      .select("id")
      .single();
    if (error) throw error;
    const session = await createCheckoutSession({
      amountCentavos: amount,
      name: "Takatax Premium, 30 days",
      description: `Up to ${PRICING.premiumPages.toLocaleString("en-PH")} pages read and ${PRICING.premiumStorageGb} GB of storage`,
      referenceNumber: payment.id,
      successUrl: `${origin}/app/plan?paid=premium`,
      cancelUrl: `${origin}/app/plan`,
      metadata: { payment_id: payment.id, account_id: account.id },
    });
    await admin.from("payments").update({ provider_checkout_id: session.id }).eq("id", payment.id);
    return json({
      runId: null,
      free: false,
      checkoutUrl: session.checkoutUrl,
      total: PRICING.premiumMonthly,
      summary: "Premium, 30 days",
    });
  }

  // ---- A run of documents ------------------------------------------------------------------
  let runId = body.runId ?? null;
  let total: number;
  let summary: string;

  if (runId) {
    // Paying again for a run whose checkout was abandoned.
    const { data: run, error } = await admin
      .from("runs")
      .select("id, account_id, status, price_centavos")
      .eq("id", runId)
      .single();
    if (error) throw error;
    if (run.account_id !== account.id)
      throw new HttpError(403, "forbidden", "Not this account's run");
    if (run.status !== "awaiting_payment") {
      return json({ runId, free: true, checkoutUrl: null, total: 0, summary: "Already paid" });
    }
    total = run.price_centavos / 100;
    summary = "Standard run";
  } else {
    const ids = Array.isArray(body.documentIds) ? body.documentIds : [];
    let opened: string | null = null;
    let quoted = { total: 0, summary: "" };
    // Priced, then opened in one step that checks nothing changed meanwhile; if another upload
    // got in first, the price is worked out again from the pages now left.
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      const { data: documents, error } = await admin
        .from("documents")
        .select("id, page_count")
        .eq("account_id", account.id)
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
        .eq("status", "waiting_for_reader")
        .is("run_id", null);
      if (error) throw error;
      if (!documents?.length) {
        throw new HttpError(400, "nothing_to_read", "These documents are not waiting to be read");
      }
      const pages = documents.reduce((sum, d) => sum + (d.page_count ?? 1), 0);

      // The account's Standard pages so far: what its runs added and what was read against them.
      const { data: usageRows, error: usageError } = await client.rpc("account_usage", {
        account: account.id,
      });
      if (usageError) throw usageError;
      const usage = (usageRows ?? [])[0] as { pages_added: number; pages_used: number } | undefined;
      if (!usage) throw new HttpError(403, "forbidden", "You do not have access to this account");
      const standard = { added: usage.pages_added, used: usage.pages_used };

      // Premium covers pages read inside the current 30-day window, up to the allowance.
      let premiumRemaining: number | undefined;
      const now = Date.now();
      if (!partner && account.premium_until && Date.parse(account.premium_until) > now) {
        const windowStart = new Date(
          Math.max(
            Date.parse(account.premium_started_at ?? account.premium_until) || 0,
            now - 30 * DAY,
          ),
        ).toISOString();
        const { data: used } = await admin
          .from("runs")
          .select("page_count")
          .eq("account_id", account.id)
          .eq("kind", "premium_month")
          .gte("created_at", windowStart);
        const usedPages = (used ?? []).reduce((sum, r) => sum + r.page_count, 0);
        premiumRemaining = Math.max(PRICING.premiumPages - usedPages, 0);
      }

      const quote = quoteRun(pages, {
        partner,
        trialAvailable: !partner && !account.trial_used,
        standard,
        ...(premiumRemaining !== undefined ? { premiumRemaining } : {}),
      });
      if (quote.blocked) {
        throw new HttpError(
          409,
          "coming_soon",
          quote.limit > 0
            ? `This account has ${quote.limit} of its ${quote.allowance} free pages left and these documents have ${pages}. Extra pages are coming soon; remove ${quote.extra} pages for now`
            : `This account has used its ${quote.allowance} free pages. Extra pages are coming soon`,
        );
      }
      // Check the keys before creating anything, so a missing key leaves no unpaid run behind.
      if (quote.total > 0) assertPaymentsConfigured();

      const kind = {
        free: partner ? "partner" : "regular",
        trial: "trial",
        premium: "premium_month",
        partner: "partner",
        standard: "regular",
      }[quote.plan];
      const { data: run, error: runError } = await admin.rpc("open_run", {
        account: account.id,
        actor: userId,
        document_ids: documents.map((d) => d.id),
        run_kind: kind,
        pages,
        price: Math.round(quote.total * 100),
        added: quote.pagesAdded,
        expected_added: standard.added,
        expected_used: standard.used,
        uses_trial: quote.usesTrial,
      });
      if (runError) throw runError;
      opened = typeof run === "string" ? run : null;
      quoted = { total: quote.total, summary: quote.summary };
    }
    if (!opened) {
      throw new HttpError(
        409,
        "try_again",
        "The account's documents changed while this was being priced. Please try again",
      );
    }
    runId = opened;
    total = quoted.total;
    summary = quoted.summary;
    if (total === 0) return json({ runId, free: true, checkoutUrl: null, total: 0, summary });
  }

  const amount = Math.round(total * 100);
  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .insert({
      account_id: account.id,
      payer_user_id: userId,
      purpose: "run",
      run_id: runId,
      amount_centavos: amount,
      provider: PROVIDER,
    })
    .select("id")
    .single();
  if (paymentError) throw paymentError;
  const back = `${origin}/app/upload?${partner ? `account=${account.id}&` : ""}run=${runId}`;
  const session = await createCheckoutSession({
    amountCentavos: amount,
    name: "Takatax parse run",
    description: summary,
    referenceNumber: payment.id,
    successUrl: back,
    cancelUrl: `${origin}/app/plan`,
    metadata: { payment_id: payment.id, run_id: runId ?? "", account_id: account.id },
  });
  await admin.from("payments").update({ provider_checkout_id: session.id }).eq("id", payment.id);
  return json({ runId, free: false, checkoutUrl: session.checkoutUrl, total, summary });
});
