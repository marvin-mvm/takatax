# What is left: keys and one-time settings

The product is built end to end: database, row-level security, edge functions, the Trigger.dev
reader and the screens. What remains is **keys** and a few **one-time settings**. Until a key is
set, the screen that needs it says plainly that it is "not connected yet"; nothing crashes.
Search the code for `MISSING:` to find each spot.

Never paste a full key into a chat, an issue or a commit. Set keys only in the Supabase and
Trigger.dev dashboards, or in `.env.local` on your own computer (git ignores it; `.env` is
committed, so never put a secret there).

## 0. Supabase project `thiznrxojzrxkjwqhtjt` (done)

- [x] **Database**: both migrations in `supabase/migrations/` were applied on 2026-11-16, after a
      rolled-back dry run with every behaviour check passing on the live project. 15 tables,
      all with row-level security; Realtime on `messages`. Re-run the checks any time with
      `supabase/tests/run.sh` against a local Postgres.
      They were applied by hand, so Supabase's migration history is empty. If you start using
      `supabase db push`, first mark them as applied:
      `supabase migration repair --status applied 20261115120000 20261115140000`.
- [x] **Edge functions**: `create-upload-urls`, `confirm-upload`, `document-link`,
      `read-documents`, `assistant-chat`, `create-checkout` and `payments-webhook` are deployed
      (only `payments-webhook` skips the login check). Each answers "not configured" until its
      keys are set. Redeploy after changes with
      `supabase functions deploy --project-ref thiznrxojzrxkjwqhtjt --use-api`.

## 1. Cloudflare R2 (file storage)

- [ ] Create a **private** bucket, for example `takatax-documents`.
- [ ] The R2 API token behind your S3 credentials needs **Object Read & Write** on that bucket.
      (The `cfat_…` Cloudflare API token is not used by Takatax.)
- [ ] Add this CORS rule to the bucket (R2 → the bucket → Settings → CORS policy), so browsers
      can upload straight to it:

```json
[
  {
    "AllowedOrigins": ["https://<your-netlify-address>", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

## 2. Supabase Edge Function secrets

Supabase → Project settings → Edge Functions → Secrets:

| Secret                 | Value                                                                                                                | Turns on                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `R2_ACCOUNT_ID`        | `65e30ada3290b44e4e38e2e07ef915b2` (your Cloudflare account ID)                                                      | Upload links, upload checks, file previews |
| `R2_ACCESS_KEY_ID`     | The R2 S3 **Access Key ID**                                                                                          | Same                                       |
| `R2_SECRET_ACCESS_KEY` | The R2 S3 **Secret Access Key**                                                                                      | Same                                       |
| `R2_BUCKET`            | The bucket name, for example `takatax-documents`                                                                     | Same                                       |
| `OPENROUTER_API_KEY`   | Your `sk-or-v1-…` key                                                                                                | The records assistant chat                 |
| `TRIGGER_SECRET_KEY`   | Trigger.dev **secret key**: `tr_dev_…` while testing with `trigger.dev dev`, then `tr_prod_…` after the first deploy | Starting the reader                        |

## 3. Trigger.dev (the reader)

The project is `proj_afhlvwluvvvtblfsplyn` (already in `trigger.config.ts`). The SDK and CLI are
pinned to version 4.8.3; use that version in every command so they match.

Environment variables (Trigger.dev dashboard → Environment variables; set them for
**Development** and **Production**):

| Variable                                                                 | Value                                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                                                     | Your `sk-or-v1-…` key (or a second key, to see the reader's spend apart)                                                      |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | The same four as in Supabase (a separate read-only token is safer, if you make one)                                           |
| `SUPABASE_URL`                                                           | `https://thiznrxojzrxkjwqhtjt.supabase.co`                                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                                              | Supabase → Project settings → API keys → the **service role** (secret) key. It lets the job write results; keep it only here. |

On your own computer, in a checkout of branch `v0.002`:

1. `bun install`
2. `npx trigger.dev@4.8.3 login` (opens the browser)
3. `npx trigger.dev@4.8.3 dev`: the dashboard's Development environment should list the tasks
   `read-run` and `ping`. Run `ping` from the dashboard's Test page to check the connection.
   For `dev`, the job reads its variables from `.env.local` (or the dashboard).
4. `npx trigger.dev@4.8.3 deploy` to put the tasks in Production, then set Supabase's
   `TRIGGER_SECRET_KEY` to the production `tr_prod_…` key.

## 4. Payments (placeholder)

No payment provider is chosen yet; the plan is a **merchant of record** such as Dodo Payments.
Until then, free runs (the first 10 pages, and Premium pages) work, and paid runs say "payments
are not connected yet".

- [ ] Choose the provider, then implement the two functions in
      `supabase/functions/_lib/payments.ts` (`createCheckoutSession` and `readPaymentWebhook`)
      and set `PROVIDER` there. The rest (pricing, runs, Premium, the webhook's bookkeeping) is
      done.
- [ ] Set its keys as Supabase secrets (for example `PAYMENTS_API_KEY` and
      `PAYMENTS_WEBHOOK_SECRET`), and point its webhook at
      `https://thiznrxojzrxkjwqhtjt.supabase.co/functions/v1/payments-webhook`.
- [ ] Check the fees in the `/deck` what-if model (Payments): a merchant of record's fixed fee
      per payment weighs heavily on a ₱199 run.

## 5. Optional settings (sensible defaults already apply)

- `AI_DAILY_CAP_USD` (Supabase and Trigger.dev): the most the AI may spend in one Manila day
  (default 20).
- `READER_CONCURRENCY` (Trigger.dev): page groups read at the same time per document (default 4).
- `OPENROUTER_MODEL_FAST`, `OPENROUTER_MODEL_RECHECK`, `OPENROUTER_MODEL_SETTLE` (Trigger.dev)
  and `OPENROUTER_MODEL_ASSISTANT` (Supabase): override the models in
  `supabase/functions/_shared/parser/models.ts`.
- `SITE_URL` (Supabase): fallback address for the payment page's return links (the caller's
  address is used first).
- `ALLOW_UNPAID_RUNS=true` (Supabase): lets unpaid runs be read, for testing only. Do not set it
  in production.
- Email: Supabase's built-in mailer sends only about 2 emails an hour. Add an SMTP provider
  (Resend, Postmark, SendGrid…) in Supabase → Authentication → Emails → SMTP settings before real
  sign-ups.

## 6. One-time settings (no keys)

- [ ] **Supabase → Authentication → URL configuration**: set the Site URL to the live Netlify
      address (today it is `http://localhost:3000`, so confirmation emails link there) and add
      `https://<your-netlify-address>/**` to the redirect URLs.
- [ ] **Make yourself Takatax staff**, so the Staff tab appears and you can verify partners.
      After signing up, run in the Supabase SQL editor:
      `insert into public.admins (user_id) select id from auth.users where email = '<your email>';`
- [ ] **Verify partners** on the Staff tab: check each BIR accreditation or PRC licence number
      first. Only verified partners are listed, can answer in the community, and can be
      messaged or given access.
- [ ] After the first deploy, add the site to **Google Search Console** and submit
      `https://<your-netlify-address>/sitemap.xml`.
- [ ] Netlify: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only if Lovable's
      `.env` is not used in the build (both values are public).

## 7. Checks before launch (not code)

- [ ] Confirm the model slugs in `supabase/functions/_shared/parser/models.ts` on
      openrouter.ai/models, run a test batch of real receipts and PDFs, and tune
      `CONFIDENCE_THRESHOLD` in `supabase/functions/_shared/parser/checks.ts`.
- [ ] Confirm that OpenRouter returns `usage.cost` (US dollars) so the AI spend log and daily cap
      count real money.
- [ ] Pay for one run and one Premium month in the payment provider's test mode, then switch to
      live keys.
- [ ] Privacy notice and terms (Data Privacy Act), community rules and partner terms, reviewed
      by a Philippine lawyer.
- [ ] A CPA review of the tax rules in `supabase/functions/_shared/domain/` against real filed
      returns. The estimates are a guide, not the figures to file.
- [ ] The landing page outcomes marked "After launch" and "After year 1" (taxpayer profile,
      lender sharing, investor newsletter) are plans. Each needs its own design, consent flow
      and legal review before it is built.
