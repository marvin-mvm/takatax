# Deliverable 3: Spec (spec.md), v1.1

**Takatax**: AI reads a Filipino small business's tax documents; a tested engine computes its BIR
returns. Author: marvin-mvm. Architecture notes:
[`docs/03-architecture-notes.md`](docs/03-architecture-notes.md). Product scope:
[`docs/02-PRD.md`](docs/02-PRD.md). Revised after review (section 7).

## 1. AI capability

**Type:** extraction and classification from images and PDFs (document understanding), plus a
small question-answering assistant over the user's own figures.

**AI module: the document reader** (`supabase/functions/_shared/parser/`, run by the
`read-step` edge function or the Trigger.dev job `read-run`):

1. The browser rotates, shrinks and checks each photo for blur, darkness and glare (free).
2. A **fast model** (Gemini Flash, through OpenRouter) reads one photo, or a group of up to 5 PDF
   pages, natively (no OCR) and returns JSON that must match a strict schema, with a confidence
   from 0 to 1 for the amount, the TIN, the date and the document type.
3. **Arithmetic and format checks** in code: VAT is 12/112 of the total, TINs are well formed,
   dates are real, totals add up.
4. If any confidence is below **0.8** or a check fails, a **second model from another company**
   (Claude Haiku) reads it again.
5. If the two disagree, a **top model** (Gemini Pro) settles it.
6. Whatever is still unsure is saved as **"Please check"** for the user. The model never decides
   a tax figure: the tax engine (plain TypeScript, `_shared/domain/`) computes the returns.

**COR reader:** the top model reads the Certificate of Registration into names, address, lines of
business and each tax type with its BIR form, for the owner to confirm.

**Records assistant:** a small model answers questions about the user's own figures; the figures
come from the database, the model only explains them, and it gives no tax advice.

**Guards:** pages are counted and priced before reading; each document is read once; every model
call is logged with its cost; a daily spending cap stops the reader.

## 2. Inputs

| Input                                                      | Format and limits                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Receipts and purchase invoices, sales invoices, Forms 2307 | JPG, PNG, WebP or HEIC photos; PDF. Up to 200 MB a file, 5 GB and 1,000 files an upload, 1,000 pages a PDF                                 |
| The COR (BIR Form 2303)                                    | A photo or a PDF                                                                                                                           |
| The owner's choices                                        | Document type (or "Mixed docs, AI will sort it"), confirmed COR fields, income tax option (8% or graduated), corrections on "Please check" |
| Questions to the assistant                                 | Text, scoped to the period on screen                                                                                                       |

## 3. Outputs

| Output                                   | Content                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extracted document (JSON, strict schema) | `kind` (sales invoice, expense receipt, Form 2307, COR, not a tax document), `date`, `documentNumber`, `issuerName`, `issuerTin`, `recipientName`, `recipientTin`, `totalAmount`, `vatAmount`, `currency`, `expenseCategory`; for a 2307 also `periodFrom`, `periodTo`, `incomePayment`, `taxWithheld`, `atc`; and `confidence` for the key fields |
| Ledger rows                              | One sale, expense or withholding row per document, linked to it                                                                                                                                                                                                                                                                                    |
| Document status                          | Read, Please check or Not counted, with the steps that ran ("fast model, then second model")                                                                                                                                                                                                                                                       |
| Return figures                           | 1701Q (cumulative from January 1), 2551Q and SAWT, with a reason for every excluded document                                                                                                                                                                                                                                                       |
| Tracker                                  | Deadlines per tax type, filed and paid, running income against ₱3M                                                                                                                                                                                                                                                                                 |
| Progress                                 | Pages read per document while reading                                                                                                                                                                                                                                                                                                              |

## 4. Acceptance criteria (testable)

| #   | Criterion                                                                                                                           | How it is tested                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A1  | A model reply that does not match the schema is rejected, never saved                                                               | Unit tests in `_shared/parser/*.test.ts`                             |
| A2  | A field with confidence under 0.8, or a failed check, sends the document to the second model, and to "Please check" if still unsure | Unit tests of the reader's escalation and checks                     |
| A3  | VAT must be 12/112 of a VAT-inclusive total within ₱1; a TIN must be 9 digits plus an optional 3-to-5-digit branch code             | Unit tests of the checks                                             |
| A4  | A photo is 1 page and a PDF every page; the price shown before upload equals the server's price                                     | Unit tests of `quoteRun`, shared by the screen and `create-checkout` |
| A5  | A document is read once: a request for a finished document is refused (409), and a double click starts one reading                  | Edge function logic and a browser test                               |
| A6  | Every tax rule in section 6 gives the hand-computed result to the centavo                                                           | Unit tests in `_shared/domain/`                                      |
| A7  | No user can read another account's data; a professional sees an account only after accepting an invitation, and never its payments  | SQL behaviour tests in `supabase/tests/`                             |
| A8  | The reader stops when the day's AI spend reaches the cap                                                                            | The `ai_spend` log and the cap check before every call               |
| A9  | Every screen works at 360 px wide with no sideways scroll                                                                           | Browser checks at phone and desktop sizes                            |

418 unit tests run in CI (GitHub Actions) on every pull request; the SQL checks run before every
database change.

## 5. Architecture (summary)

UI: TanStack Start (React 19) on Netlify. Backend: Supabase Edge Functions (TypeScript) and
Postgres with row-level security. AI layer: OpenRouter, called only from the server. Files:
Cloudflare R2 with signed links. Data flow: browser → signed upload to R2 → confirm → price →
reader reads page groups → JSON → checks → ledger rows → tax engine → screens. Full notes,
diagram and security: [`docs/03-architecture-notes.md`](docs/03-architecture-notes.md).

## 6. Tax rules (fixed in review)

- Receipts count only for itemized deductions; the OSD is a flat 40%.
- 8% filers do not file the 2551Q; the 8% replaces percentage tax.
- The 1701Q is cumulative from January 1; the fourth quarter goes in the annual return.
- Since 2024 the invoice is the primary document (RA 11976).
- The COR often does not show the 8% choice; the user confirms the income tax option each year.

## 7. Revision history

- **v1.0**: first draft.
- **v1.1** (after review): corrected the five tax rules in section 6. The first draft let meals
  count under OSD, made everyone file the 2551Q, computed each quarter alone, treated the official
  receipt as the primary document, and took the tax option from the COR. Added read-once, the
  daily AI cap and per-page pricing after reviewing the cost risks.
