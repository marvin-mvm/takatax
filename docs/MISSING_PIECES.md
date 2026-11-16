# What is left: keys and one-time settings

The product is built end to end: database, row-level security, edge functions, the Trigger.dev
reader and the screens. What remains is **keys** and a few **one-time settings**. Until a key is
set, the screen that needs it says plainly that it is "not connected yet"; nothing crashes.
Search the code for `MISSING:` to find each spot.

Never paste a full key into a chat, an issue or a commit. Set keys only in the Supabase and
Trigger.dev dashboards, or in `.env.local` on your own computer (git ignores it; `.env` is
committed, so never put a secret there).

## 0. Supabase project `thiznrxojzrxkjwqhtjt`

- [x] **Database**: the first three migrations in `supabase/migrations/` were applied on 2026-11-16,
      each after a rolled-back dry run with every behaviour check passing on the live project
      (the invitations and activity log migration, `20261116120000`, after its own dry run with
      `supabase/tests/20_behaviour_api.sql` and `30_invitations.sql`). 16 tables, all with
      row-level security; Realtime on `messages`. Re-run the checks any time with
      `supabase/tests/run.sh` against a local Postgres.
      They were applied by hand, so Supabase's migration history is empty. If you start using
      `supabase db push`, first mark them as applied:
      `supabase migration repair --status applied 20261115120000 20261115140000 20261116120000 20261116150000`.
- [x] **COR tax types** (`20261116150000_cor_tax_types.sql`): keeps the tax types and forms
      printed on the COR (0619-E, 1601-EQ, 2551Q…) on the account. Applied on 2026-11-16 after its
      rolled-back dry run with `supabase/tests/40_cor_tax_types.sql`; it is in the repair line
      above. For the next migration, the dry run can use all of `20_behaviour_api.sql`,
      `30_invitations.sql` and `40_cor_tax_types.sql`: they look only at their own test users, so
      they are safe on a project with real users.
- [x] **Edge functions**: `create-upload-urls`, `confirm-upload`, `document-link`,
      `read-documents`, `read-step`, `assistant-chat`, `create-checkout` and `payments-webhook` are
      deployed (`payments-webhook` and `read-step` skip the login check; `read-step` accepts only
      the service role key). Each answers "not configured" until its
      keys are set. All eight matched `main` file by file on 2026-11-16. Redeploy after changes
      with `supabase functions deploy --project-ref thiznrxojzrxkjwqhtjt --use-api`.

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
| `READER`               | `supabase` or `trigger` (see "Which reader" below)                                                                   | Which reader reads documents               |

### Which reader: `READER=supabase` or `READER=trigger`

The `READER` secret picks who reads documents. Change it in Supabase → Edge Functions → Secrets;
it applies to the next run, with no redeploy.

- `READER=supabase` (now, while Trigger.dev deployments are not available): the `read-step`
  edge function reads inside Supabase, a few groups of pages per step, each step starting the
  next, so no step comes near the edge function limits. It uses the Supabase secrets above
  (`OPENROUTER_API_KEY`, the four `R2_…`). PDFs over 25 MB (`READER_MAX_MB`) are too big to load
  there: they stay "Waiting to be read" until Trigger.dev reads them.
- `READER=trigger` (the default when `READER` is not set): the Trigger.dev job `read-run`, once
  it is deployed (section 3). Starting a run again with this setting also reads anything the
  Supabase reader left waiting.

Both readers read the same way: the same page groups (`_shared/parser/plan.ts`), prompts, models
and checks.

## 3. Trigger.dev (the reader)

The project is `proj_afhlvwluvvvtblfsplyn` (already in `trigger.config.ts`). The SDK and CLI are
pinned to version 4.8.5; use that version in every command so they match.

Environment variables (Trigger.dev dashboard → Environment variables; set them for
**Development** and **Production**):

| Variable                                                                 | Value                                                                                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                                                     | Your `sk-or-v1-…` key (or a second key, to see the reader's spend apart)                                                      |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | The same four as in Supabase (a separate read-only token is safer, if you make one)                                           |
| `SUPABASE_URL`                                                           | `https://thiznrxojzrxkjwqhtjt.supabase.co`                                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                                              | Supabase → Project settings → API keys → the **service role** (secret) key. It lets the job write results; keep it only here. |

Deploying the tasks to Production (no computer needed): GitHub Actions does it
(`.github/workflows/trigger-deploy.yml`) on every push to `main`, and on demand from the Actions
tab ("Deploy Trigger.dev tasks" → Run workflow). It uses Trigger.dev **trusted publishing**
(GitHub OIDC), so no key is stored in GitHub. The CLI version is read from `package.json`, so it
always matches the SDK (4.8.4 or later is needed for trusted publishing).

1. Trigger.dev dashboard → switch to **Production** → GitHub → Trusted publishing: add the
   `marvin-mvm/takatax` repository (done).
2. Do not set a `TRIGGER_ACCESS_TOKEN` repository secret: the workflow does not read one, and
   the CLI would use a key instead of trusted publishing if one were set. (One added on
   2026-11-16 was deleted the same day.)
3. Merge to `main` (or run the workflow from the Actions tab once it is on `main`). The dashboard's
   Production environment then lists `read-run` and `ping`; run `ping` from its Test page.
4. Set Supabase's `TRIGGER_SECRET_KEY` to the regular Production secret key (`tr_prod_…`). A
   "Deploy only" key cannot start reading jobs.

If the deploy stops with **"Deployments are not available for this organization"**, deploys are
switched off for the Trigger.dev organization itself. That is a setting on Trigger.dev's side:
no key, workflow or CLI version changes it. Ask Trigger.dev support (the chat in the dashboard,
or Discord) to enable deployments for the organization that owns `proj_afhlvwluvvvtblfsplyn`,
then re-run the workflow.

To test on a computer instead (needs a recent macOS for Bun): `bun install`,
`npx trigger.dev@4.8.5 login`, then `npx trigger.dev@4.8.5 dev` (Development environment, using
the `tr_dev_…` key).

## 4. Payments: Xendit, "coming soon"

Payments are switched off for launch with one constant, `PAYMENTS_LIVE = false` in
`supabase/functions/_shared/uploads/rules.ts`. While it is off:

- every **Standard run of up to 250 pages is free**, for taxpayers and partners, as often as
  they like;
- **pages over 250 (₱2 each)** and **Premium (₱800 a month)** show "coming soon" and cannot be
  bought, on the screens and on the server (`create-checkout` answers `coming_soon`).

To switch payments on (Xendit: GCash, Maya, cards):

- [ ] Xendit dashboard → Settings → API keys: a secret key with Money-in write access. Supabase
      secret `XENDIT_SECRET_KEY`.
- [ ] Xendit dashboard → Settings → Webhooks: set the Invoices "paid" webhook to
      `https://thiznrxojzrxkjwqhtjt.supabase.co/functions/v1/payments-webhook` and copy the
      verification token. Supabase secret `XENDIT_CALLBACK_TOKEN`.
- [ ] Test one paid run and one Premium month in Xendit's test mode. The provider code is ready in
      `supabase/functions/_lib/payments.ts`; confirm its request and webhook fields against
      Xendit's current docs.
- [ ] Set `PAYMENTS_LIVE = true`, then redeploy the site (merge to `main`) and the edge functions.
      The full pricing (free trial, ₱199 runs, 25% partner price, ₱2 extra pages, Premium) then
      applies.

## 5. Optional settings (sensible defaults already apply)

- `AI_DAILY_CAP_USD` (Supabase and Trigger.dev): the most the AI may spend in one Manila day
  (default 20).
- `READER_CONCURRENCY` (Trigger.dev): page groups read at the same time per document (default 4).
- `READER_GROUPS_PER_STEP` (Supabase, `READER=supabase`): page groups read in each step
  (default 3, up to 5 pages each). `READER_MAX_MB` (Supabase): the largest PDF the Supabase reader
  loads (default 25).
- `OPENROUTER_MODEL_FAST`, `OPENROUTER_MODEL_RECHECK`, `OPENROUTER_MODEL_SETTLE` (Trigger.dev,
  and Supabase for `READER=supabase`) and `OPENROUTER_MODEL_ASSISTANT` (Supabase): override the models in
  `supabase/functions/_shared/parser/models.ts`.
- `SITE_URL` (Supabase): fallback address for the payment page's return links (the caller's
  address is used first).
- `ALLOW_UNPAID_RUNS=true` (Supabase): lets unpaid runs be read, for testing only. Do not set it
  in production.
- Email: Supabase's built-in mailer sends only about 2 emails an hour. Add an SMTP provider
  (Resend, Postmark, SendGrid…) in Supabase → Authentication → Emails → SMTP settings before real
  sign-ups.

## 6. One-time settings (no keys)

- [x] **Supabase → Authentication → URL configuration**: the Site URL is
      `https://takatax.netlify.app` and `https://takatax.netlify.app/**` is in the redirect URLs
      (checked on 2026-11-16), so password-reset and other emails link to the live site.
- [ ] **Email confirmation is off** (turned off on 2026-11-16, so sign-ups need no email). Anyone
      can then sign up with an address they do not own. Turn "Confirm email" back on in Supabase →
      Authentication → Sign In / Providers → Email once an SMTP provider is set up (section 5).
      Partner access is unaffected: professionals still need staff verification.
- [ ] **Make yourself Takatax staff**, so the Staff tab appears and you can verify partners
      (not done yet on 2026-11-16: `public.admins` is empty). After signing up, run in the
      Supabase SQL editor:
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
      `CONFIDENCE_THRESHOLD` in `supabase/functions/_shared/parser/checks.ts`. On 2026-11-16 the
      model names were confirmed on OpenRouter and the defaults in `models.ts` corrected to match
      the Supabase secrets; the test batch and the threshold are still to do.
- [ ] Confirm that OpenRouter returns `usage.cost` (US dollars) so the AI spend log and daily cap
      count real money.
- [ ] Pay for one run and one Premium month in the payment provider's test mode, then switch to
      live keys.
- [ ] Database hardening from Supabase's advisors (Database → Advisors): limit which functions
      a visitor without a login may call, pin `search_path` on four functions, speed up the
      row-level security policies and index the foreign keys, and turn on leaked-password
      protection in Authentication. The list is in `docs/HANDOVER.md`, section 5.
- [ ] Privacy notice and terms (Data Privacy Act), community rules and partner terms, reviewed
      by a Philippine lawyer.
- [ ] A CPA review of the tax rules in `supabase/functions/_shared/domain/` against real filed
      returns. The estimates are a guide, not the figures to file.
- [ ] The landing page outcomes marked "After launch" and "After year 1" (taxpayer profile,
      lender sharing, investor newsletter) are plans. Each needs its own design, consent flow
      and legal review before it is built.
