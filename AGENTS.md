<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.

<!-- LOVABLE:END -->

# Project rules (marvin-mvm)

These rules are the project owner's and take precedence over the Lovable block above
where they differ.

A new session starts with `docs/HANDOVER.md`: the owner's rules in one place, the live state
of Supabase and Trigger.dev, what has been built, and what to do next.

## Authorship

- Every commit is authored as `marvin-mvm <marvinmata19@gmail.com>`. Set
  `git config user.name "marvin-mvm"` and `git config user.email "marvinmata19@gmail.com"`
  in each checkout before committing.
- No AI attribution anywhere: no `Co-Authored-By` trailers, session links, "generated
  with" footers, or mentions of the AI assistant in commits, PR titles, PR descriptions,
  or comments. All credit goes to marvin-mvm.

## Workflow

1. All frontend and backend (Supabase) work happens on branch `v0.002`.
2. The AI developer opens the PR `v0.002` -> `main` with the title and description filled
   in; the owner reviews and merges it.
3. The owner deploys `main` to Netlify.
4. The owner back-fills Lovable with a PR `main` -> `v0.001`.

- Push to `v0.002` only when the owner asks for it. Never push to `main` or `v0.001`.
- Lovable is a backup editor and is used rarely; the owner will say when it was used.
- Every commit pushed to `v0.002` ends its message with `[skip netlify]` so Netlify does
  not build each push; only merges to `main` deploy. Do not use `[skip ci]`: it also skips
  the GitHub Actions checks.
- Merge PRs with "Create a merge commit" (not squash): a squash commit copies the
  `[skip netlify]` lines into `main` and the production deploy would be skipped.

## Supabase

- Project ref: `thiznrxojzrxkjwqhtjt`. The AI developer reads and edits the database
  (schema, migrations, data) directly; Lovable is not the source of truth for it.
- Never commit secret keys (service role key, access tokens). The anon/publishable key
  is public and may be committed.

## Architecture

- AI: document reading runs in the Trigger.dev job `read-run` (`trigger/`), which sends every
  page to the model through OpenRouter (PDFs natively, no OCR), a few pages per call, so long
  runs never hit Supabase's edge function limits. Supabase Edge Functions only start it
  (`read-documents`) and answer the short records-assistant chat. Keys live in Trigger.dev's
  environment variables and Supabase Edge Function secrets, never in the repo or the browser.
  This replaces the Lovable AI gateway rule above.
- Reader switch: the Supabase secret `READER` picks the reader. `READER=trigger` (default) starts
  the Trigger.dev job; `READER=supabase` uses the `read-step` edge function, which reads a few page
  groups per call and starts itself again for the rest (used while Trigger.dev deployments are
  unavailable). Both use the shared plan in `supabase/functions/_shared/parser/plan.ts`.
- A document is read once. `read-documents` starts only documents waiting to be read (their
  reading failed or never started) or whose reading stalled, claiming them in one update so a
  double click starts nothing twice; finished documents answer 409 `already_read`. Both readers
  save pages done per document in `documents.extracted.reading.pagesDone` while reading, which
  feeds the progress bars (`src/components/app/ReadingProgress.tsx`, pacing in
  `src/lib/reading-progress.ts`).
- Pricing is per page (a photo is one page, a PDF every page): `quoteRun` in
  `supabase/functions/_shared/uploads/rules.ts`, shared by the upload screen and
  `create-checkout`.
- File storage: Cloudflare R2 (private buckets, signed upload links), not Supabase Storage.
  R2 keys live in Supabase Edge Function secrets.
- Payments: Xendit, switched off for launch by `PAYMENTS_LIVE` in
  `supabase/functions/_shared/uploads/rules.ts` (Standard runs up to 80 pages are free; extra
  pages and Premium are "coming soon" on the screens and in `create-checkout`). The provider code
  is in `supabase/functions/_lib/payments.ts`; `payments-webhook` (JWT check off in
  `supabase/config.toml`; it checks Xendit's callback token) marks runs and Premium months paid.
  Takatax never handles payments between taxpayers and their bookkeepers.
- Chat between taxpayers and partners: `conversations` and `messages`. Messages are a permanent
  record: clients have no update or delete rights and a trigger refuses any change.
- Access: only a taxpayer invites a verified professional (`invite_partner()`, no firms or
  groups); the professional answers with `respond_to_invite()`. The taxpayer can
  `cancel_partner_invite()` and `revoke_partner_access()`; the professional can `leave_client()`.
  `partner_access.status` is pending, active, declined, cancelled, revoked or left, and every
  policy checks access through `has_account_access()` (active only). Professionals see the
  client's documents, ledger, tracker and COR; never the payments, access page or the billing
  columns of `accounts` (the owner reads those through `my_plan()`, so select account columns by
  name, never `*`).
- Tiers: a professional working on a client's account gets that client's tier. On a Standard
  account they get the Standard features; on a Premium account, the client's Premium features.
  `account_tier()` tells them which (Standard or Premium) and nothing else about the billing. A
  professional's own runs stay Standard with the partner discount. Premium is not on sale yet
  (`PAYMENTS_LIVE`), but its features are built behind that switch.
- Activity log: `access_events` is owner-only and cannot be edited. Triggers log invitation
  steps and what a professional changes (records, uploads, runs, COR); `log_access_event()`
  logs what they open (the app, `document-link` and `assistant-chat` call it).
- Deleting documents: on a Standard account, deleting a file also deletes the records read from
  it. On a Premium account the file goes but its records stay until they are deleted as a
  second step. The account's tier decides, for its owner and for a professional alike. The
  `delete-document` function removes the file from R2 and then calls `delete_document()`; a
  professional's deletion is in the activity log. The screens' rules and wording are in
  `src/lib/documents/delete.ts`.
- Checking a document: when the reader is not sure of a document it is "needs_review". Its page
  shows the "Check what was read" form (`src/components/app/ReadingReview.tsx`): what the AI
  read, box by box, with the unsure ones pointed out, to correct and save. The rules are in
  `supabase/functions/_shared/parser/review.ts`; the database function `review_document()` saves
  the corrected reading and its ledger rows together and marks the document read ("rejected",
  shown as "Not counted", when nothing in the file is a tax document). The form is also behind
  "Correct what was read" on a document that is already read. Amounts typed in the form are
  pesos; a foreign amount is never offered as pesos. A professional's check goes in the
  activity log (`checked_document`). A file in which the reader finds no document at all is
  also "needs_review" (`combineReadings`), so it gets the empty form and is never shown as read.
- Usage meters: "AI doc parsing" and "Doc storage" as used / limit (`UsageMeters`, on the
  Documents tab and the account settings page). The limits come from `PRICING` through
  `supabase/functions/_shared/uploads/usage.ts`; `loadUsage()` counts and
  `src/lib/account/usage.ts` words them. Standard counts the latest run's pages out of 80 (every
  upload starts a new run); Premium counts the Premium month's pages out of 300. Storage is the
  size of the files still stored, out of 300 MB (Standard) or 15 GB (Premium). The storage limit
  is shown, not enforced: uploads are not refused when it is passed.
- Account settings: `/app/settings`, opened from "Hi [first name]" in the header (which replaced
  the Log out button): the user's details and Log out, the current tier
  (`src/lib/account/tier.ts`), the usage meters, Premium and the transaction history.
  `/app/plan` only redirects there, because the payment provider's return links use it. The
  header scrolls away with the page on a phone and stays in view from 768px up.
- Pop-ups: ask "are you sure?" with `useConfirm()` (`src/components/app/confirm.tsx`), the themed
  pop-up with a short list of what will happen, never `window.confirm`. Keep the wording to a
  few short lines. Short hover help is `Hint` (`src/components/app/Hint.tsx`).
- Records assistant: `assistant-chat` reads the period on screen (its real first and last day,
  `supabase/functions/_shared/assistant/period.ts`) and asks a small model:
  `DEFAULT_ASSISTANT_MODEL` in `supabase/functions/_shared/parser/models.ts`, unless the
  `OPENROUTER_MODEL_ASSISTANT` secret names another.
- Database changes go in a new file in `supabase/migrations/`; check them with
  `supabase/tests/run.sh` (local Postgres) before applying them to the project.

## Pull requests

- Title: short and descriptive of the change.
- Description: a summary of changes as a list of items done.
- CI (`.github/workflows/ci.yml`) runs lint, type-check, test, and build on every PR;
  keep it green.

## Code layout

- Shared, unit-tested logic (tax rules, deadlines, the document reader, redaction, upload
  pricing) lives in `supabase/functions/_shared/`. The web app imports it as `@shared/...`;
  edge functions import it with relative `.ts` paths. No Node, Deno or browser APIs there.
- Edge functions (Deno) are in `supabase/functions/<name>/index.ts`, with Deno-only helpers in
  `supabase/functions/_lib/`.
- What still needs keys or setup is listed in `docs/MISSING_PIECES.md`; code marks each spot
  with `MISSING:`.

## Reference

- `marvin-mvm/Takatax2` is the reference project (specs in its `docs/`); port its
  features into this TanStack Start app.
