# Takatax

**AI for your BIR figures and tax monitoring.**

Takatax turns photos and PDFs of a Filipino small business's receipts, sales invoices, Forms
2307 and Certificate of Registration (COR) into the figures for its BIR returns, line by line.
An AI reader extracts each document; a tested TypeScript tax engine does the math, so every
number can be reproduced and explained. Verified bookkeepers, CPAs and tax lawyers can be
invited into an account, and a community answers tax questions.

- **Submission index (every deliverable, with links):** [`docs/SUBMISSION.md`](docs/SUBMISSION.md)
- **Live app:** https://takatax.netlify.app
- **Pitch deck** (validation, PRD, what-if model, architecture, build): https://takatax.netlify.app/deck
- **Validation report:** [`docs/01-idea-validation-report.md`](docs/01-idea-validation-report.md) ·
  **PRD:** [`docs/02-PRD.md`](docs/02-PRD.md) · **Spec:** [`spec.md`](spec.md) ·
  **Architecture:** [`docs/03-architecture-notes.md`](docs/03-architecture-notes.md) ·
  **Reflection:** [`docs/07-reflection.md`](docs/07-reflection.md) ·
  **v2 idea:** [issue #44](https://github.com/marvin-mvm/takatax/issues/44)

## The problem and the user

Self-employed Filipinos spend about 171 hours a year on tax compliance (World Bank) and many
get it wrong or never register. Existing tools (Taxumo, JuanTax) are subscriptions that still
make you type every transaction. Takatax's user is the **sole proprietor running a micro
business** (1.13 million in the Philippines, DTI), with freelancers and small businesses next,
and tax professionals as partners at 25% off. Full validation, with sources, is in the deck.

## The AI capability

1. **Document reader.** Each page goes to a fast model first (Gemini Flash through OpenRouter),
   which returns structured JSON with a confidence for every field. Arithmetic checks follow
   (VAT is 12/112 of the total, totals add up, TINs are well formed). Doubtful documents are
   re-read by a second model from another company (Claude Haiku), and a top model (Gemini Pro)
   settles disagreements. Only what is still unsure goes to the user, as "Please check".
   PDFs are read natively, a few pages per call; no OCR.
2. **COR reader.** Reads the registration: names, address, lines of business, and every tax
   type with its BIR form, for the owner to confirm.
3. **Records assistant.** Answers questions about the user's own figures; the numbers come from
   the database, the model only explains them.

A daily AI spending cap and a per-call cost log protect against runaway costs.

## Features

Sign-up as a taxpayer or a professional · upload with page counting and blurry-photo checks ·
live progress bars while reading · documents with what was read · My COR · tax tracker with
deadlines and return figures (1701Q, 2551Q, SAWT) · invitations for bookkeepers with an
activity log of what they open and change · chat · community with personal details blurred ·
bookkeeper directory with reviews · staff page to verify professionals.

Payments are built (Xendit) but switched off: during launch an account's first 80 pages of AI
reading are free, and more pages and Premium say "coming soon", so no real money is processed.

## Stack (and how it maps to the recommended one)

| Layer           | Recommended                      | Takatax                                                                           |
| --------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| Frontend        | Next.js 14 + Tailwind            | TanStack Start (React 19, Vite) + Tailwind CSS 4, shadcn/ui                       |
| AI / LLM        | Vercel AI SDK + Claude or OpenAI | OpenRouter API: Gemini Flash and Pro, Claude Haiku (server-side only)             |
| Background jobs |                                  | Supabase Edge Function `read-step` (Trigger.dev `read-run` ready behind a switch) |
| Database        | Supabase                         | Supabase Postgres with row-level security on every table                          |
| Auth            | Clerk or Supabase Auth           | Supabase Auth                                                                     |
| Files           |                                  | Cloudflare R2, private, signed upload links                                       |
| Deploy          | Vercel + GitHub Actions          | Netlify + GitHub Actions                                                          |
| AI coding tool  | Cursor (`.cursorrules`)          | Claude Code (`CLAUDE.md` → `AGENTS.md`); `.cursorrules` included                  |
| Tests           |                                  | Vitest (unit), SQL behaviour checks, Playwright checks                            |

## Run it locally

Needs [Bun](https://bun.sh) 1.4+.

```bash
bun install
bun run dev        # http://localhost:3000
bun run test       # unit tests (Vitest)
bun run lint
bunx tsc --noEmit
bun run build
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (public values) from
`.env`. Without a database it shows built-in sample data, so every screen can be explored.
Database behaviour checks: `supabase/tests/run.sh` against a local Postgres 16.

## Environment variables and secrets

No secret is in the repo or the browser. The browser only gets the Supabase URL and publishable
key. Secrets live where they are used:

- **Supabase Edge Function secrets:** `OPENROUTER_API_KEY`, `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `READER`, `TRIGGER_SECRET_KEY`;
  optional `AI_DAILY_CAP_USD` and model overrides.
- **Trigger.dev environment variables:** the OpenRouter, R2 and Supabase service keys.
- **Netlify:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

The full list, with where each value comes from, is in
[`docs/MISSING_PIECES.md`](docs/MISSING_PIECES.md).

## CI/CD

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml): lint, type-check, unit tests and a
  production build on every pull request and every push to `v0.002` and `main`.
- [`.github/workflows/trigger-deploy.yml`](.github/workflows/trigger-deploy.yml): deploys the
  background reader to Trigger.dev on merges to `main` (trusted publishing, no stored key).
- Netlify builds and deploys `main`. Work happens on `v0.002` and reaches `main` through pull
  requests with merge commits.

## Monitoring

- **AI usage:** every model call is logged with its cost (`ai_spend` table), and the reader stops
  when the day's spend reaches `AI_DAILY_CAP_USD`.
- **Backend:** Supabase edge function logs and metrics; a professional's actions in an account
  are written to the owner's activity log.
- **Deploys and checks:** Netlify deploy logs and GitHub Actions status on every change.

## Project structure

```
src/routes/            pages (file routes): landing, pricing, deck, app/*, community, bookkeepers
src/components/        app screens, site pieces, deck slides
src/lib/               data layer (Supabase), services, pacing, money and time helpers
supabase/functions/    edge functions; _shared/ holds the tax engine, reader rules and pricing
supabase/migrations/   database schema, row-level security and functions, in order
supabase/tests/        SQL behaviour checks
trigger/               the Trigger.dev reader job
docs/                  setup checklist, handover, reflection
```

## Project documents

- [`spec.md`](spec.md): product spec, architecture and acceptance criteria (v1.1)
- [`AGENTS.md`](AGENTS.md): rules for AI coding tools and the architecture notes
- [`docs/MISSING_PIECES.md`](docs/MISSING_PIECES.md): keys and one-time settings
- [`docs/07-reflection.md`](docs/07-reflection.md): one-page reflection
- The deck at [`/deck`](https://takatax.netlify.app/deck): the seven validation steps, PRD,
  revenue model, architecture, spec review and build plan, with sources

## Limits

Takatax computes; it does not file with the BIR and is not tax advice. The figures should be
checked by the taxpayer or a bookkeeper before filing.

Author: [marvin-mvm](https://github.com/marvin-mvm).
