import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, Crown, LogOut } from "lucide-react";
import { useState } from "react";

import { PAYMENTS_LIVE, PRICING, pesoText } from "@shared/uploads/rules.ts";
import { tierOf } from "@shared/uploads/usage.ts";
import { UsageMeters } from "@/components/app/UsageMeters";
import { useAppUser } from "@/components/app/app-user";
import {
  Card,
  LoadingBlock,
  NotConnectedNotice,
  PageHeader,
  SampleDataNotice,
  Tag,
} from "@/components/app/ui";
import { buttonOutline, buttonPrimary, textLink } from "@/components/site/styles";
import { supabase } from "@/integrations/supabase/client";
import { tierSummary } from "@/lib/account/tier";
import { displayName } from "@/lib/auth/use-auth";
import { usePlan } from "@/lib/data/queries";
import { isPartner } from "@/lib/data/repository";
import { PARTNER_KIND_LABEL } from "@/lib/data/types";
import { peso } from "@/lib/money";
import { checkoutPremiumMonth, checkoutUnpaidRun } from "@/lib/services/payments";
import { longDay, shortDay } from "@/lib/time";

export const Route = createFileRoute("/app/settings")({
  // `paid` is set when the payment page sends the browser back after a payment.
  validateSearch: (search: Record<string, unknown>): { paid?: string } =>
    typeof search["paid"] === "string" ? { paid: search["paid"] } : {},
  component: SettingsPage,
});

const STATUS_LABEL = { pending: "Waiting", paid: "Paid", failed: "Failed", expired: "Expired" };

/**
 * Account settings, opened from "Hi [first name]" in the header: who is signed in and Log out,
 * the current tier, pages and storage used, Premium, and every payment made from this login.
 */
function SettingsPage() {
  const { user, role, signOut, signingOut } = useAppUser();
  const { paid } = Route.useSearch();
  const query = usePlan(user.id);
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "working" | "not_connected" | "error">("idle");

  if (query.isPending) return <LoadingBlock label="Loading your account…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your account.</p>;

  const plan = query.data.data;
  const partner = isPartner(role);
  const tier = tierOf(plan.premiumUntil);
  const premiumActive = tier === "premium";
  const summary = tierSummary({
    role,
    tier,
    premiumUntil: plan.premiumUntil,
    trialUsed: plan.trialUsed,
  });

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
        title="Account settings"
        subtitle="Your details, your tier, what you have used, and your transactions."
      />
      <SampleDataNotice source={query.data.source} what="an example plan" />
      {paid ? (
        <p role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
          Thank you. Your payment is being confirmed; this page updates within a minute.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card aria-labelledby="you-title" className="flex flex-col gap-4">
          <h2 id="you-title" className="text-lg font-semibold">
            Your details
          </h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
            <dt className="text-tk-muted">Name</dt>
            <dd className="font-medium break-words">{displayName(user)}</dd>
            <dt className="text-tk-muted">Email</dt>
            <dd className="font-medium break-all">{user.email ?? "Not set"}</dd>
            <dt className="text-tk-muted">Account</dt>
            <dd className="font-medium">
              {isPartner(role) ? PARTNER_KIND_LABEL[role] : "Taxpayer"}
            </dd>
          </dl>
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={signOut} disabled={signingOut} className={buttonOutline}>
              <LogOut aria-hidden className="size-5" />
              {signingOut ? "Logging out…" : "Log out"}
            </button>
            {partner ? (
              <Link to="/app/profile" className={textLink}>
                Edit my public profile
              </Link>
            ) : null}
          </div>
        </Card>

        <Card aria-labelledby="tier-title" className="flex flex-col gap-3">
          <h2 id="tier-title" className="text-lg font-semibold">
            Current tier
          </h2>
          <p className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              {premiumActive ? (
                <Crown aria-hidden className="size-6 text-tk-accent" />
              ) : (
                <BadgeCheck aria-hidden className="size-6 text-tk-brand" />
              )}
              {summary.name}
            </span>
            {summary.tag ? <Tag tone="brand">{summary.tag}</Tag> : null}
          </p>
          <ul className="list-disc pl-5 text-tk-muted marker:text-tk-brand">
            {summary.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </Card>
      </div>

      {partner ? null : <UsageMeters userId={user.id} />}

      {partner ? null : (
        <Card aria-labelledby="premium-title" className="flex flex-col gap-3">
          <h2 id="premium-title" className="flex items-center gap-2 text-lg font-semibold">
            <Crown aria-hidden className="size-5 text-tk-accent" /> Premium
            {!PAYMENTS_LIVE ? <Tag tone="warn">Coming soon</Tag> : null}
          </h2>
          <p className="max-w-[70ch] text-tk-muted">
            {peso(PRICING.premiumMonthly)} for 30 days: up to{" "}
            {PRICING.premiumPages.toLocaleString("en-PH")} pages read (then{" "}
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
        </Card>
      )}
      {state === "not_connected" ? (
        <NotConnectedNotice title="Payments are not connected yet">
          Paying online starts once Takatax connects payments.
        </NotConnectedNotice>
      ) : null}
      {state === "error" ? (
        <p role="alert" className="text-sm text-tk-danger">
          We could not open the checkout. Please try again.
        </p>
      ) : null}

      <section aria-labelledby="transactions-title" className="flex flex-col gap-3">
        <h2 id="transactions-title" className="text-xl font-semibold">
          Transaction history
        </h2>
        {plan.payments.length === 0 ? (
          <p className="text-tk-muted">
            No transactions yet.
            {PAYMENTS_LIVE
              ? ""
              : " Your first pages are free during launch, so there is nothing to pay."}
          </p>
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
                    <td className="px-5 py-3 whitespace-nowrap">{shortDay(p.createdAt)}</td>
                    <td className="px-5 py-3">
                      {p.purpose === "premium_month"
                        ? "Premium, 30 days"
                        : partner
                          ? "Client run"
                          : "Standard run"}
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
          {partner
            ? "What your clients pay you is between you and them."
            : "Payments to your bookkeeper are between you and them."}
        </p>
      </section>
    </div>
  );
}
