/** Phase 4 (deploy) and Phase 5 (document and reflect) of the build brief. */

import { Block, Point, Points, Slide } from "./primitives";
import { Checklist } from "./slides-spec";

const PHASE_4 = "Phase 4 · Deploy";
const PHASE_5 = "Phase 5 · Document and reflect";

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
      eyebrow={PHASE_5}
      title="Documented, demoed, and the next version planned."
      lead="Everything a reviewer needs is in the repository, linked from the README."
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Block title="Phase 5 tasks">
          <Checklist
            items={[
              {
                task: "README",
                status: "Done",
                note: "The problem, the AI feature, the stack, how to run it, secrets, CI/CD and monitoring.",
              },
              {
                task: "2-minute demo",
                status: "Done",
                note: "Upload, AI reading with live progress, Please check, and the tax figures, on the live site.",
              },
              {
                task: "1-page reflection",
                status: "Done",
                note: "docs/REFLECTION.md: what worked, what was hard, what I would change.",
              },
              {
                task: "A GitHub issue for v2",
                status: "Done",
                note: "Issue #44: VAT returns (2550Q) for businesses that pass ₱3M in sales.",
              },
            ]}
          />
        </Block>
        <Block title="Before submission">
          <Points>
            <Point title="The live URL works in a private window.">takatax.netlify.app</Point>
            <Point title="The repository is public.">github.com/marvin-mvm/takatax</Point>
            <Point title="No secrets exposed.">
              Every commit scanned for keys before going public; none found.
            </Point>
            <Point title="Spec and rules in the repo.">
              spec.md, AGENTS.md, CLAUDE.md and .cursorrules.
            </Point>
            <Point title="Demo and reflection linked.">From the README and the submission.</Point>
          </Points>
        </Block>
      </div>
    </Slide>
  );
}
