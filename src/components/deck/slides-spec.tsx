import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { SOURCES } from "@/lib/deck/sources";
import { cn } from "@/lib/utils";

import { Block, Cite, Pill, Point, Points, Slide } from "./primitives";
import { WhatIfModel } from "./WhatIfModel";

const PHASE_2 = "Phase 2 · Spec and architecture";

export function ModelSlide() {
  return (
    <Slide
      id="model"
      eyebrow="Phase 1 · What-if model"
      title="Play with the plan"
      lead="0.1% of micro enterprises in year 1. 1% by year 3. Move any slider and the numbers follow."
    >
      <WhatIfModel />
    </Slide>
  );
}

function Node({
  title,
  subtitle,
  items,
  highlight = false,
}: {
  title: string;
  subtitle: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border p-4",
        highlight ? "border-tk-brand bg-tk-brand-soft" : "border-tk-line bg-tk-surface/80",
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="text-[13px]/[18px] text-tk-muted">{subtitle}</p>
      <ul className="mt-3 flex flex-col gap-1 text-sm/5 text-tk-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function FlowArrow() {
  return (
    <ArrowRight
      aria-hidden
      className="mx-auto size-5 shrink-0 rotate-90 self-center text-tk-muted lg:rotate-0"
    />
  );
}

export function ArchitectureSlide() {
  return (
    <Slide
      id="architecture"
      eyebrow={PHASE_2}
      title="Architecture: AI reads, code computes."
      lead="The model only reads documents. A rules engine does the tax math, so every number can be reproduced and explained."
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Node
          title="Browser"
          subtitle="TanStack Start app on Netlify"
          items={["Upload photos and PDFs", "Photo check before upload", "Review and results"]}
        />
        <FlowArrow />
        <Node
          title="Supabase Edge Functions"
          subtitle="TypeScript on the server"
          items={[
            "Checks every input and payment",
            "Signs upload links",
            "Calls the AI, holds the keys",
          ]}
          highlight
        />
        <FlowArrow />
        <Node
          title="OpenRouter"
          subtitle="One API for the AI models"
          items={["Reads images and PDFs", "Gemini Flash and Pro", "Claude Haiku"]}
        />
      </div>
      <ArrowDown aria-hidden className="mx-auto mt-3 size-5 rotate-0 text-tk-muted" />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Node
          title="Supabase Postgres and Auth"
          subtitle="Data and login"
          items={["One account per TIN", "Row-level security", "Paywall in the database"]}
        />
        <Node
          title="Cloudflare R2"
          subtitle="File storage"
          items={["Private buckets", "Uploads by signed link", "No download fees"]}
        />
        <Node
          title="Tax engine"
          subtitle="Plain TypeScript, unit-tested"
          items={["1701Q, 2551Q, SAWT", "A reason for every exclusion"]}
        />
      </div>
      <Points className="mt-8 max-w-[72ch]">
        <Point title="Pay before any reading.">
          AI runs only for a paid run or the one free trial.
        </Point>
        <Point title="Files go straight to R2.">
          The browser uploads with a short-lived signed link. The edge function reads each file back
          and sends it to OpenRouter.
        </Point>
        <Point title="No secrets in the repo or the browser.">
          The OpenRouter and R2 keys live in Supabase Edge Function secrets.
        </Point>
      </Points>
    </Slide>
  );
}

const READER_STEPS: { title: string; text: string; cost: string }[] = [
  {
    title: "Photo check",
    text: "The browser rotates, shrinks and flags blurry or dark photos.",
    cost: "Free",
  },
  {
    title: "Fast model reads",
    text: "Every document is read and each field gets a confidence score.",
    cost: "₱0.17",
  },
  {
    title: "Arithmetic checks",
    text: "VAT is 12/112 of the total. TINs, dates and totals must add up.",
    cost: "Free",
  },
  {
    title: "Second model rechecks",
    text: "Doubtful documents are read again by a model from another company.",
    cost: "₱0.05",
  },
  {
    title: "Top model settles it",
    text: "Used only when the first two disagree.",
    cost: "₱0.62",
  },
  {
    title: "You confirm the rest",
    text: "A review card shows the photo and the unsure field. Target: under 5%.",
    cost: "Free",
  },
];

export function ReaderSlide() {
  return (
    <Slide
      id="reader"
      eyebrow={PHASE_2}
      title="The core AI feature: a reader that knows when it is unsure."
      lead="Three models, cheapest first. The costly ones only see the hard documents."
    >
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {READER_STEPS.map((step, index) => (
          <li
            key={step.title}
            className="rounded-[14px] border border-tk-line bg-tk-surface/80 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-tk-brand-soft font-tk-mono text-sm text-tk-brand">
                {index + 1}
              </span>
              <span className="font-tk-mono text-[13px] text-tk-muted">{step.cost}</span>
            </div>
            <h3 className="mt-3 font-semibold">{step.title}</h3>
            <p className="mt-1 text-[15px]/[22px] text-tk-muted text-pretty">{step.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[15px]/[22px] text-tk-muted">
        <strong className="font-semibold text-tk-ink">₱0.23 to ₱0.32 per document</strong> once
        blended: Gemini Flash, then Claude Haiku, then Gemini Pro, all through OpenRouter{" "}
        <Cite source="Takatax" refs={[21, 19, 20, 22]} />. A full 250-document run costs at most ₱80
        in AI against a ₱199 price.
      </p>
    </Slide>
  );
}

const STACK: { layer: string; choice: string }[] = [
  { layer: "App", choice: "TanStack Start, React 19, TypeScript, Vite" },
  { layer: "Interface", choice: "Tailwind CSS 4, shadcn/ui on Radix, Recharts" },
  { layer: "Validation", choice: "Zod with React Hook Form" },
  { layer: "Backend", choice: "Supabase Edge Functions, TypeScript" },
  { layer: "Data", choice: "Supabase: Postgres, Auth, row-level security" },
  { layer: "Storage", choice: "Cloudflare R2, private, with signed upload links" },
  { layer: "AI", choice: "OpenRouter: Gemini Flash and Pro, Claude Haiku, server-side only" },
  { layer: "Tests and CI", choice: "Vitest, with GitHub Actions on every pull request" },
  { layer: "Hosting", choice: "Netlify, deployed from the main branch" },
];

type Status = "Done" | "Drafted" | "In progress" | "Next";

const statusTone: Record<Status, "brand" | "warn" | "neutral"> = {
  Done: "brand",
  Drafted: "warn",
  "In progress": "warn",
  Next: "neutral",
};

function Checklist({ items }: { items: { task: string; status: Status; note: string }[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.task}
          className="flex items-start justify-between gap-4 border-t border-tk-line py-3 first:border-t-0 first:pt-0"
        >
          <span>
            <span className="block font-semibold">{item.task}</span>
            <span className="block text-[15px]/[22px] text-tk-muted text-pretty">{item.note}</span>
          </span>
          <Pill tone={statusTone[item.status]}>{item.status}</Pill>
        </li>
      ))}
    </ul>
  );
}

export function StackSlide() {
  return (
    <Slide
      id="stack"
      eyebrow={PHASE_2}
      title="Tech stack and spec files"
      lead="One language, TypeScript, from the browser to the tax engine."
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <Block title="Stack">
          <dl className="flex flex-col">
            {STACK.map((row) => (
              <div
                key={row.layer}
                className="grid grid-cols-[104px_1fr] gap-3 border-t border-tk-line py-2.5 text-[15px]/[22px] first:border-t-0 first:pt-0"
              >
                <dt className="font-semibold">{row.layer}</dt>
                <dd className="text-tk-muted">{row.choice}</dd>
              </div>
            ))}
          </dl>
        </Block>
        <Block title="Phase 2 deliverables">
          <Checklist
            items={[
              {
                task: "Architecture notes",
                status: "Done",
                note: "Services, data model, security and the reader pipeline.",
              },
              {
                task: "spec.md",
                status: "Drafted",
                note: "Written as a PRD and an MVP spec with acceptance criteria.",
              },
              {
                task: "AGENTS.md",
                status: "Done",
                note: "Project rules for AI coding tools, in the repo.",
              },
              { task: ".cursorrules", status: "Next", note: "The same rules for Cursor." },
              {
                task: "Spec revised after review",
                status: "Done",
                note: "Version 1.1. The next slide shows what changed.",
              },
            ]}
          />
        </Block>
      </div>
    </Slide>
  );
}

const REVISIONS: { before: string; after: ReactNode }[] = [
  {
    before: "Meals can be claimed under OSD.",
    after: "Receipts only count for itemized deductions. OSD is a flat 40%.",
  },
  {
    before: "Everyone files a 2551Q.",
    after: "8% filers do not. The 8% replaces percentage tax.",
  },
  {
    before: "Each quarter is computed on its own.",
    after: "The 1701Q adds up from January 1. The fourth quarter goes in the annual return.",
  },
  {
    before: "Official receipts are the proof.",
    after: (
      <>
        Since 2024 the invoice is the primary document <Cite source="RA 11976" refs={[10, 11]} />.
      </>
    ),
  },
  {
    before: "The COR decides the tax option.",
    after: "It often does not show the 8% choice. The user confirms it each year.",
  },
];

export function ReviewSlide() {
  return (
    <Slide
      id="review"
      eyebrow={PHASE_2}
      title="Review fixed the tax logic before any code was written."
      lead="A review of the first draft caught these tax errors. Each one is now a rule in the tax engine."
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[15px]/[22px]">
          <thead>
            <tr className="text-[13px] uppercase tracking-[0.08em] text-tk-muted">
              <th className="w-[38%] py-2 pr-6 font-semibold">First draft said</th>
              <th className="py-2 font-semibold">Correct rule</th>
            </tr>
          </thead>
          <tbody>
            {REVISIONS.map((row) => (
              <tr key={row.before} className="border-t border-tk-line align-top">
                <td className="py-3 pr-6 text-tk-muted line-through decoration-tk-line">
                  {row.before}
                </td>
                <td className="py-3">{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Slide>
  );
}

function Branch({
  name,
  role,
  highlight = false,
}: {
  name: string;
  role: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border p-4",
        highlight ? "border-tk-brand bg-tk-brand-soft" : "border-tk-line bg-tk-surface/80",
      )}
    >
      <p className="font-tk-mono text-[15px] font-medium">{name}</p>
      <p className="mt-1 text-sm/5 text-tk-muted">{role}</p>
    </div>
  );
}

export function WorkflowSlide() {
  return (
    <Slide
      id="workflow"
      eyebrow={PHASE_2}
      title="How we ship"
      lead="Build on a branch. Check it automatically. Merge to go live."
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        <Branch name="v0.002" role="Build branch. Every change starts here." />
        <FlowArrow />
        <Branch name="Pull request" role="CI runs lint, type-check, tests and a build." />
        <FlowArrow />
        <Branch name="main" role="Reviewed and merged by the owner." highlight />
        <FlowArrow />
        <Branch name="Netlify" role="The live site, deployed on merge." />
        <div className="lg:col-start-5">
          <ArrowDown aria-hidden className="mx-auto size-5 text-tk-muted" />
          <div className="mt-3">
            <Branch name="v0.001" role="Lovable backup editor, back-filled from main." />
          </div>
        </div>
      </div>
      <Points className="mt-8 max-w-[72ch]">
        <Point title="Small commits, one change each.">All authored by the owner.</Point>
        <Point title="Branch pushes skip the Netlify build.">Only main deploys.</Point>
        <Point title="Merge commits, never squash.">
          History stays intact for the Lovable sync.
        </Point>
      </Points>
    </Slide>
  );
}

const SWATCHES: { name: string; hex: string; className: string }[] = [
  { name: "Brand", hex: "#0E7A5A", className: "bg-tk-brand" },
  { name: "Brand soft", hex: "#E1F2EB", className: "bg-tk-brand-soft" },
  { name: "Accent", hex: "#F2A93B", className: "bg-tk-accent" },
  { name: "Ink", hex: "#14201B", className: "bg-tk-ink" },
  { name: "Muted", hex: "#5B6B64", className: "bg-tk-muted" },
  { name: "Line", hex: "#D9E2DE", className: "bg-tk-line" },
  { name: "Page gradient", hex: "#F6F8F7 → #E1F2EB", className: "tk-gradient-swatch" },
  { name: "Please check", hex: "#9A5B00", className: "bg-tk-warn" },
  { name: "Error", hex: "#B3261E", className: "bg-tk-danger" },
];

export function DesignSlide() {
  return (
    <Slide
      id="design"
      eyebrow={PHASE_2}
      title="Design: calm, clear, numbers first."
      lead="Taxes are stressful. The interface should feel like a competent friend."
    >
      <div className="grid gap-10 lg:grid-cols-2">
        <Block title="Colour">
          <ul className="grid grid-cols-3 gap-x-4 gap-y-5">
            {SWATCHES.map((swatch) => (
              <li key={swatch.name}>
                <span
                  aria-hidden
                  className={cn(
                    "block h-12 rounded-[10px] border border-tk-line",
                    swatch.className,
                  )}
                />
                <span className="mt-2 block text-sm/5 font-medium">{swatch.name}</span>
                <span className="block font-tk-mono text-[13px] text-tk-muted">{swatch.hex}</span>
              </li>
            ))}
          </ul>
        </Block>
        <div className="flex flex-col gap-8">
          <Block title="Type">
            <p className="text-[36px]/[44px] font-bold tracking-tight">Plus Jakarta Sans</p>
            <p className="text-[15px]/[22px] text-tk-muted">Titles, body text and buttons.</p>
            <p className="mt-4 font-tk-mono text-[28px]/9 font-medium tabular-nums">₱12,450.00</p>
            <p className="text-[15px]/[22px] text-tk-muted">
              IBM Plex Mono for amounts, TINs and dates.
            </p>
          </Block>
          <Block title="Principles">
            <Points>
              <Point title="One job per screen.">Upload, review, pay, results.</Point>
              <Point title="Colour only for meaning.">Green done, amber check, red due.</Point>
              <Point title="Mobile first.">Every screen works at 360 px wide.</Point>
            </Points>
          </Block>
        </div>
      </div>
    </Slide>
  );
}

const BUILD_ORDER = [
  "Free 8% vs OSD calculator",
  "Account from your COR",
  "Upload and AI reader",
  "Review screen",
  "Results: 1701Q, 2551Q, SAWT",
  "Tax tracker",
];

export function BuildSlide() {
  return (
    <Slide
      id="build"
      eyebrow="Phase 3 · Build"
      title="Build plan, and where we are."
      lead="The foundation is live. The AI reader is next."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Block title="Phase 3 tasks">
          <Checklist
            items={[
              {
                task: "Scaffold the application",
                status: "Done",
                note: "The TanStack Start app, Supabase sign-up and login, CI and Netlify are in place.",
              },
              {
                task: "Implement the core AI feature",
                status: "In progress",
                note: "The three-step reader and its checks are built and tested; the OpenRouter key is next.",
              },
              {
                task: "At least 5 meaningful commits",
                status: "Done",
                note: "Small commits, one change each, through pull requests.",
              },
              {
                task: "At least 3 unit tests",
                status: "Done",
                note: "The financial model on this page is unit-tested in CI.",
              },
              {
                task: "Check secrets and input validation",
                status: "In progress",
                note: "No secrets in the repo. Zod checks the sign-up and login forms; edge functions will check every input.",
              },
            ]}
          />
        </Block>
        <Block title="Build order">
          <ol className="flex flex-col gap-3">
            {BUILD_ORDER.map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft font-tk-mono text-sm text-tk-brand">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Block>
      </div>
    </Slide>
  );
}

export function SourcesSlide() {
  return (
    <Slide
      id="sources"
      eyebrow="References"
      title="Sources"
      lead="A claim is cited as (Primary, 1, 2): the main source by name, then the entries below that back it."
    >
      <ol className="grid gap-x-10 lg:grid-cols-2">
        {SOURCES.map((source) => (
          <li
            key={source.id}
            id={`ref-${source.id}`}
            className="flex scroll-mt-24 gap-3 border-t border-tk-line py-3 text-[15px]/[22px] target:bg-tk-brand-soft"
          >
            <span className="w-6 shrink-0 font-tk-mono text-sm/[22px] text-tk-brand tabular-nums">
              {source.id}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{source.publisher}</span>
              <span className="block text-pretty">{source.title}</span>
              <span className="block text-tk-muted text-pretty">{source.note}</span>
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm/5 font-medium text-tk-brand underline-offset-2 hover:underline"
                >
                  {new URL(source.url).hostname.replace(/^www\./, "")}
                  <ArrowUpRight aria-hidden className="size-3.5" />
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </Slide>
  );
}
