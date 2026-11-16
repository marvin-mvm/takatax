import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Crown, Gift } from "lucide-react";
import { useState } from "react";

import { PAYMENTS_LIVE, PRICING, pesoText } from "@shared/uploads/rules.ts";
import { useAppUser } from "@/components/app/app-user";
import {
  Card,
  LoadingBlock,
  NotConnectedNotice,
  PageHeader,
  SampleDataNotice,
  Tag,
} from "@/components/app/ui";
import { buttonPrimary } from "@/components/site/styles";
import { supabase } from "@/integrations/supabase/client";
import { usePlan } from "@/lib/data/queries";
import { peso } from "@/lib/money";
import { checkoutPremiumMonth, checkoutUnpaidRun } from "@/lib/services/payments";
import { longDay } from "@/lib/time";

export const Route = createFileRoute("/app/plan")({
  // `paid` is set when the payment page sends the browser back after a payment.
  validateSearch: (search: Record<string, unknown>): { paid?: string } =>
    typeof search["paid"] === "string" ? { paid: search["paid"] } : {},
  component: PlanPage,
});

const STATUS_LABEL = { pending: "Waiting", paid: "Paid", failed: "Failed", expired: "Expired" };

/** The free trial, Premium, and every payment made from this login. */
function PlanPage() {
  const { user } = useAppUser();
  const { paid } = Route.useSearch();
  const query = usePlan(user.id);
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "working" | "not_connected" | "error">("idle");

  if (query.isPending) return <LoadingBlock label="Loading your plan…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your plan.</p>;

  const plan = query.data.data;
  const premiumActive = plan.premiumUntil !== null && new Date(plan.premiumUntil) > new Date();

  // A run whose checkout was abandoned: open a new checkout for it.
  const payRun = async (runId: string) => {
    setState("working");
    const result = await checkoutUnpaidRun(plan.accountId, runId);
    if (!result.ok) {
      setState(result.reason === "not_connected" ? "not_connected" : "error");
      return;
    }
    if (result.data.checkoutUrl) window.location.assign(result.data.checkoutUrl);
    else {
      await queryClient.invalidateQueries({ queryKey: ["plan", user.id] });
      setState("idle");
    }
  };

  const buyPremium = async () => {
    setState("working");
    const { data: accountId, error } = await supabase.rpc("ensure_my_account" as never);
    if (error || typeof accountId !== "string") {
      setState("not_connected");
      return;
    }
    const result = await checkoutPremiumMonth(accountId);
    if (!result.ok) {
      setState(result.reason === "not_connected" ? "not_connected" : "error");
      return;
    }
    if (result.data.checkoutUrl) {
      window.location.assign(result.data.checkoutUrl);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["plan", user.id] });
    setState("idle");
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Plan and payments"
        subtitle={
          PAYMENTS_LIVE
            ? "Pay per run, or take Premium for a busy month. No subscription renews by itself."
            : "Standard runs are free during launch. Paid extras and Premium are coming soon."
        }
      />
      <SampleDataNotice source={query.data.source} what="an example plan" />
      {paid ? (
        <p role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
          Thank you. Your payment is being confirmed; this page updates within a minute.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {!PAYMENTS_LIVE ? (
          <Card className="flex flex-col gap-3">
            <p className="flex items-center gap-2 font-semibold">
              <Gift aria-hidden className="size-5 text-tk-brand" /> Standard runs: free for now
            </p>
            <p className="text-tk-muted">
              During launch, every run of up to {PRICING.runPages} pages is free, as many times as
              you need. Pages over {PRICING.runPages} ({pesoText(PRICING.extraPage)} each) are
              coming soon.
            </p>
            <Tag tone="brand">Free during launch</Tag>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3">
            <p className="flex items-center gap-2 font-semibold">
              <Gift aria-hidden className="size-5 text-tk-brand" /> Free trial
            </p>
            {plan.trialUsed ? (
              <p className="text-tk-muted">
                Used. Your first {PRICING.trialPages} pages were read free.
              </p>
            ) : (
              <p className="text-tk-muted">
                Your first {PRICING.trialPages} pages are read free, with full results.
              </p>
            )}
            <Tag tone={plan.trialUsed ? "neutral" : "brand"}>
              {plan.trialUsed ? "Used" : "Available"}
            </Tag>
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <p className="flex items-center gap-2 font-semibold">
            <Crown aria-hidden className="size-5 text-tk-accent" /> Premium
            {!PAYMENTS_LIVE ? <Tag tone="warn">Coming soon</Tag> : null}
          </p>
          <p className="text-tk-muted">
            {peso(PRICING.premiumMonthly)} for 30 days: up to{" "}
            {PRICING.premiumPages.toLocaleString()} pages read (then{" "}
            {pesoText(PRICING.premiumExtraPage)} a page) and {PRICING.premiumStorageGb} GB of
            storage. It does not renew by itself.
          </p>
          {premiumActive ? (
            <p className="flex items-center gap-2 font-medium text-tk-brand">
              <CheckCircle2 aria-hidden className="size-5" /> Active until{" "}
              {longDay(plan.premiumUntil ?? "")}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void buyPremium()}
            disabled={!PAYMENTS_LIVE || state === "working"}
            className={`${buttonPrimary} self-start`}
          >
            {!PAYMENTS_LIVE
              ? "Coming soon"
              : state === "working"
                ? "Opening checkout…"
                : premiumActive
                  ? `Add 30 days for ${peso(PRICING.premiumMonthly)}`
                  : `Get Premium for ${peso(PRICING.premiumMonthly)}`}
          </button>
          {state === "not_connected" ? (
            <NotConnectedNotice title="Payments are not connected yet">
              Premium can be bought once Takatax connects payments.
            </NotConnectedNotice>
          ) : null}
          {state === "error" ? (
            <p role="alert" className="text-sm text-tk-danger">
              We could not open the checkout. Please try again.
            </p>
          ) : null}
        </Card>
      </div>

      <section aria-labelledby="payments-title" className="flex flex-col gap-3">
        <h2 id="payments-title" className="text-xl font-semibold">
          Payments
        </h2>
        {plan.payments.length === 0 ? (
          <p className="text-tk-muted">No payments yet.</p>
        ) : (
          <div className="relative overflow-x-auto rounded-[18px] border border-tk-line bg-tk-surface">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="text-sm text-tk-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">For</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.payments.map((p) => (
                  <tr key={p.id} className="border-t border-tk-line">
                    <td className="px-5 py-3">{longDay(p.createdAt)}</td>
                    <td className="px-5 py-3">
                      {p.purpose === "premium_month" ? "Premium, 30 days" : "Standard run"}
                    </td>
                    <td className="px-5 py-3 text-right font-tk-mono tabular-nums">
                      {peso(p.amount, true)}
                    </td>
                    <td className="px-5 py-3">
                      <Tag
                        tone={
                          p.status === "paid"
                            ? "brand"
                            : p.status === "pending"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {STATUS_LABEL[p.status]}
                      </Tag>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {p.status === "pending" && p.runId && plan.accountId ? (
                        <button
                          type="button"
                          onClick={() => void payRun(p.runId ?? "")}
                          disabled={state === "working"}
                          className="font-semibold text-tk-brand hover:underline"
                        >
                          Pay now
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] text-tk-muted">
          {PAYMENTS_LIVE
            ? "Payments go through Xendit (GCash, Maya or card), which handles your card details; Takatax never sees them."
            : "Online payment (Xendit: GCash, Maya or card) is coming soon."}{" "}
          Payments to your bookkeeper are between you and them.
        </p>
      </section>
    </div>
  );
}
