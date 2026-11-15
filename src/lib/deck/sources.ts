/**
 * References for the deck. In the slides a claim is cited as (Primary, 1, 2): the name of
 * the main source, then the numbers of the entries below that back it.
 */
export interface Source {
  id: number;
  publisher: string;
  title: string;
  /** What the deck takes from this source. */
  note: string;
  url?: string;
}

export const SOURCES: Source[] = [
  {
    id: 1,
    publisher: "Department of Trade and Industry (DTI)",
    title: "Philippine MSME Statistics, from the PSA 2023 List of Establishments",
    note: "1,246,373 business establishments; 1,241,733 are MSMEs (99.63%); 1,127,058 are micro enterprises (90.43%).",
    url: "https://www.dti.gov.ph/dti-knowledge-hub/dti-statistics/dti-msme-statistics",
  },
  {
    id: 2,
    publisher: "Bangko Sentral ng Pilipinas (BSP)",
    title: "The MSME sector, citing the PSA 2023 List of Establishments",
    note: "Second source for the same establishment counts.",
    url: "https://www.bsp.gov.ph/Inclusive%20Finance/EFLP/EFLP_MSMEs_01a.pdf",
  },
  {
    id: 3,
    publisher: "World Bank",
    title: "Doing Business 2020, Economy Profile: Philippines",
    note: "Paying taxes: 13 payments and 171 hours a year; ranked 95th of 190 economies.",
    url: "https://archive.doingbusiness.org/content/dam/doingBusiness/country/p/philippines/PHL.pdf",
  },
  {
    id: 4,
    publisher: "Asian Institute of Management, Rizalino S. Navarro Policy Center",
    title:
      "Cost of Regulatory Compliance for SMEs in the Philippines (2019 survey), reported by Newsbytes.PH",
    note: "590 SMEs in Metro Manila, Cebu and Davao; the BIR ranked as the most burdensome agency; about a third of compliance time goes to taxes.",
    url: "https://newsbytes.ph/2019/12/23/ph-govt-urged-to-streamline-online-compliance-systems/",
  },
  {
    id: 5,
    publisher: "Francisco, Flaminiano, Santamaria and Abad",
    title:
      "Firm-level Impact of Regulatory Compliance Costs on Small Business Growth, International Review of Entrepreneurship (2022)",
    note: "Peer-reviewed paper on the same AIM survey: time spent on regulation lowers the chance that an SME grows.",
    url: "https://www.tara.tcd.ie/items/5ef6c4b9-4b8c-4b50-9886-4ce47bc599ce",
  },
  {
    id: 6,
    publisher: "Bureau of Internal Revenue (BIR)",
    title: "Commissioner Kim Jacinto-Henares, presentation at an IMF tax seminar (2014)",
    note: "2012 data: 1,821,599 registered self-employed individual taxpayers; 402,934 paid income tax.",
    url: "https://www.imf.org/external/np/seminars/eng/2014/asiatax/pdf/Jacinto-Henares%20(2).pdf",
  },
  {
    id: 7,
    publisher: "The Philippine Star",
    title: "400,000 out of 1.8M taxpayers filed ITRs in 2013 (April 12, 2014)",
    note: "News report of the same BIR figures for the following year.",
    url: "https://www.philstar.com/headlines/2014/04/12/1311599/400000-out-18-m-taxpayers-filed-itrs-2013",
  },
  {
    id: 8,
    publisher: "Philippine Daily Inquirer",
    title: "Simplify paying taxes for all (opinion)",
    note: "Small businesses face the same tax requirements as large taxpayers but usually cannot afford accountants.",
    url: "https://opinion.inquirer.net/156546/simplify-paying-taxes-for-all",
  },
  {
    id: 9,
    publisher: "Philippine Institute for Development Studies (PIDS)",
    title: "Classifying online workers for social protection, taxation a big problem",
    note: "Online workers report confusion about which tax category applies to them, and some cannot complete BIR registration.",
    url: "https://pids.gov.ph/details/classifying-online-workers-for-social-protection-taxation-a-big-problem",
  },
  {
    id: 10,
    publisher: "Republic Act No. 11976",
    title: "Ease of Paying Taxes Act (2024), summarised by P&A Grant Thornton",
    note: "Micro taxpayers have gross sales under ₱3 million; micro and small taxpayers pay a 10% surcharge and 6% interest instead of 25% and 12%.",
    url: "https://www.grantthornton.com.ph/insights/articles-and-updates1/tax-notes/eopt-is-here-revised-rules-on-taxpayer-classification-and-reduced-penalties-for-micro-and-small-taxpayers/",
  },
  {
    id: 11,
    publisher: "PwC Philippines",
    title: "New year, new tax rules (2024)",
    note: "Second summary of the Ease of Paying Taxes Act.",
    url: "https://www.pwc.com/ph/en/tax/tax-publications/taxwise-or-otherwise/2024/new-year-new-tax-rules.html",
  },
  {
    id: 12,
    publisher: "Social Security System (SSS) and DICT",
    title: "SSS inks pact with DICT to expand social security coverage for freelancers, GMA News",
    note: "An estimated 1.5 million freelancers and virtual assistants in the Philippines.",
    url: "https://www.gmanetwork.com/news/money/companies/1007718/sss-inks-pact-with-dict-to-expand-social-security-coverage-for-freelancers/story/",
  },
  {
    id: 13,
    publisher: "Philippine Statistics Authority (PSA)",
    title: "Labor Force Survey, September 2026, reported by GMA News",
    note: "28.1% of employed persons are self-employed without any paid employee.",
    url: "https://www.gmanetwork.com/news/money/economy/1008493/ph-unemployment-climbs-to-5-4-in-september-2026-jobless-filipinos-at-2-86m/story/",
  },
  {
    id: 14,
    publisher: "Bureau of Internal Revenue (BIR)",
    title: "List of accredited tax agents, cited in The Manila Times",
    note: "5,358 accredited tax practitioners and agents as of February 2022.",
    url: "https://digitaledition.manilatimes.net/article/281822877658259",
  },
  {
    id: 15,
    publisher: "Taxumo",
    title: "Pricing plans",
    note: "Subscription plans by tax type (8%, Micro, SMB), billed quarterly, yearly or every two years.",
    url: "https://www.taxumo.com/taxumo-subscription-plans/",
  },
  {
    id: 16,
    publisher: "Taxumo Help Center",
    title: "What is Taxumo",
    note: "Users record income and expenses; Taxumo computes, files and pays. Certified under the BIR's tax software provider programme.",
    url: "https://intercom.help/taxumo-inc/en/articles/1215625-what-is-taxumo",
  },
  {
    id: 17,
    publisher: "JuanTax",
    title: "JuanTax Plus pricing",
    note: "₱2,000 per organisation per month, or ₱19,200 a year.",
    url: "https://plus.juan.tax/pricing/",
  },
  {
    id: 18,
    publisher: "JuanTax Help Center",
    title: "FAQs on the End of Fast File (Standalone)",
    note: "The pay-per-form Fast File product was retired and folded into Juan Accounting.",
    url: "https://help.juan.tax/en/articles/480-faqs-on-the-end-of-fast-file-standalone",
  },
  {
    id: 19,
    publisher: "Google",
    title: "Gemini API pricing",
    note: "Token prices behind the Flash and Pro cost per document.",
    url: "https://ai.google.dev/gemini-api/docs/pricing",
  },
  {
    id: 20,
    publisher: "Anthropic",
    title: "API pricing",
    note: "Token prices behind the Haiku cost per document.",
    url: "https://www.anthropic.com/pricing",
  },
  {
    id: 21,
    publisher: "Takatax",
    title: "Feasibility study and financial model (project document, November 2026)",
    note: "Prices, unit costs, partner targets and the tax treatment used in the what-if model.",
  },
  {
    id: 22,
    publisher: "OpenRouter",
    title: "Models and pricing",
    note: "One API for the Gemini and Claude models the reader uses, called from a Supabase Edge Function.",
    url: "https://openrouter.ai/models",
  },
  {
    id: 23,
    publisher: "Cloudflare",
    title: "R2 pricing",
    note: "Object storage for uploaded documents, with no fees for downloads.",
    url: "https://developers.cloudflare.com/r2/pricing/",
  },
];
