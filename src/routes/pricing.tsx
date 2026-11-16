import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

import { SiteShell } from "@/components/site/SiteShell";
import { buttonStart } from "@/components/site/styles";
import { cn } from "@/lib/utils";

const title = "Pricing | Takatax";
const description =
  "Pay only when you run: ₱199 for up to 250 pages. Premium is ₱800 a month for 1,000 pages. Bookkeepers, CPAs and tax lawyers get 25% off. Your first 10 pages are free.";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: PricingPage,
});

interface Plan {
  name: string;
  price: string;
  unit: string;
  summary: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Free trial",
    price: "₱0",
    unit: "once per TIN",
    summary: "See your real figures before you pay.",
    features: ["Your first 10 pages", "Full results, nothing hidden", "No card needed"],
  },
  {
    name: "Parse run",
    price: "₱199",
    unit: "per run",
    summary: "Pay only when you have documents to read.",
    features: [
      "Up to 250 pages in a run (a photo is one page; a PDF counts each page)",
      "Every return computed from them is free",
      "₱2 for each page over 250",
      "No subscription needed",
    ],
    highlight: true,
  },
  {
    name: "Premium",
    price: "₱800",
    unit: "per month",
    summary: "For businesses that upload every month.",
    features: [
      "1,000 pages read each month, then ₱2 a page",
      "15 GB of document storage",
      "Paid month by month, no auto-renewal",
    ],
  },
  {
    name: "For bookkeepers, CPAs and tax lawyers",
    price: "₱149",
    unit: "per client run",
    summary: "25% off every run you do for a client.",
    features: [
      "Up to 250 pages in a run (a photo is one page; a PDF counts each page)",
      "All your clients in one dashboard",
      "A verified public profile with reviews",
      "No platform fee: you bill clients directly",
    ],
  },
];

const EXTRAS: { name: string; text: string }[] = [
  { name: "More storage", text: "₱250 for 5 GB a month. The first 300 MB is free." },
  {
    name: "Always free",
    text: "The tax tracker, deadline reminders and the 8% vs OSD calculator.",
  },
  {
    name: "No platform fee",
    text: "We never take a cut of what you pay a bookkeeper, and we never handle that payment.",
  },
];

function PricingPage() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-[1180px] px-4 pt-14 pb-16 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-[640px] text-center">
          <h1 className="text-[36px]/[42px] font-bold tracking-tight text-balance sm:text-[48px]/[54px]">
            Pay only when you run.
          </h1>
          <p className="mt-4 text-lg/7 text-tk-muted text-pretty">
            No parse, no fee. Computing your returns from documents we have already read is always
            free.
          </p>
        </div>

        <ul className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => (
            <li
              key={plan.name}
              className={cn(
                "flex flex-col rounded-[20px] border bg-tk-surface p-6 sm:p-8",
                plan.highlight
                  ? "border-tk-brand shadow-[0_8px_24px_rgb(14_122_90/0.12)]"
                  : "border-tk-line",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                {plan.highlight ? (
                  <span className="rounded-full bg-tk-brand-soft px-3 py-1 text-[13px] font-medium text-tk-brand">
                    Most people
                  </span>
                ) : null}
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="font-tk-mono text-[40px]/[44px] font-medium tracking-tight tabular-nums">
                  {plan.price}
                </span>
                <span className="text-tk-muted">{plan.unit}</span>
              </p>
              <p className="mt-3 text-tk-muted text-pretty">{plan.summary}</p>
              <ul className="mt-6 flex flex-col gap-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check
                      aria-hidden
                      className="mt-0.5 size-5 shrink-0 text-tk-brand"
                      strokeWidth={2}
                    />
                    <span className="text-pretty">{feature}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <dl className="mt-10 grid gap-x-10 gap-y-6 border-t border-tk-line pt-8 sm:grid-cols-3">
          {EXTRAS.map((extra) => (
            <div key={extra.name}>
              <dt className="font-semibold">{extra.name}</dt>
              <dd className="mt-1 text-tk-muted text-pretty">{extra.text}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-14 flex flex-col items-center text-center">
          <Link to="/signup" className={buttonStart}>
            Start
            <ArrowRight aria-hidden className="size-6" />
          </Link>
          <p className="mt-5 max-w-[52ch] text-tk-muted text-pretty">
            Online payment is not switched on yet. You can create your account today.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
