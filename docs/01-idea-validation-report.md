# Deliverable 1: Idea Validation Report

**Takatax: AI for your BIR figures and tax monitoring.** Author: marvin-mvm.
The same content is in the pitch deck (slides "Deliverable 1"), at
<https://takatax.netlify.app/deck>. Numbers in brackets refer to the sources at the end.

## Summary: seven questions, seven answers

| #   | Question                                    | Answer                                                                                   |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Is tax filing a real problem for Filipinos? | Yes. It takes time and manual paperwork, so businesses skip it or get it wrong.          |
| 2   | Who is the target user?                     | Sole proprietors running micro businesses. Bookkeepers and CPAs as partners, at 25% off. |
| 3   | Is the market meaningful?                   | 1.13 million micro enterprises. We need 1 in 1,000 in year 1, 1 in 100 by year 3.        |
| 4   | What competitors exist?                     | Taxumo and JuanTax: subscriptions, and you still do the encoding.                        |
| 5   | What is our edge?                           | AI reads your documents. You pay per run, not per month.                                 |
| 6   | How do we test it cheaply?                  | Run our own business's receipts and compare with the return we filed.                    |
| 7   | What could make it fail?                    | A wrong figure on a return. We flag doubt before you file.                               |

## Step 1. Is tax filing a real problem?

**Yes.** Filing takes time, with a lot of manual looking up of expenses and sales. Many Filipinos
get it wrong, avoid registering with the BIR, or never start the business at all.

- **171 hours and 13 payments a year** for a business to comply with its taxes [3].
- **The BIR is the most burdensome agency** for small firms, in a survey of 590 SMEs; about a
  third of compliance time goes to taxes [4, 5].
- **Only 22% of registered self-employed taxpayers paid income tax**: 402,934 of 1.82 million
  (2012 data) [6, 7].
- Small businesses face the same requirements as large ones but cannot afford an accountant [8].
- Mistakes are fined: a 10% surcharge plus 6% yearly interest for micro and small taxpayers;
  25% and 12% for the rest [10, 11].
- Online workers do not know which tax category applies to them [9].

## Step 2. Who is the target user?

**Primary: the sole proprietor running a micro business**: a store, a clinic, a service shop. They
file monthly and quarterly returns from a pile of receipts, usually at night, without an
accountant. Next: freelancers and contractors (income, 2307s, quarterly filing) and small and
medium businesses (more documents, withholding returns).

**Partners: bookkeepers, CPAs and tax lawyers** at 25% off. They serve more clients without
encoding receipts by hand, and they bring their clients with them.

## Step 3. Is the market meaningful?

- **1,127,058 micro enterprises**, 90% of all businesses; 99.6% of 1,246,373 establishments are
  MSMEs [1, 2].
- **About 1.5 million freelancers and virtual assistants** [12]; **28.1% of employed Filipinos**
  are self-employed with no paid staff [13].
- **What we need:** 0.1% of micro enterprises in year 1 (1,127 paying customers) and 1% by year 3
  (11,271). Freelancers are extra and not counted in the plan.
- **Partner channel:** 5,358 BIR-accredited tax agents [14].

## Step 4. What competitors exist?

| Option        | How you get your numbers                                             | Price                                                          |
| ------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Taxumo        | You record each income and expense; it computes and files            | Subscription by plan [15, 16]                                  |
| JuanTax       | You or your accountant enter the transactions; it prepares and files | ₱2,000 per organisation a month [17, 18]                       |
| BIR eBIRForms | You compute and type every figure                                    | Free                                                           |
| A bookkeeper  | They encode your receipts by hand                                    | Monthly retainer                                               |
| **Takatax**   | **Upload photos; AI reads them; the engine computes every return**   | **₱149 per run of up to 80 pages; a subscription is optional** |

Takatax does not file with the BIR: the taxpayer or their bookkeeper files.

## Step 5. What is our edge? (differentiating angle)

**AI does the reading, and you pay only when you use it.**

- **Document parser on the go:** snap receipts, invoices and 2307s; AI reads the lot.
- **A tested rules engine** computes each return and explains every excluded document.
- **Tax monitoring:** deadlines, what is filed and paid, running income, the ₱3M threshold.
- **Pay per run:** ₱149 a run; a monthly plan is optional. No parse, no fee.
- **Your choice:** file yourself, or invite a verified bookkeeper to check and file.
- **25% off for bookkeepers and CPAs**, no platform fee: they keep 100% of what they charge.

## Step 6. How do we test it cheaply?

**Use real receipts from a real business: ours.**

1. Feed one quarter of our own business's receipts into Takatax.
2. Compare its figures with the return we filed, using the tax types on our COR.
3. Repeat, free, with 10 to 20 business owners and 3 bookkeepers.

What we measure: 98% of amounts and TINs read exactly; under 5% of documents need a human check;
₱0.32 or less in AI cost per page; "Would you pay ₱149 for this?". Cost: about ₱64, the AI bill
for a 200-document test [21]. On the live app the reader has already read a real COR and real
receipts.

## Step 7. What are the biggest failure risks?

| Risk                              | Why it happens                                   | What we do                                                                                  |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| A wrong figure gets filed         | Blurry photo, missing document, wrong tax option | Confidence scores, arithmetic checks, a "Please check" review, a CPA-reviewed engine        |
| People do not trust AI with taxes | The numbers feel like a black box                | A free trial, a reason for every number, verified bookkeepers on demand                     |
| AI cost runs away                 | Heavy uploads, hard-to-read photos               | Pages counted and priced before reading, each document read once, a daily spending cap      |
| A data leak                       | TINs and income are sensitive                    | Row-level security on every table, private file storage, an activity log of who opened what |
| Competitors copy pay-per-run      | Pricing is easy to match                         | The bookkeeper network, and each user's stored history and archive                          |

## Why now

1. **The rules just changed.** The Ease of Paying Taxes Act (RA 11976, 2024) made the invoice the
   primary document instead of the official receipt, and created a micro taxpayer class with
   lower penalties [10, 11]. Every small business is relearning what to keep and how to file,
   which is when people look for help.
2. **Reading a receipt photo became cheap.** Multimodal models now read photos and PDFs
   directly, without OCR or templates, for about ₱0.23 to ₱0.32 a page blended [19, 20, 21, 22].
   That makes a ₱149 pay-per-run price profitable, which a human encoder or an OCR pipeline could
   not match.
3. **More people work for themselves.** About 1.5 million freelancers and virtual assistants
   [12] and 28.1% of employed Filipinos self-employed with no paid staff [13], each of whom must
   register and file, and many of whom do not know how [9].

## Differentiating angle, in one sentence

Competitors make you type your transactions and charge a subscription; Takatax reads your
documents with AI, computes every return with a tested engine, and charges only when you run it.

## Sources

1. **Department of Trade and Industry (DTI)**, Philippine MSME Statistics, from the PSA 2023 List of Establishments. 1,246,373 business establishments; 1,241,733 are MSMEs (99.63%); 1,127,058 are micro enterprises (90.43%). <https://www.dti.gov.ph/dti-knowledge-hub/dti-statistics/dti-msme-statistics>
2. **Bangko Sentral ng Pilipinas (BSP)**, The MSME sector, citing the PSA 2023 List of Establishments. Second source for the same establishment counts. <https://www.bsp.gov.ph/Inclusive%20Finance/EFLP/EFLP_MSMEs_01a.pdf>
3. **World Bank**, Doing Business 2020, Economy Profile: Philippines. Paying taxes: 13 payments and 171 hours a year; ranked 95th of 190 economies. <https://archive.doingbusiness.org/content/dam/doingBusiness/country/p/philippines/PHL.pdf>
4. **Asian Institute of Management, Rizalino S. Navarro Policy Center**, Cost of Regulatory Compliance for SMEs in the Philippines (2019 survey), reported by Newsbytes.PH. 590 SMEs in Metro Manila, Cebu and Davao; the BIR ranked as the most burdensome agency; about a third of compliance time goes to taxes. <https://newsbytes.ph/2019/12/23/ph-govt-urged-to-streamline-online-compliance-systems/>
5. **Francisco, Flaminiano, Santamaria and Abad**, Firm-level Impact of Regulatory Compliance Costs on Small Business Growth, International Review of Entrepreneurship (2022). Peer-reviewed paper on the same AIM survey: time spent on regulation lowers the chance that an SME grows. <https://www.tara.tcd.ie/items/5ef6c4b9-4b8c-4b50-9886-4ce47bc599ce>
6. **Bureau of Internal Revenue (BIR)**, Commissioner Kim Jacinto-Henares, presentation at an IMF tax seminar (2014). 2012 data: 1,821,599 registered self-employed individual taxpayers; 402,934 paid income tax. <https://www.imf.org/external/np/seminars/eng/2014/asiatax/pdf/Jacinto-Henares%20(2).pdf>
7. **The Philippine Star**, 400,000 out of 1.8M taxpayers filed ITRs in 2013 (April 12, 2014). News report of the same BIR figures for the following year. <https://www.philstar.com/headlines/2014/04/12/1311599/400000-out-18-m-taxpayers-filed-itrs-2013>
8. **Philippine Daily Inquirer**, Simplify paying taxes for all (opinion). Small businesses face the same tax requirements as large taxpayers but usually cannot afford accountants. <https://opinion.inquirer.net/156546/simplify-paying-taxes-for-all>
9. **Philippine Institute for Development Studies (PIDS)**, Classifying online workers for social protection, taxation a big problem. Online workers report confusion about which tax category applies to them, and some cannot complete BIR registration. <https://pids.gov.ph/details/classifying-online-workers-for-social-protection-taxation-a-big-problem>
10. **Republic Act No. 11976**, Ease of Paying Taxes Act (2024), summarised by P&A Grant Thornton. Micro taxpayers have gross sales under ₱3 million; micro and small taxpayers pay a 10% surcharge and 6% interest instead of 25% and 12%. <https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/eopt-is-here-revised-rules-on-taxpayer-classification-and-reduced-penalties-for-micro-and-small-taxpayers/>
11. **PwC Philippines**, New year, new tax rules (2024). Second summary of the Ease of Paying Taxes Act. <https://www.pwc.com/ph/en/tax/tax-publications/taxwise-or-otherwise/2024/new-year-new-tax-rules.html>
12. **Social Security System (SSS) and DICT**, SSS inks pact with DICT to expand social security coverage for freelancers, GMA News. An estimated 1.5 million freelancers and virtual assistants in the Philippines. <https://www.gmanetwork.com/news/money/companies/1007718/sss-inks-pact-with-dict-to-expand-social-security-coverage-for-freelancers/story/>
13. **Philippine Statistics Authority (PSA)**, Labor Force Survey, September 2026, reported by GMA News. 28.1% of employed persons are self-employed without any paid employee. <https://www.gmanetwork.com/news/money/economy/1008493/ph-unemployment-climbs-to-5-4-in-september-2026-jobless-filipinos-at-2-86m/story/>
14. **Bureau of Internal Revenue (BIR)**, List of accredited tax agents, cited in The Manila Times. 5,358 accredited tax practitioners and agents as of February 2022. <https://digitaledition.manilatimes.net/article/281822877658259>
15. **Taxumo**, Pricing plans. Subscription plans by tax type (8%, Micro, SMB), billed quarterly, yearly or every two years. <https://www.taxumo.com/taxumo-subscription-plans/>
16. **Taxumo Help Center**, What is Taxumo. Users record income and expenses; Taxumo computes, files and pays. Certified under the BIR's tax software provider programme. <https://intercom.help/taxumo-inc/en/articles/1215625-what-is-taxumo>
17. **JuanTax**, JuanTax Plus pricing. ₱2,000 per organisation per month, or ₱19,200 a year. <https://plus.juan.tax/pricing/>
18. **JuanTax Help Center**, FAQs on the End of Fast File (Standalone). The pay-per-form Fast File product was retired and folded into Juan Accounting. <https://help.juan.tax/en/articles/480-faqs-on-the-end-of-fast-file-standalone>
19. **Google**, Gemini API pricing. Token prices behind the Flash and Pro cost per page. <https://ai.google.dev/gemini-api/docs/pricing>
20. **Anthropic**, API pricing. Token prices behind the Haiku cost per page. <https://www.anthropic.com/pricing>
21. **Takatax**, Feasibility study and financial model (project document, November 2026). Prices, unit costs, partner targets and the tax treatment used in the what-if model.
22. **OpenRouter**, Models and pricing. One API for the Gemini and Claude models the reader uses, called from Trigger.dev background jobs. <https://openrouter.ai/models>
23. **Cloudflare**, R2 pricing. Object storage for uploaded documents, with no fees for downloads. <https://developers.cloudflare.com/r2/pricing/>
24. **Trigger.dev**, Pricing. Background jobs that read each page: $0.0000338 a second of compute on the default machine, $0.000025 a job, and the $50 Pro plan with $50 of usage included. <https://trigger.dev/pricing>
25. **Dodo Payments**, Pricing. Merchant of record fees used for the payment preset: 4% + $0.40 a payment, plus 1.5% for cards outside the US. <https://dodopayments.com/pricing>
26. **Xendit**, Pricing, Philippines. The payment gateway Takatax will use: 2.3% for GCash, 1.8% for Maya, 3.2% + ₱10 for local cards. <https://www.xendit.co/en-ph/pricing/>
