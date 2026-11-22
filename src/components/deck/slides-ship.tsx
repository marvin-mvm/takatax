/** Phase 4 (deploy) and Phase 5 (document and reflect) of the build brief. */

import { Block, Point, Points, Slide } from "./primitives";
import { Checklist } from "./slides-spec";

const PHASE_4 = "Deliverable 5 · Live deployed application";

/** The brief's recommended stack, and what Takatax uses in its place. */
const STACK_MAP: { layer: string; recommended: string; ours: string }[] = [
  { layer: "Frontend", recommended: "Next.js 14 + Tailwind", ours: "TanStack Start + Tailwind 4" },
  {
    layer: "AI / LLM",
    recommended: "Vercel AI SDK + Claude or OpenAI",
    ours: "OpenRouter: Gemini Flash and Pro, Claude Haiku",
  },
  { layer: "Database", recommended: "Supabase", ours: "Supabase Postgres, row-level security" },
  { layer: "Auth", recommended: "Clerk or Supabase Auth", ours: "Supabase Auth" },
  { layer: "Deploy", recommended: "Vercel + GitHub Actions", ours: "Netlify + GitHub Actions" },
  { layer: "AI coding", recommended: "Cursor", ours: "Claude Code, with AGENTS.md" },
];

export function DeploySlide() {
  return (
    <Slide
      id="deploy"
      eyebrow={PHASE_4}
      title="Live, checked on every change, and watched."
      lead="takatax.netlify.app is built from main. Nothing reaches it without passing CI."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Block title="Phase 4 tasks">
          <Checklist
            items={[
              {
                task: "Configure GitHub Actions",
                status: "Done",
                note: "ci.yml runs lint, type-check, the unit tests and a production build on every pull request; trigger-deploy.yml ships the background reader.",
              },
              {
                task: "Deploy to a live host",
                status: "Done",
                note: "Netlify serves main at takatax.netlify.app. Supabase hosts the database and edge functions; files go to Cloudflare R2.",
              },
              {
                task: "Set environment variables",
                status: "Done",
                note: "The public Supabase URL and key in Netlify; the OpenRouter and R2 keys as Supabase secrets. None in the repo or the browser.",
              },
              {
                task: "Test the live app",
                status: "Done",
                note: "Sign-up, upload, AI reading and results on the live URL, in a private window, on a phone and a computer.",
              },
              {
                task: "Basic monitoring",
                status: "Done",
                note: "Every AI call is logged with its cost, and a daily spending cap stops the reader. Supabase function logs, Netlify deploy logs and CI status on every change.",
              },
            ]}
          />
        </Block>
        <Block title="Recommended stack, and ours">
          <dl className="flex flex-col">
            {STACK_MAP.map((row) => (
              <div
                key={row.layer}
                className="grid grid-cols-[88px_1fr] gap-3 border-t border-tk-line py-2.5 text-[15px]/[22px] first:border-t-0 first:pt-0"
              >
                <dt className="font-semibold">{row.layer}</dt>
                <dd>
                  <span className="block">{row.ours}</span>
                  <span className="block text-sm text-tk-muted">Instead of {row.recommended}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Block>
      </div>
    </Slide>
  );
}

export function DocumentSlide() {
  return (
    <Slide
      id="document"
      eyebrow="Deliverable 6 · Demo recording"
      title="Demo: the core AI feature in action."
      lead="A 2-minute walkthrough of the live app at takatax.netlify.app."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Block title="The 2-minute demo">
          {/* The video link is added only to the submitted PDF, never to the repository. */}
          <p
            data-demo-link
            className="rounded-[12px] border border-tk-line bg-tk-surface-2 px-4 py-3 font-semibold break-all"
          >
            The video link is in the submitted PDF.
          </p>
          <Points className="mt-5">
            <Point title="Sign up and upload.">Receipts, invoices and a COR, photos or PDFs.</Point>
            <Point title="AI reads them.">
              Live progress for each document, the fast model first, then the checks.
            </Point>
            <Point title="Please check.">The few unsure fields, corrected in a form.</Point>
            <Point title="The figures.">Tracker, deadlines and the return figures.</Point>
          </Points>
        </Block>
        <Block title="Also done">
          <Checklist
            items={[
              {
                task: "README",
                status: "Done",
                note: "The problem, the AI feature, the stack, how to run it, secrets, CI/CD and monitoring.",
              },
              {
                task: "A GitHub issue for v2",
                status: "Done",
                note: "Issue #44: VAT returns (2550Q) for businesses that pass ₱3M in sales.",
              },
              {
                task: "No secrets exposed",
                status: "Done",
                note: "Every commit scanned for keys before the repository went public; none found.",
              },
            ]}
          />
        </Block>
      </div>
    </Slide>
  );
}

const REFLECTION = [
  "The whole process of creating the AI-powered web app is not the most difficult part; instead, the idea validation, finding the right target audience and having measured data to back up the existence of the web app itself is the most challenging part for me.",
  "Anyone can create a web app now using LLMs and cloud services, but it could be a 'toy' app. To justify its existence, the data from the PRD and idea validation and the target market dictate whether it is a viable app to spend time on and even to market to the public.",
  "I think we are in a time where the tools have already caught up to the business ideas that we thought before were expensive and labor-consuming things to do. We normally spent a lot of money just to get to a working prototype before generative coding existed.",
  "With coding agents, we can ship web or SaaS products quickly, but the content and the service type will still rely on humans and real-world validation.",
];

export function ReflectionSlide() {
  return (
    <Slide
      id="reflection"
      eyebrow="Deliverable 7 · Reflection"
      title="Reflection"
      lead="Also in the repository: docs/07-reflection.md."
    >
      <div className="flex max-w-[72ch] flex-col gap-4 text-lg/8 text-pretty">
        {REFLECTION.map((paragraph) => (
          <p key={paragraph.slice(0, 24)}>{paragraph}</p>
        ))}
      </div>
    </Slide>
  );
}
