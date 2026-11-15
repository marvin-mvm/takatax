import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Calculator,
  CalendarClock,
  Handshake,
  Laptop,
  NotebookPen,
  Scale,
  ScanLine,
  Sparkles,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { formatNumber } from "@/lib/deck/format";
import { MICRO_ENTERPRISES } from "@/lib/deck/model";
import { cn } from "@/lib/utils";

import { Block, Cite, Pill, Point, Points, Slide, Stat } from "./primitives";

const PHASE_1 = "Phase 1 · Validate and define";

export function CoverSlide() {
  return (
    <Slide
      id="cover"
      eyebrow="Pitch deck · November 2026"
      title={
        <span className="block max-w-[16ch] text-[40px]/[44px] lg:text-[64px]/[68px]">
          Your BIR figures, straight from your receipts.
        </span>
      }
      lead="Takatax reads your receipts, invoices, sales records, withholding records, 2307s and COR with AI. A tested tax engine then computes every return, per tax type. ₱199 per run; a subscription is optional."
      className="lg:min-h-[680px]"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          value={formatNumber(MICRO_ENTERPRISES)}
          label={
            <>
              micro enterprises in the Philippines <Cite source="DTI" refs={[1, 2]} />
            </>
          }
        />
        <Stat
          value="171 hours"
          label={
            <>
              a year for a business to comply with its taxes <Cite source="World Bank" refs={[3]} />
            </>
          }
        />
        <Stat value="₱199" label="per run of up to 250 documents. Every computed return is free." />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <a href="#validation" className="rounded-full focus-visible:outline-2">
          <Pill tone="brand">Phase 1 · Validate and define</Pill>
        </a>
        <a href="#architecture" className="rounded-full focus-visible:outline-2">
          <Pill tone="brand">Phase 2 · Spec and architecture</Pill>
        </a>
        <a href="#build" className="rounded-full focus-visible:outline-2">
          <Pill tone="brand">Phase 3 · Build</Pill>
        </a>
      </div>
    </Slide>
  );
}

const STEPS: { href: string; question: string; answer: string }[] = [
  {
    href: "#problem",
    question: "Is tax filing a real problem for Filipinos?",
    answer:
      "Yes. It takes time and a lot of manual paperwork, so businesses try to skip it or get it wrong.",
  },
  {
    href: "#users",
    question: "Who is the target user?",
    answer: "Sole proprietors first. Bookkeepers and CPAs as partners, at 25% off.",
  },
  {
    href: "#market",
    question: "Is the market meaningful?",
    answer: "1.13 million micro enterprises. We need 1 in 100.",
  },
  {
    href: "#competitors",
    question: "What competitors exist?",
    answer: "Taxumo and JuanTax. Subscriptions, and you still do the encoding.",
  },
  {
    href: "#edge",
    question: "What is our edge?",
    answer: "AI reads your documents. You pay per run.",
  },
  {
    href: "#test",
    question: "How do we test it cheaply?",
    answer: "Run our own business's receipts against the return we filed.",
  },
  {
    href: "#risks",
    question: "What could make it fail?",
    answer: "A wrong figure on a return. We flag doubt before you file.",
  },
];

export function ValidationOverviewSlide() {
  return (
    <Slide id="validation" eyebrow={PHASE_1} title="Seven questions, seven straight answers.">
      <ol className="grid gap-x-10 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li
            key={step.href}
            className="border-t border-tk-line last:border-b sm:nth-last-2:border-b"
          >
            <a href={step.href} className="group flex gap-4 py-4">
              <span className="font-tk-mono text-sm/6 text-tk-brand tabular-nums">{index + 1}</span>
              <span>
                <span className="block font-semibold group-hover:text-tk-brand">
                  {step.question}
                </span>
                <span className="mt-0.5 block text-[15px]/[22px] text-tk-muted">{step.answer}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </Slide>
  );
}

export function ProblemSlide() {
  return (
    <Slide
      id="problem"
      eyebrow={PHASE_1}
      tag="Step 1 of 7"
      title="Is tax filing a real problem for Filipinos?"
      lead="Yes. It takes time, with a lot of manual looking up of expenses and sales. So many Filipinos get it wrong, avoid registering with the BIR, or never start the business at all."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          value="171 hours"
          label={
            <>
              and 13 payments a year for a business to comply with its taxes{" "}
              <Cite source="World Bank" refs={[3]} />
            </>
          }
        />
        <Stat
          value="No. 1"
          label={
            <>
              The BIR is the most burdensome agency for small firms, in a survey of 590{" "}
              <Cite source="AIM" refs={[4, 5]} />
            </>
          }
        />
        <Stat
          value="22%"
          label={
            <>
              of registered self-employed taxpayers paid income tax: 402,934 of 1.82 million, 2012
              data <Cite source="BIR" refs={[6, 7]} />
            </>
          }
        />
      </div>
      <Points className="mt-8 max-w-[70ch]">
        <Point title="Same forms, no accountant.">
          Small businesses face the same requirements as large ones but cannot afford the help{" "}
          <Cite source="Inquirer" refs={[8]} />.
        </Point>
        <Point title="Easy to get wrong, and mistakes are fined.">
          A 10% surcharge plus 6% yearly interest for micro and small taxpayers; 25% and 12% for the
          rest <Cite source="RA 11976" refs={[10, 11]} />.
        </Point>
        <Point title="Confusion keeps people out.">
          Online workers say they do not know which tax category applies to them{" "}
          <Cite source="PIDS" refs={[9]} />.
        </Point>
      </Points>
    </Slide>
  );
}

function Persona({ icon: Icon, name, need }: { icon: LucideIcon; name: string; need: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-tk-brand-soft text-tk-brand">
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <span>
        <span className="block font-semibold">{name}</span>
        <span className="block text-[15px]/[22px] text-tk-muted">{need}</span>
      </span>
    </li>
  );
}

export function UsersSlide() {
  return (
    <Slide
      id="users"
      eyebrow={PHASE_1}
      tag="Step 2 of 7"
      title="Who is the target user?"
      lead="Sole proprietors first. Tax professionals get 25% off and bring their clients."
    >
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Block title="Taxpayers · pay per run">
          <ul className="flex flex-col gap-4">
            <Persona
              icon={Store}
              name="Sole proprietors (primary)"
              need="Stores, clinics, service shops. Monthly and quarterly returns, piles of receipts."
            />
            <Persona
              icon={Laptop}
              name="Freelancers and contractors"
              need="Track income, collect 2307s, file every quarter."
            />
            <Persona
              icon={Building2}
              name="Small and medium businesses"
              need="More documents, plus withholding returns."
            />
          </ul>
        </Block>
        <Block title="Tax professionals · 25% off">
          <ul className="flex flex-col gap-4">
            <Persona
              icon={NotebookPen}
              name="Bookkeepers"
              need="Serve more clients in less time. No more encoding receipts by hand."
            />
            <Persona
              icon={Calculator}
              name="CPAs"
              need="Review the figures and sign off, on demand."
            />
            <Persona
              icon={Scale}
              name="Tax lawyers"
              need="Take the hard cases when they come up."
            />
          </ul>
        </Block>
      </div>
    </Slide>
  );
}

function FunnelStep({
  value,
  label,
  highlight = false,
}: {
  value: string;
  label: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-[14px] border p-4",
        highlight ? "border-tk-brand bg-tk-brand-soft" : "border-tk-line bg-tk-surface",
      )}
    >
      <p className="font-tk-mono text-xl font-medium tabular-nums">{value}</p>
      <p className="mt-1 text-sm/5 text-tk-muted">{label}</p>
    </div>
  );
}

export function MarketSlide() {
  const yearOne = Math.round(MICRO_ENTERPRISES * 0.001);
  const yearThree = Math.round(MICRO_ENTERPRISES * 0.01);

  return (
    <Slide
      id="market"
      eyebrow={PHASE_1}
      tag="Step 3 of 7"
      title="Is the market meaningful?"
      lead="Yes. More than a million small businesses, and millions more who work for themselves."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          value={formatNumber(MICRO_ENTERPRISES)}
          label={
            <>
              micro enterprises, 90% of all businesses <Cite source="DTI" refs={[1, 2]} />
            </>
          }
        />
        <Stat
          value="99.6%"
          label={
            <>
              of the 1,246,373 establishments are MSMEs <Cite source="DTI" refs={[1, 2]} />
            </>
          }
        />
        <Stat
          value="1.5M"
          label={
            <>
              freelancers and virtual assistants, estimated <Cite source="SSS" refs={[12]} />
            </>
          }
        />
        <Stat
          value="28.1%"
          label={
            <>
              of employed Filipinos are self-employed with no paid staff{" "}
              <Cite source="PSA" refs={[13]} />
            </>
          }
        />
      </div>
      <Block title="How much of it we need" className="mt-8">
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <FunnelStep value={formatNumber(MICRO_ENTERPRISES)} label="micro enterprises" />
          <ArrowRight
            aria-hidden
            className="mx-auto size-5 shrink-0 rotate-90 text-tk-muted sm:rotate-0"
          />
          <FunnelStep value={formatNumber(yearOne)} label="paying customers in year 1 (0.1%)" />
          <ArrowRight
            aria-hidden
            className="mx-auto size-5 shrink-0 rotate-90 text-tk-muted sm:rotate-0"
          />
          <FunnelStep
            value={formatNumber(yearThree)}
            label="paying customers by year 3 (1%)"
            highlight
          />
        </div>
        <p className="mt-4 text-[15px]/[22px] text-tk-muted">
          Partner channel: 5,358 BIR-accredited tax agents <Cite source="BIR" refs={[14]} />.
          Freelancers are extra and not counted in the plan.
        </p>
      </Block>
    </Slide>
  );
}

const COMPETITORS: { name: string; how: ReactNode; price: ReactNode; highlight?: boolean }[] = [
  {
    name: "Taxumo",
    how: "You record each income and expense. It computes and files.",
    price: (
      <>
        Subscription by plan: quarterly, yearly or two-year <Cite source="Taxumo" refs={[15, 16]} />
      </>
    ),
  },
  {
    name: "JuanTax",
    how: "You or your accountant enter the transactions. It prepares and files.",
    price: (
      <>
        ₱2,000 per organisation a month <Cite source="JuanTax" refs={[17, 18]} />
      </>
    ),
  },
  {
    name: "BIR eBIRForms",
    how: "You compute and type every figure yourself.",
    price: "Free",
  },
  {
    name: "A bookkeeper",
    how: "They encode your receipts by hand.",
    price: "Monthly retainer",
  },
  {
    name: "Takatax",
    how: "Upload photos. AI reads them. The engine computes every return.",
    price: "₱199 per tax compute (up to 250 documents parsed by AI). A subscription is optional.",
    highlight: true,
  },
];

export function CompetitorsSlide() {
  return (
    <Slide
      id="competitors"
      eyebrow={PHASE_1}
      tag="Step 4 of 7"
      title="What competitors already exist?"
      lead="Taxumo and JuanTax. Both are BIR-certified filing software sold by subscription, and you still record every transaction yourself."
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[15px]/[22px]">
          <thead>
            <tr className="text-[13px] uppercase tracking-[0.08em] text-tk-muted">
              <th className="py-2 pr-4 font-semibold">Option</th>
              <th className="py-2 pr-4 font-semibold">How you get your numbers</th>
              <th className="py-2 font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {COMPETITORS.map((row) => (
              <tr
                key={row.name}
                className={cn(
                  "border-t border-tk-line align-top",
                  row.highlight && "bg-tk-brand-soft",
                )}
              >
                <th
                  scope="row"
                  className={cn(
                    "py-3 pr-4 font-semibold whitespace-nowrap",
                    row.highlight && "pl-3 text-tk-brand",
                  )}
                >
                  {row.name}
                </th>
                <td className={cn("py-3 pr-4", !row.highlight && "text-tk-muted")}>{row.how}</td>
                <td className={cn("py-3 pr-3", !row.highlight && "text-tk-muted")}>{row.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[15px]/[22px] text-tk-muted">
        Takatax does not file with the BIR. You file, or your bookkeeper does.
      </p>
    </Slide>
  );
}

const EDGES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ScanLine,
    title: "Document parser on the go",
    text: "Snap receipts, invoices and 2307s. AI reads the lot.",
  },
  {
    icon: Sparkles,
    title: "AI tax assistant",
    text: "A tested rules engine computes each return and explains every excluded document.",
  },
  {
    icon: CalendarClock,
    title: "Tax monitoring on the go",
    text: "Deadlines, what is filed and paid, and your running income.",
  },
  {
    icon: Wallet,
    title: "Pay per run",
    text: "₱199 per run. A monthly plan is optional. No parse, no fee.",
  },
  {
    icon: Handshake,
    title: "Your choice",
    text: "File yourself, or hire a trusted bookkeeper on demand to check and file.",
  },
  {
    icon: BadgeCheck,
    title: "25% off for bookkeepers and CPAs",
    text: "No platform fee. They keep 100% of what they charge.",
  },
];

export function EdgeSlide() {
  return (
    <Slide
      id="edge"
      eyebrow={PHASE_1}
      tag="Step 5 of 7"
      title="What is our edge?"
      lead="AI does the reading. You pay only when you use it."
    >
      <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {EDGES.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-tk-brand-soft text-tk-brand">
              <Icon aria-hidden className="size-5" strokeWidth={1.75} />
            </span>
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-[15px]/[22px] text-tk-muted text-pretty">{text}</p>
          </li>
        ))}
      </ul>
    </Slide>
  );
}

const TEST_STEPS = [
  "Feed one quarter of our own business's receipts into Takatax.",
  "Compare its figures with the return we filed, using the tax types on our COR.",
  "Repeat, free, with 10 to 20 business owners and 3 bookkeepers.",
];

const TEST_MEASURES = [
  "98% of amounts and TINs read exactly",
  "Under 5% of documents need a human check",
  "₱0.32 or less in AI cost per document",
  "“Would you pay ₱199 for this?”",
];

export function TestSlide() {
  return (
    <Slide
      id="test"
      eyebrow={PHASE_1}
      tag="Step 6 of 7"
      title="How do we run a cheap validation test?"
      lead="Use real receipts from a real business: ours."
    >
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <Block title="The test">
          <ol className="flex flex-col gap-4">
            {TEST_STEPS.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft font-tk-mono text-sm text-tk-brand">
                  {index + 1}
                </span>
                <span className="text-pretty">{step}</span>
              </li>
            ))}
          </ol>
        </Block>
        <Block title="What we measure">
          <Points>
            {TEST_MEASURES.map((measure) => (
              <Point key={measure}>
                <span className="text-tk-ink">{measure}</span>
              </Point>
            ))}
          </Points>
          <p className="mt-6 rounded-[14px] bg-tk-surface/80 p-4 text-[15px]/[22px] text-tk-muted">
            <strong className="font-semibold text-tk-ink">Cost: about ₱64.</strong> That is the AI
            bill for a 200-document test <Cite source="Takatax" refs={[21]} />.
          </p>
        </Block>
      </div>
    </Slide>
  );
}

const RISKS: { risk: string; cause: string; answer: string }[] = [
  {
    risk: "A wrong figure gets filed",
    cause: "Blurry photo, missing document, wrong tax option.",
    answer: "Confidence scores, arithmetic checks, a review screen, a CPA-reviewed engine.",
  },
  {
    risk: "People do not trust AI with taxes",
    cause: "The numbers feel like a black box.",
    answer: "A free trial per TIN, a reason for every number, verified bookkeepers on demand.",
  },
  {
    risk: "AI cost runs away",
    cause: "Heavy uploads, hard-to-read photos.",
    answer: "Payment before any reading, document caps, a daily spending limit.",
  },
  {
    risk: "A data leak",
    cause: "TINs and income are sensitive.",
    answer: "One account per TIN, row-level security in the database, consent per purpose.",
  },
  {
    risk: "Competitors copy pay-per-run",
    cause: "Pricing is easy to match.",
    answer: "The bookkeeper network, and each user's stored history and archive.",
  },
];

export function RisksSlide() {
  return (
    <Slide
      id="risks"
      eyebrow={PHASE_1}
      tag="Step 7 of 7"
      title="What are the biggest failure risks?"
      lead="A wrong figure on a tax return. Most errors will come from people, not from Takatax, so we catch them before filing."
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[15px]/[22px]">
          <thead>
            <tr className="text-[13px] uppercase tracking-[0.08em] text-tk-muted">
              <th className="py-2 pr-4 font-semibold">Risk</th>
              <th className="py-2 pr-4 font-semibold">Why it happens</th>
              <th className="py-2 font-semibold">What we do</th>
            </tr>
          </thead>
          <tbody>
            {RISKS.map((row) => (
              <tr key={row.risk} className="border-t border-tk-line align-top">
                <th scope="row" className="py-3 pr-4 font-semibold">
                  {row.risk}
                </th>
                <td className="py-3 pr-4 text-tk-muted">{row.cause}</td>
                <td className="py-3 text-tk-muted">{row.answer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Slide>
  );
}
