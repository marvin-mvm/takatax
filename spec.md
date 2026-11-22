# Takatax spec (v1.1)

Version 1.1, revised after review (changes listed at the end). The one-page PRD, the
validation and the sources are in the deck at `/deck`; this file is the build spec.

## 1. Product

Takatax turns photos and PDFs of a taxpayer's documents into the figures for their BIR returns,
line by line. AI reads; a rules engine computes; the user (or their bookkeeper) checks and files.

**Primary user:** a sole proprietor running a micro business in the Philippines (a store, a
clinic, a service shop) who files monthly and quarterly returns from a pile of receipts.
**Also:** freelancers and other small businesses. **Partners:** bookkeepers, CPAs and tax
lawyers, invited by the taxpayer, at 25% off.

**Out of scope:** filing with the BIR; tax advice; real payment processing in this build
(payments are built behind a switch that is off); holding money between taxpayers and
bookkeepers; selling personal data. Later: VAT returns (issue #44), native apps, bank statement
import.

## 2. Core flows and acceptance criteria

### Account and COR

- Sign up as a taxpayer or a professional (Supabase Auth; Zod-validated forms).
- Upload the COR; the AI reads names, address, lines of business and every tax type with its
  form. The owner confirms or edits before anything changes.
- **Accept when:** confirming the COR sets the account's tax types and deadlines; nothing is
  saved from the COR without the owner's confirmation.

### Upload and AI reading (the core AI feature)

- Photos and PDFs, up to 200 MB a file and 5 GB a batch. Photos are checked in the browser for
  blur, darkness and glare. PDF pages are counted before upload; a photo is one page.
- The summary states files and pages ("You uploaded 10 JPG and 2 PDF files with 50 total
  combined pages.") and the price before anything is uploaded. "Proceed" on a file saves that
  file; "Proceed All" saves every file and reads everything saved and not yet read.
- Pages are counted per account: a run adds pages (80, or 10 for the free trial) and each page
  read uses one. At launch an account's first 80 pages are free; more are "coming soon".
- Reader: fast model with per-field confidence → arithmetic checks → second model for doubtful
  documents → top model when they disagree → "Please check" for what is still unsure.
- A document is read once; "Read again" exists only when reading failed or never started.
- **Accept when:** every read document has ledger rows linked to it; unsure fields are flagged,
  never silently accepted; a double click never starts two readings; progress is shown per
  document; AI cost per page stays under the target and a daily cap stops spending.

### Tax figures and tracker

- Tax engine in plain TypeScript: 1701Q (cumulative from January 1), 2551Q (not for 8%
  filers), SAWT, with a reason for every excluded document; deadlines per tax type.
- **Accept when:** the engine's unit tests pass for each rule in section 5.

### Professionals and privacy

- Only the taxpayer invites; the professional accepts or declines; the taxpayer can cancel or
  remove access at any time. Professionals see documents, records, tracker and COR, never the
  plan, payments or access settings. An owner-only, unchangeable activity log lists what they
  open and change.
- Chat messages cannot be edited or deleted. Community posts hide the author; TINs, phone
  numbers, emails and amounts are blurred before posting.
- **Accept when:** the SQL behaviour checks in `supabase/tests/` pass (row-level security,
  invitations, activity log, chat, community).

## 3. Architecture

| Part                                                       | Role                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Browser: TanStack Start on Netlify                         | Screens, upload, page counting, photo checks, progress                                                                 |
| Supabase Edge Functions                                    | Signed upload links, upload confirmation, pricing and checkout, starting the reader, file links, the records assistant |
| Reader: `read-step` (Supabase) or `read-run` (Trigger.dev) | Reads each photo and each PDF a few pages at a time, with retries and progress; chosen by the `READER` secret          |
| OpenRouter                                                 | One API for the models: Gemini Flash, Claude Haiku, Gemini Pro                                                         |
| Supabase Postgres and Auth                                 | Data, login, row-level security on every table, the paywall and access rules in the database                           |
| Cloudflare R2                                              | Private file storage; the browser uploads with short-lived signed links                                                |
| Tax engine (`supabase/functions/_shared/domain/`)          | Plain, unit-tested TypeScript shared by the app and the functions                                                      |

Security: no secret in the repo or the browser; each key lives where it is used (Supabase
secrets, Trigger.dev variables). Every edge function checks who is calling and validates input.

## 4. Data model (main tables)

`profiles`, `accounts` (one per TIN, COR fields), `documents`, `ledger_records`, `runs`,
`payments`, `partner_profiles`, `partner_access` (invitations), `access_events` (activity log),
`conversations`, `messages`, `community_posts`, `community_answers`, `partner_reviews`,
`admins`, `ai_spend`. Schema and policies: `supabase/migrations/`.

## 5. Tax rules (after review)

- Receipts count only for itemized deductions; the OSD is a flat 40%.
- 8% filers do not file the 2551Q; the 8% replaces percentage tax.
- The 1701Q is cumulative from January 1; the fourth quarter goes in the annual return.
- Since 2024 the invoice is the primary document (RA 11976).
- The COR often does not show the 8% choice; the user confirms the income tax option each year.

## 6. Non-functional

- Mobile first: every screen works at 320–360 px wide.
- AI cost target: ₱0.32 or less per page blended; a daily spending cap.
- Tests: unit tests (Vitest) for the engine, reader checks, pricing and the deck model; SQL
  behaviour checks; CI on every pull request.

## 7. Revision history

- **v1.0**: first draft.
- **v1.1** (after review): fixed the five tax rules in section 5 (the first draft let meals
  count under OSD, made everyone file the 2551Q, computed each quarter alone, treated the
  official receipt as the primary document, and took the tax option from the COR). Added
  read-once and the daily AI cap after reviewing cost risks.
