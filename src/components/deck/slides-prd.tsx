import type { ReactNode } from "react";

import { formatPercent } from "@/lib/deck/format";
import { DEFAULT_INPUTS, runModel } from "@/lib/deck/model";

import { STREAM_COLORS } from "./chart-palette";
import { Block, Cite, Point, Points, Slide } from "./primitives";

function PrdBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Block title={title} className="border-t border-tk-line pt-4">
      <div className="text-[15px]/[22px] text-tk-muted text-pretty">{children}</div>
    </Block>
  );
}

function PrdList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-tk-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PrdSlide() {
  return (
    <Slide
      id="prd"
      eyebrow="Phase 1 · Product requirements"
      title="The one-page PRD"
      lead="Takatax turns photos of a taxpayer's documents into the figures for their BIR returns, line by line, for a pay-per-run fee."
    >
      <div className="grid gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
        <PrdBlock title="Problem statement">
          Computing your own taxes is hard. Self-employed Filipinos encode receipts by hand, get the
          rules wrong, or avoid registering at all. Existing tools still need the encoding and
          charge a subscription.
        </PrdBlock>
        <PrdBlock title="Target users">
          <PrdList
            items={[
              <>
                <strong className="font-semibold text-tk-ink">Primary:</strong> sole proprietors
                running micro businesses
              </>,
              "Also: freelancers, contractors and other MSMEs",
              "Partners at 25% off: bookkeepers, CPAs, tax lawyers",
            ]}
          />
        </PrdBlock>
        <PrdBlock title="Core features">
          <PrdList
            items={[
              "Account from your COR, one per TIN, with a free 10-document trial",
              "Upload photos or PDFs, checked for blur in the browser",
              "AI reader with per-field confidence and arithmetic checks",
              "Review screen for the few documents the AI is unsure about",
              "Tax engine: 1701Q, 2551Q and SAWT, with a reason for every excluded document",
              "Tracker: deadlines, filed and paid, the ₱3M threshold",
              "Bookkeeper access you can grant and revoke",
            ]}
          />
        </PrdBlock>
        <PrdBlock title="Out of scope">
          <PrdList
            items={[
              "Filing with the BIR: you or your bookkeeper file",
              "Tax advice: Takatax is a computation tool",
              "Real payment processing: checkout is simulated in this build",
              "Holding money between taxpayers and bookkeepers",
              "Selling personal data",
              "Later: VAT returns, native apps, bank statement import",
            ]}
          />
        </PrdBlock>
        <PrdBlock title="Success metrics">
          <PrdList
            items={[
              "Parsing accuracy: 98% exact match on amounts and TINs",
              "Under 5% of documents sent to user review",
              "AI cost of ₱0.32 or less per document",
              "User feedback: 4 of 5 or better after a run",
              "1 in 4 trial users buys a run",
              "1,127 paying customers by month 12",
            ]}
          />
        </PrdBlock>
        <PrdBlock title="Open questions">
          <PrdList
            items={[
              "Will users trust AI-read figures without a CPA sign-off?",
              "How often will a customer run: every quarter or every month?",
              "What are the real trial conversion and churn?",
              "How many freelancers are BIR-registered?",
              "Are prices VAT-inclusive once revenue passes ₱3M?",
              "Does a computation-only tool need any BIR accreditation?",
            ]}
          />
        </PrdBlock>
      </div>
      <p className="mt-6 border-t border-tk-line pt-4 text-[15px]/[22px] text-tk-muted">
        <strong className="font-semibold text-tk-ink">Revenue model:</strong> the parser first, then
        cloud storage, then ads, then a newsletter and paid API access once users are significant.
        Details on the next slide.
      </p>
    </Slide>
  );
}

interface Stream {
  key: "parser" | "storage" | "ads" | "subscriptions";
  name: string;
  when: string;
  prices: string[];
}

const STREAMS: Stream[] = [
  {
    key: "parser",
    name: "Parser",
    when: "From day one",
    prices: [
      "₱199 per run, up to 250 documents",
      "₱800 a month Premium, 1,000 documents",
      "₱2 per extra document",
    ],
  },
  {
    key: "storage",
    name: "Cloud storage",
    when: "From day one",
    prices: ["300 MB free", "₱250 per 5 GB a month"],
  },
  {
    key: "ads",
    name: "Ads",
    when: "From month 7",
    prices: [
      "Bookkeeper boosts: ₱99 for 7 days",
      "Lender and bank ads: about ₱150 per 1,000 views",
    ],
  },
  {
    key: "subscriptions",
    name: "Newsletter and API",
    when: "Once users are significant (month 13)",
    prices: ["Premium newsletter: ₱199 a month", "Research API: ₱2,500 to ₱9,900 a month"],
  },
];

export function RevenueSlide() {
  const { revenue } = runModel(DEFAULT_INPUTS).totals;

  return (
    <Slide
      id="revenue"
      eyebrow="Phase 1 · Revenue model"
      title="How Takatax makes money"
      lead="Four streams, in this order. The parser comes first. The rest follow the users."
    >
      <div
        role="img"
        aria-label={`Share of three-year revenue: ${STREAMS.map(
          (stream) => `${stream.name} ${formatPercent(revenue[stream.key] / revenue.total)}`,
        ).join(", ")}`}
        className="flex h-2 gap-0.5 overflow-hidden rounded-full"
      >
        {STREAMS.map((stream) => (
          <span
            key={stream.key}
            style={{
              width: `${(revenue[stream.key] / revenue.total) * 100}%`,
              backgroundColor: STREAM_COLORS[stream.key],
            }}
          />
        ))}
      </div>
      <ol className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {STREAMS.map((stream, index) => (
          <li key={stream.key}>
            <p className="flex items-center gap-2 font-tk-mono text-sm text-tk-muted">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ backgroundColor: STREAM_COLORS[stream.key] }}
              />
              {index + 1}
            </p>
            <h3 className="mt-2 text-lg/6 font-semibold">{stream.name}</h3>
            <p className="mt-1 font-tk-mono text-2xl font-medium tabular-nums">
              {formatPercent(revenue[stream.key] / revenue.total)}
            </p>
            <p className="text-[13px]/[18px] text-tk-muted">of three-year revenue</p>
            <ul className="mt-3 flex flex-col gap-1 text-[15px]/[22px] text-tk-muted">
              {stream.prices.map((price) => (
                <li key={price}>{price}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px]/[18px] font-medium text-tk-ink">{stream.when}</p>
          </li>
        ))}
      </ol>
      <Points className="mt-8 border-t border-tk-line pt-6">
        <Point title="Always free:">
          every computed return, the tracker and the 8% vs OSD calculator. No parse, no fee.
        </Point>
        <Point title="25% off for partners:">
          bookkeepers, CPAs and tax lawyers pay ₱149 per client run. No platform fee: they keep
          everything they charge.
        </Point>
        <Point title="Shares come from the base plan:">
          0.1% of micro enterprises in year 1, 1% by year 3 <Cite source="Takatax" refs={[21]} />.
          Change it on the next slide.
        </Point>
      </Points>
    </Slide>
  );
}
