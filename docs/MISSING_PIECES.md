# Missing pieces

Everything below is built in code but waits for a key, a connection or a decision. Until each is
done, the app shows a clear "not connected yet" message or labelled sample data instead of
failing. Search the code for `MISSING:` to find every spot.

## 1. Database (Supabase project `thiznrxojzrxkjwqhtjt`)

- [ ] **Apply the migration** `supabase/migrations/20261115120000_takatax_core.sql`
      (SQL editor, `supabase db push`, or the Management API). It creates accounts, documents,
      the ledger, runs, partners, reviews, the community, their row-level security, and the
      sign-up trigger that creates each user's profile.
- [ ] **Regenerate the TypeScript types** afterwards:
      `supabase gen types typescript --project-id thiznrxojzrxkjwqhtjt > src/integrations/supabase/types.ts`,
      then replace the untyped `db` view in `src/lib/data/repository.ts` with the typed client.
- [ ] **Verify partners**: set `partner_profiles.verified_at` (and the accreditation or licence
      numbers) for each bookkeeper, CPA or tax lawyer after checking their documents. Until then
      their profile is not public and they cannot answer in the community.
- [ ] **Remove the sample data** fallback in `src/lib/data/repository.ts` (`liveOrSample`) once
      real data flows end to end, or keep it for logged-out demos.
- [ ] Add "This helped" for the asker (an update policy on `community_answers.helpful` limited
      to the post's author) and deleting a post (soft delete via `deleted_at`).

## 2. Supabase Auth settings

- [ ] **Site URL**: change from `http://localhost:3000` to the live Netlify address.
- [ ] **Redirect URLs**: add the Netlify address (and `/app`) to the allow list.
- [ ] **Email**: decide whether new users must confirm their email (on today), and connect a
      custom SMTP provider: the built-in mailer sends only about 2 emails an hour.

## 3. Cloudflare R2 (file storage)

- [ ] Create a private bucket (for example `takatax-documents`).
- [ ] Create an R2 API token with read and write access to that bucket.
- [ ] Add a CORS rule to the bucket allowing `PUT` and `GET` from the site's address.
- [ ] Set these **Supabase Edge Function secrets**:
      `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- [ ] Mark uploads as arrived: after the browser's PUT, call a small `confirm-upload` function
      (or use an R2 event) to move documents from `waiting_for_storage` to `waiting_for_reader`.
- [ ] Show photos on the document page through short-lived download links.

## 4. OpenRouter (AI reader and assistant)

- [ ] Set the **Supabase Edge Function secret** `OPENROUTER_API_KEY`.
- [ ] Confirm the model slugs in `supabase/functions/_shared/parser/models.ts` on
      openrouter.ai/models, or override them with the secrets `OPENROUTER_MODEL_FAST`,
      `OPENROUTER_MODEL_RECHECK`, `OPENROUTER_MODEL_SETTLE` and `OPENROUTER_MODEL_ASSISTANT`.
- [ ] Run the 200-document model test and tune `CONFIDENCE_THRESHOLD` in
      `supabase/functions/_shared/parser/checks.ts`.
- [ ] Add a COR confirmation screen: today the read COR is saved directly; the user should
      confirm the fields and choose the income tax option first.
- [ ] Log each AI call's tokens and cost (an `ai_spend` table) and add a daily spend cap.

## 5. Edge functions

- [ ] **Deploy** the three functions:
      `supabase functions deploy create-upload-urls read-documents assistant-chat`.
      They live in `supabase/functions/`; shared, tested logic is in `supabase/functions/_shared/`.
- [ ] For testing before payments exist, the secret `ALLOW_UNPAID_RUNS=true` lets any run be
      read. Remove it before launch.

## 6. Payments

- [ ] Choose PayMongo or Xendit (GCash and Maya), create checkout for runs, Premium months and
      storage, and mark runs paid from a verified webhook. The upload screen already shows the
      price (`quoteRun` in `supabase/functions/_shared/uploads/rules.ts`).

## 7. Netlify

- [ ] Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` if Lovable's `.env` is not used
      in the Netlify build (both values are public).
- [ ] After the first deploy, add the site to Google Search Console and submit
      `https://<your-domain>/sitemap.xml`. The sitemap lists public community questions and
      verified partner profiles once the database tables exist; until then it lists the main
      pages only. `/robots.txt` keeps `/app`, `/login` and `/signup` out of search results.

## 8. Product decisions

- [ ] Premium allowance: the site now says **1,000 documents a month**. The what-if model on
      `/deck` has sliders for the limit and how much of it Premium customers use, and a
      "300 vs 1,000" table that compares both limits at the current slider settings.
- [ ] The outcomes on the landing page marked "After launch" and "After year 1" (taxpayer
      profile, lender sharing, investor newsletter) are plans, not features. Each needs its own
      design, consent flow and legal review (BIR confidentiality, Data Privacy Act) before it
      is built.
- [ ] Privacy notice and terms (Data Privacy Act), community rules, and partner terms, reviewed
      by a Philippine lawyer.
- [ ] A CPA review of the tax rules in `supabase/functions/_shared/domain/` against real filed
      returns. The estimates are a guide, not the figures to file.
