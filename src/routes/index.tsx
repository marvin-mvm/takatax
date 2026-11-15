import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronDown,
  Clock3,
  FileUp,
  Landmark,
  MessageCircleQuestion,
  Newspaper,
  ScanLine,
  Sparkles,
  TrendingDown,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { SiteShell } from "@/components/site/SiteShell";
import { buttonOutline, buttonStart, textLink } from "@/components/site/styles";

const title = "Takatax: your BIR figures, straight from your receipts";
const description =
  "Upload receipts, sales invoices and 2307s. AI reads each one and Takatax computes your tax returns, line by line. Verified bookkeepers and an anonymous community help you file. ₱199 per run.";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: LandingPage,
});

function Section({
  id,
  eyebrow,
  title: heading,
  intro,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-20 ${className ?? ""}`}>
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-sm font-semibold tracking-[0.08em] text-tk-brand uppercase">{eyebrow}</p>
        <h2
          id={`${id}-title`}
          className="mt-2 max-w-[24ch] text-[30px]/[36px] font-bold tracking-tight text-balance sm:text-[38px]/[44px]"
        >
          {heading}
        </h2>
        {intro ? (
          <p className="mt-4 max-w-[62ch] text-lg/7 text-tk-muted text-pretty">{intro}</p>
        ) : null}
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

const PROBLEMS: { icon: LucideIcon; value: string; text: string; source: string }[] = [
  {
    icon: Clock3,
    value: "171 hours",
    text: "a year for a Philippine business to comply with its taxes.",
    source: "World Bank, Doing Business 2020",
  },
  {
    icon: Landmark,
    value: "No. 1",
    text: "The BIR is the most burdensome agency for small firms, in a survey of 590.",
    source: "Asian Institute of Management, 2019",
  },
  {
    icon: TrendingDown,
    value: "22%",
    text: "of registered self-employed taxpayers paid income tax.",
    source: "BIR, 2012 data",
  },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: FileUp,
    title: "Upload receipts, sales collections, withholding and more",
    text: "Snap photos or upload PDFs: receipts, sales invoices, Form 2307s and your COR. We check each photo for blur before it goes up.",
  },
  {
    icon: ScanLine,
    title: "AI reads each document",
    text: "A fast model reads everything, a second model double-checks anything doubtful, and arithmetic checks catch wrong totals. You only confirm the few it is unsure about.",
  },
  {
    icon: BarChart3,
    title: "Get your tax figures",
    text: "Your 1701Q, 2551Q and SAWT figures line by line, per tax type, with a reason for every document left out. You or your bookkeeper file them.",
  },
];

type Status = "Ready" | "Coming soon" | "After launch";

const FEATURES: { icon: LucideIcon; title: string; text: string; status: Status }[] = [
  {
    icon: BarChart3,
    title: "Tax tracker",
    text: "What you earned, spent and owe each month, by tax type, as a line, bar or pie chart. Every row links to its receipt or invoice.",
    status: "Ready",
  },
  {
    icon: CalendarClock,
    title: "My COR and deadlines",
    text: "Your tax types, every return you file, the due dates, and what to have ready before each one.",
    status: "Ready",
  },
  {
    icon: Sparkles,
    title: "AI records assistant",
    text: "Ask about your own figures: “Which month had my highest sales?” Answers come from your records only.",
    status: "Coming soon",
  },
  {
    icon: BadgeCheck,
    title: "Trusted bookkeepers, CPAs and tax lawyers",
    text: "Credentials checked by us and rated 1 to 5 stars by their clients. Hire one on demand to check and file for you.",
    status: "Ready",
  },
  {
    icon: MessageCircleQuestion,
    title: "Anonymous community",
    text: "Ask without your name. Verified professionals answer under theirs. Posts are public unless you make them private.",
    status: "Ready",
  },
  {
    icon: Building2,
    title: "A profile lenders trust",
    text: "Share a summary of the income you filed with a bank or lender, free, when you apply for a loan.",
    status: "After launch",
  },
  {
    icon: Newspaper,
    title: "Industry insights",
    text: "A premium newsletter for investors and founders: which industries and places are growing, from anonymous, combined data.",
    status: "After launch",
  },
];

const STATUS_STYLE: Record<Status, string> = {
  Ready: "bg-tk-brand-soft text-tk-brand",
  "Coming soon": "bg-tk-warn-soft text-tk-warn",
  "After launch": "bg-tk-surface-2 text-tk-muted",
};

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "How do I use Takatax?",
    a: "Create a free account, upload your COR (BIR Form 2303), then upload your receipts, sales invoices and 2307s. AI reads them, and your tracker and return figures fill in. Your first 10 documents are free.",
  },
  {
    q: "Who files my tax return?",
    a: "You do, or a bookkeeper you choose. Takatax computes the figures for each return; it does not file with the BIR for you.",
  },
  {
    q: "Can I file on my own?",
    a: "Yes. Takatax gives you every figure line by line, with the form and due date. Copy them into eBIRForms or eFPS and pay through your usual channel.",
  },
  {
    q: "What if I don't know how to file?",
    a: "Ask in the community, where verified bookkeepers answer for free, or hire one from our directory to file for you.",
  },
  {
    q: "What if a receipt is hard to read?",
    a: "We flag blurry, dark or glary photos before you upload so you can retake them. If the AI is still unsure about an amount or TIN, it asks you to check that one figure instead of guessing.",
  },
  {
    q: "Can I find a reliable bookkeeper to help me?",
    a: (
      <>
        Yes. Every bookkeeper, CPA and tax lawyer in our{" "}
        <Link to="/bookkeepers" className={textLink}>
          directory
        </Link>{" "}
        has had their BIR accreditation or PRC licence checked, and is rated 1 to 5 stars by their
        own clients.
      </>
    ),
  },
  {
    q: "Does Takatax handle payments between me and my bookkeeper?",
    a: "No. You agree on fees and pay your bookkeeper directly. Takatax takes no cut and never holds that money. Bookkeepers pay us 25% less per run, and that is all.",
  },
  {
    q: "Are my community questions public?",
    a: "Your name is never shown. Posts are public, and can appear on Google, unless you tick “Make this post private”; then only logged-in members can see them. TINs, phone numbers, emails and amounts are blurred automatically.",
  },
  {
    q: "Is my data private?",
    a: "Your documents are stored privately and only you, and any bookkeeper you give access to, can see them. You can remove a bookkeeper's access or delete your files at any time.",
  },
  {
    q: "How much does it cost?",
    a: (
      <>
        Your first 10 documents are free. After that, ₱199 reads up to 250 documents, and every
        return computed from them is free. Premium is ₱800 a month for 1,000 documents.{" "}
        <Link to="/pricing" className={textLink}>
          See pricing
        </Link>
        .
      </>
    ),
  },
];

function StartButton() {
  return (
    <Link to="/signup" className={buttonStart}>
      Start
      <ArrowRight aria-hidden className="size-6" />
    </Link>
  );
}

function LandingPage() {
  return (
    <SiteShell>
      {/* Hero: what Takatax is, and the one big action. */}
      <section className="mx-auto flex max-w-[860px] flex-col items-center px-4 pt-16 pb-16 text-center sm:px-6 sm:pt-24 sm:pb-20">
        <p className="rounded-full border border-tk-brand/20 bg-tk-surface/80 px-3 py-1 text-sm font-medium text-tk-brand">
          For Filipino sole proprietors, freelancers and small businesses
        </p>
        <h1 className="mt-6 text-[40px]/[44px] font-bold tracking-tight text-balance sm:text-[62px]/[66px]">
          Your BIR figures, straight from your receipts.
        </h1>
        <p className="mt-6 max-w-[58ch] text-lg/7 text-tk-muted text-pretty sm:text-xl/8">
          Upload your receipts, sales invoices and 2307s. AI reads each one and Takatax computes
          your tax returns, line by line. ₱199 per run. A subscription is optional.
        </p>
        <div className="mt-10">
          <StartButton />
        </div>
        <p className="mt-5 text-tk-muted">
          Your first 10 documents are free.{" "}
          <Link to="/login" className={textLink}>
            Log in
          </Link>{" "}
          if you already have an account.
        </p>
      </section>

      {/* The problem. */}
      <Section
        id="problem"
        eyebrow="The problem"
        title="Filing taxes takes too long, so many people skip it."
        intro="Small businesses face the same forms as big companies, without an accountant. Mistakes are fined, so many Filipinos get it wrong, avoid registering, or never start a business at all."
        className="bg-tk-surface/70"
      >
        <ul className="grid gap-4 md:grid-cols-3">
          {PROBLEMS.map(({ icon: Icon, value, text, source }) => (
            <li key={value} className="rounded-[18px] border border-tk-line bg-tk-surface p-6">
              <Icon aria-hidden className="size-6 text-tk-accent" />
              <p className="mt-3 font-tk-mono text-[32px]/[38px] font-medium">{value}</p>
              <p className="mt-1 text-tk-ink text-pretty">{text}</p>
              <p className="mt-3 text-sm text-tk-muted">{source}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-tk-muted">
          Full sources are in the{" "}
          <Link to="/deck" hash="sources" className={textLink}>
            Takatax pitch deck
          </Link>
          .
        </p>
      </Section>

      {/* The solution: the AI parser in three steps. */}
      <Section
        id="how-it-works"
        eyebrow="The solution"
        title="What Takatax does"
        intro="Takatax turns photos of your documents into the figures for your BIR returns. You stay in control: check anything, file yourself, or bring in a bookkeeper."
      >
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title: stepTitle, text }, index) => (
            <li
              key={stepTitle}
              className="flex flex-col rounded-[20px] border border-tk-line bg-tk-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_20px_rgb(0_0_0/0.04)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-[12px] bg-tk-brand text-white">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="font-tk-mono text-2xl font-medium text-tk-brand">{index + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-pretty">{stepTitle}</h3>
              <p className="mt-2 text-tk-muted text-pretty">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* What we build on top of the parser. */}
      <Section
        id="platform"
        eyebrow="Built on top of the AI reader"
        title="More than a calculator: a place to get taxes right."
        intro="Once your documents are read, Takatax keeps working for you, and connects you with people who can help."
        className="bg-tk-surface/70"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title: featureTitle, text, status }) => (
            <li
              key={featureTitle}
              className="flex flex-col rounded-[18px] border border-tk-line bg-tk-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-[11px] bg-tk-brand-soft text-tk-brand">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[13px] font-medium ${STATUS_STYLE[status]}`}
                >
                  {status}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{featureTitle}</h3>
              <p className="mt-1 text-tk-muted text-pretty">{text}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* Community and trusted help: the main emphasis after the parser. */}
      <Section
        id="community"
        eyebrow="Community"
        title="Meet trusted help, anonymously."
        intro="Ask a tax question without your name. Verified bookkeepers, CPAs and tax lawyers answer under theirs, and you can hire one when you need more. We never stand between you and them."
      >
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[20px] border border-tk-line bg-tk-surface p-6">
            <ul className="flex flex-col gap-4">
              {[
                [
                  "You stay anonymous",
                  "Your name is never shown, and TINs, phone numbers, emails and amounts are blurred.",
                ],
                [
                  "Public or private, your choice",
                  "Posts help others on Google, unless you make them members-only.",
                ],
                [
                  "Real professionals, rated",
                  "Answers come from verified pros with a 1 to 5 star rating from their clients.",
                ],
                [
                  "No middleman",
                  "Takatax takes no platform fee and never handles payments between you.",
                ],
              ].map(([heading, text]) => (
                <li key={heading} className="flex gap-3">
                  <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-tk-brand" />
                  <span>
                    <strong className="font-semibold">{heading}.</strong>{" "}
                    <span className="text-tk-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/community" className={buttonOutline}>
                <Users aria-hidden className="size-5" /> Visit the community
              </Link>
              <Link to="/bookkeepers" className={buttonOutline}>
                <BadgeCheck aria-hidden className="size-5" /> Find a bookkeeper
              </Link>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-4 rounded-[20px] bg-tk-brand p-6 text-white">
            <div>
              <p className="text-sm font-semibold tracking-[0.08em] text-white/80 uppercase">
                For bookkeepers, CPAs and tax lawyers
              </p>
              <p className="mt-2 text-2xl font-bold text-balance">
                25% off every client run. No platform fee.
              </p>
              <p className="mt-2 text-white/85 text-pretty">
                Manage every client in one dashboard, answer questions to build your reputation, and
                get found by taxpayers near you.
              </p>
            </div>
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-[10px] bg-white px-4 font-semibold text-tk-brand hover:bg-tk-brand-soft"
            >
              Join as a partner <ArrowRight aria-hidden className="size-5" />
            </Link>
          </div>
        </div>
      </Section>

      {/* Pricing in brief. */}
      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Pay only when you run."
        className="bg-tk-surface/70"
      >
        <ul className="grid gap-4 md:grid-cols-3">
          {[
            ["Free trial", "₱0", "Your first 10 documents, full results."],
            ["Parse run", "₱199", "Up to 250 documents. Every return computed from them is free."],
            ["Premium", "₱800 / month", "1,000 documents a month and 15 GB of storage."],
          ].map(([name, price, text]) => (
            <li key={name} className="rounded-[18px] border border-tk-line bg-tk-surface p-6">
              <p className="font-semibold">{name}</p>
              <p className="mt-2 font-tk-mono text-3xl font-medium">{price}</p>
              <p className="mt-2 text-tk-muted text-pretty">{text}</p>
            </li>
          ))}
        </ul>
        <Link to="/pricing" className={`${textLink} mt-6 inline-flex items-center gap-1`}>
          See full pricing <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Section>

      {/* Questions people ask. Native <details> so answers work without JavaScript. */}
      <Section id="faq" eyebrow="FAQ" title="Questions people ask">
        <div className="flex flex-col gap-3">
          {FAQ.map(({ q, a }) => (
            <details
              key={q}
              className="group rounded-[16px] border border-tk-line bg-tk-surface open:border-tk-brand"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-lg font-semibold marker:hidden">
                {q}
                <ChevronDown
                  aria-hidden
                  className="size-5 shrink-0 text-tk-muted transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="px-5 pb-5 text-tk-muted text-pretty">{a}</div>
            </details>
          ))}
        </div>
      </Section>

      {/* Closing call to action. */}
      <section className="mx-auto max-w-[860px] px-4 pb-24 text-center sm:px-6">
        <h2 className="text-[30px]/[36px] font-bold tracking-tight text-balance sm:text-[38px]/[44px]">
          Start with your first 10 documents, free.
        </h2>
        <p className="mt-3 text-lg text-tk-muted">No card needed. Takes a few minutes.</p>
        <div className="mt-8">
          <StartButton />
        </div>
      </section>
    </SiteShell>
  );
}
