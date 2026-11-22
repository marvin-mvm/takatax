# Deliverable 2: Product Requirements Document (one page)

**Takatax** turns photos and PDFs of a taxpayer's documents into the figures for their BIR
returns, line by line, for a pay-per-run fee. Author: marvin-mvm. Also on the deck slide
"Deliverable 2", with the revenue model and a what-if financial model.

## 1. Problem statement

Computing your own taxes is hard. Self-employed Filipinos encode receipts by hand, get the rules
wrong, or avoid registering at all: compliance takes about 171 hours a year, and only about one in
five registered self-employed taxpayers paid income tax (see the Idea Validation Report). Existing
tools (Taxumo, JuanTax) still need the encoding and charge a subscription.

## 2. Target users

- **Primary:** sole proprietors running micro businesses (1.13 million in the Philippines).
- **Also:** freelancers, contractors and other small businesses.
- **Partners at 25% off:** bookkeepers, CPAs and tax lawyers, invited by the taxpayer.

## 3. Core features, with acceptance criteria

| #   | Feature                                                                                                                    | Accepted when (testable)                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Account from the COR.** The AI reads the Certificate of Registration (names, TIN, RDO, every tax type with its BIR form) | Tax types and deadlines change only after the owner confirms the COR; an unread or wrong field can be edited before confirming                                                                     |
| F2  | **Upload photos or PDFs**, checked for blur in the browser, pages counted                                                  | The page count and price show before anything is uploaded; a blurry or dark photo is flagged before upload; a photo counts as 1 page and a PDF as every page                                       |
| F3  | **AI reader** with per-field confidence and arithmetic checks, cheapest model first                                        | On a test set, 98% of amounts and TINs match exactly; a field below the confidence threshold is never saved without a "Please check" flag; a document is read once (a second click starts nothing) |
| F4  | **Please check**: a review form for the few documents the AI is unsure about                                               | Fewer than 5% of documents need it; a correction updates the ledger and the return figures at once                                                                                                 |
| F5  | **Tax engine**: 1701Q, 2551Q and SAWT, with a reason for every excluded document                                           | Unit tests reproduce hand-computed returns to the centavo; every excluded document lists its reason                                                                                                |
| F6  | **Tracker**: deadlines, filed and paid, running income and the ₱3M threshold                                               | Every deadline implied by the confirmed COR's tax types appears, in date order                                                                                                                     |
| F7  | **Bookkeeper access**: invite, accept or decline, cancel or remove, with an activity log                                   | A professional sees nothing until they accept; access ends at once on removal; every file they open or figure they change appears in the owner's log                                               |

During launch an account's first 80 pages of AI reading are free; more pages and Premium say
"coming soon", so no real payments are processed.

## 4. Out of scope

- Filing with the BIR: the taxpayer or their bookkeeper files.
- Tax advice: Takatax is a computation tool.
- Real payment processing: the Xendit checkout is built but switched off.
- Holding money between taxpayers and bookkeepers; selling personal data.
- Later: VAT returns ([issue #44](https://github.com/marvin-mvm/takatax/issues/44)), native apps,
  bank statement import.

## 5. Success metrics

- Parsing accuracy: 98% exact match on amounts and TINs.
- Under 5% of documents sent to user review.
- AI cost of ₱0.32 or less per page.
- User feedback of 4 out of 5 or better after a run.
- 1 in 4 trial users buys a run; 1,127 paying customers by month 12.

## 6. Open questions

- Will users trust AI-read figures without a CPA sign-off?
- How often will a customer run: every quarter or every month?
- What are the real trial conversion and churn?
- How many freelancers are BIR-registered?
- Are prices VAT-inclusive once revenue passes ₱3M?
- Does a computation-only tool need any BIR accreditation?
