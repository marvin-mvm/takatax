# What is left: keys and one-time settings

The product is built end to end: database, row-level security, edge functions and screens.
What remains is **keys** (secrets only the owner can create) and a few **one-time settings**.
Until a key is set, the screen that needs it says plainly that it is "not connected yet"; nothing
crashes. Search the code for `MISSING:` to find each spot.

Status of the Supabase project `thiznrxojzrxkjwqhtjt`:

- [ ] Database: apply both migrations in `supabase/migrations/` (tables, row-level security,
      chat, access, payments, AI spend log), after a dry run that is rolled back:
      `begin;` + both migrations + `supabase/tests/20_behaviour_api.sql` + `rollback;`.
      Re-run the behaviour checks any time with `supabase/tests/run.sh` against a local Postgres.
- [ ] Edge functions: deploy `create-upload-urls`, `confirm-upload`, `document-link`,
      `read-documents`, `assistant-chat`, `create-checkout` and `paymongo-webhook`
      (`supabase functions deploy --project-ref thiznrxojzrxkjwqhtjt --use-api`). Supabase gives
      them `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` automatically.

## 1. Keys

Set these in **Supabase → Project settings → Edge Functions → Secrets** (never in the repo or
in Netlify).

| Secret | Turns on | Where to get it |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Uploads, previews, reading | Cloudflare dashboard, R2 overview (Account ID) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Same | R2 → Manage API tokens → token with **Object Read & Write** on the bucket |
| `R2_BUCKET` | Same | The bucket name, for example `takatax-documents` (private) |
| `OPENROUTER_API_KEY` | The AI reader and the records assistant | openrouter.ai → Keys |
| `PAYMONGO_SECRET_KEY` | Paid runs and Premium | PayMongo dashboard → Developers → API keys (`sk_test_…` first, then `sk_live_…`) |
| `PAYMONGO_WEBHOOK_SECRET` | Marking payments paid | PayMongo → Developers → Webhooks: create one for `checkout_session.payment.paid` pointing to `https://thiznrxojzrxkjwqhtjt.supabase.co/functions/v1/paymongo-webhook`, then copy its `whsk_…` secret |

The R2 bucket also needs a CORS rule so browsers can upload straight to it (Cloudflare → R2 →
the bucket → Settings → CORS policy):

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

Email: Supabase's built-in mailer sends only about 2 emails an hour. Add an SMTP provider
(Resend, Postmark, SendGrid…) in **Supabase → Authentication → Emails → SMTP settings** before
real sign-ups.

Optional secrets (sensible defaults already apply):

- `AI_DAILY_CAP_USD`: the most the AI may spend in one Manila day (default 20).
- `OPENROUTER_MODEL_FAST`, `OPENROUTER_MODEL_RECHECK`, `OPENROUTER_MODEL_SETTLE`,
  `OPENROUTER_MODEL_ASSISTANT`: override the models in
  `supabase/functions/_shared/parser/models.ts`.
- `PAYMONGO_METHODS`: payment methods offered at checkout (default `gcash,paymaya,card,qrph`).
- `SITE_URL`: fallback address for PayMongo's return links (the caller's address is used first).
- `ALLOW_UNPAID_RUNS=true`: lets unpaid runs be read, for testing only. Do not set it in production.

## 2. One-time settings (no keys)

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

## 3. Checks before launch (not code)

- [ ] Confirm the model slugs in `supabase/functions/_shared/parser/models.ts` on
      openrouter.ai/models, run a test batch of real receipts, and tune `CONFIDENCE_THRESHOLD`
      in `supabase/functions/_shared/parser/checks.ts`.
- [ ] Confirm that OpenRouter returns `usage.cost` (US dollars) so the AI spend log and daily cap
      count real money.
- [ ] Pay for one run and one Premium month in PayMongo **test mode**, then switch to live keys.
- [ ] Privacy notice and terms (Data Privacy Act), community rules and partner terms, reviewed
      by a Philippine lawyer.
- [ ] A CPA review of the tax rules in `supabase/functions/_shared/domain/` against real filed
      returns. The estimates are a guide, not the figures to file.
- [ ] The landing page outcomes marked "After launch" and "After year 1" (taxpayer profile,
      lender sharing, investor newsletter) are plans. Each needs its own design, consent flow
      and legal review before it is built.
