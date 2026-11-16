/**
 * Takatax what-if financial model.
 *
 * A pure function: the same inputs always give the same numbers, so the deck's sliders and
 * the unit tests share one source of truth. Fixed assumptions come from the Takatax
 * feasibility study; the adjustable ones are the fields of `ModelInputs`.
 */

import { PRICING } from "@shared/uploads/rules.ts";

/** Operating micro enterprises in the Philippines (PSA 2023 List of Establishments, via DTI). */
export const MICRO_ENTERPRISES = 1_127_058;

/**
 * Estimated AI cost per page for each model in the reader, in pesos. A photo is one page; a PDF
 * counts every page. The model reads each page itself (no OCR), so it knows a sale from an
 * expense.
 */
export const COST_PER_PAGE = { flash: 0.17, haiku: 0.05, pro: 0.62 } as const;

/** Share of re-read documents that still disagree and go on to the top model. */
const ESCALATION_SHARE = 0.4;

const PESOS_PER_USD = 63;
const MONTHLY_CHURN = 0.02;
const TRIAL_PAGES = 11; // the COR plus 10 pages
// Prices and limits come from the pricing rules the checkout enforces, so the deck and the
// product cannot drift apart.
/** Pages a Standard run includes; each page over it costs EXTRA_PAGE_PRICE. */
export const RUN_PAGE_LIMIT = PRICING.runPages;
export const EXTRA_PAGE_PRICE = PRICING.extraPage;
/** Each page over a Premium month's limit. */
export const PREMIUM_EXTRA_PAGE_PRICE = PRICING.premiumExtraPage;
const STORAGE_ADDON_SHARE = 50 / 900; // of regular customers
const PARTNER_DISCOUNT = PRICING.partnerDiscount;
const PARTNERS_TARGET = 1_608; // 20% of BIR-accredited tax agents, plus CPAs at half that
const PARTNERS_TARGET_MONTH = 36;
/**
 * Payment fees: a share of each payment plus a fixed amount per payment. Two presets: Xendit, the
 * Philippine gateway Takatax will use (2.3% for GCash, the most common way to pay; Maya is 1.8%
 * and cards 3.2% + ₱10), and a merchant of record for comparison (Dodo Payments' published rate:
 * 4% + $0.40, plus 1.5% for cards outside the US). Sources: xendit.co/en-ph/pricing,
 * dodopayments.com/pricing.
 */
export const PAYMENT_PRESETS = {
  xendit: { label: "Xendit", pct: 2.3, fixedUsd: 0 },
  mor: { label: "Merchant of record", pct: 5.5, fixedUsd: 0.4 },
} as const;

// Background jobs on Trigger.dev, which read the pages so long PDFs never hit Supabase's
// 150 to 400 second limit. Billed per second of compute (the default small-1x machine, which
// is plenty: the job mostly waits for the model's reply) plus a fee per job run. The Pro plan
// costs $50 a month and includes $50 of usage. Source: trigger.dev/pricing.
export const TRIGGER = {
  usdPerSecond: 0.0000338,
  usdPerRun: 0.000025,
  planUsdMonthly: 50,
  /** Pages of a PDF sent to the model in one call (images go one per call). */
  pdfPagesPerCall: 5,
  /** Seconds the parent job of each run spends counting and splitting pages. */
  parentSecondsPerRun: 5,
} as const;
// Ads: bookkeeper boosts and lender or bank placements, from month 7.
const ADS_START_MONTH = 7;
const BOOST_UPTAKE = 0.15;
const BOOST_MONTHLY = (99 * 52) / 12; // ₱99 per 7 days, bought continuously
const AD_VIEWS_PER_ACCOUNT = 12;
const AD_FILL = 0.6;
const AD_PRICE_PER_THOUSAND = 150;

// Subscriptions: research API access and the newsletter, from month 13.
const SUBSCRIPTIONS_START_MONTH = 13;
const RESEARCH_SUBSCRIBERS_START = 3;
const RESEARCH_SUBSCRIBERS_MONTH_36 = 30;
const RESEARCH_PRICE = 0.5 * 2_500 + 0.5 * 9_900;
const RESEARCH_HOSTING_MONTHLY = 20 * PESOS_PER_USD;
const NEWSLETTER_PRICE = 199;
const NEWSLETTER_UPTAKE = 0.01; // of accounts

const VAT_THRESHOLD = 3_000_000;
const SMALL_CORPORATION_INCOME = 5_000_000;

export type ReaderMode = "flash" | "pipeline" | "pro";

export interface ModelInputs {
  /** Length of the plan in years. */
  years: number;
  /** Share of micro enterprises that are paying customers by month 12, in percent. */
  year1SharePct: number;
  /** Share of micro enterprises that are paying customers by the last month, in percent. */
  finalSharePct: number;
  /** Price of one Standard run, in pesos. */
  runPrice: number;
  /** Price of one Premium month, in pesos. */
  premiumPrice: number;
  /** Price of one 5 GB storage month, in pesos. */
  storagePrice: number;
  /** Runs a regular customer buys per year. */
  runsPerYear: number;
  /** Average pages in a run (photos count 1, PDFs every page). Pages over the run's limit are
   *  charged EXTRA_PAGE_PRICE each. */
  pagesPerRun: number;
  /** Share of customers on the Premium plan, in percent. */
  premiumSharePct: number;
  /** Pages a Premium month includes (the plan limit). Over it, PREMIUM_EXTRA_PAGE_PRICE a page. */
  premiumPageLimit: number;
  /** How much of that limit an average Premium customer uses each month, in percent. Over 100%
   *  the extra pages are charged PREMIUM_EXTRA_PAGE_PRICE each. */
  premiumUsagePct: number;
  /** Payment fee: a share of each payment, in percent. */
  paymentFeePct: number;
  /** Payment fee: a fixed amount per payment, in US dollars. */
  paymentFeeFixedUsd: number;
  /** Which models read the documents. */
  reader: ReaderMode;
  /** Share of pages that need a second read (three-step reader only), in percent. */
  recheckSharePct: number;
  /** Share of all pages that come from PDFs, in percent (the rest are photos). */
  pdfPageSharePct: number;
  /** Seconds of Trigger.dev compute billed per model call (mostly waiting for the reply). */
  jobSecondsPerCall: number;
  /** Marketing budget as a share of revenue, in percent. */
  marketingPct: number;
  /** Team, tools and equipment as a share of revenue, in percent. */
  teamPct: number;
  /** Fixed costs per month, in pesos. */
  fixedMonthly: number;
  /** Count bookkeeper boosts and lender or bank ads. */
  includeAds: boolean;
  /** Count research API access and the newsletter. */
  includeSubscriptions: boolean;
}

export const DEFAULT_INPUTS: ModelInputs = {
  years: 3,
  year1SharePct: 0.1,
  finalSharePct: 1,
  runPrice: PRICING.runPrice,
  premiumPrice: PRICING.premiumMonthly,
  storagePrice: PRICING.storageAddOnMonthly,
  runsPerYear: 6,
  pagesPerRun: 100,
  paymentFeePct: PAYMENT_PRESETS.xendit.pct,
  paymentFeeFixedUsd: PAYMENT_PRESETS.xendit.fixedUsd,
  premiumSharePct: 10,
  premiumPageLimit: PRICING.premiumPages,
  premiumUsagePct: 40,
  reader: "pipeline",
  recheckSharePct: 50,
  pdfPageSharePct: 40,
  jobSecondsPerCall: 8,
  marketingPct: 15,
  teamPct: 20,
  fixedMonthly: 60_000,
  includeAds: true,
  includeSubscriptions: true,
};

export interface RevenueByStream {
  parser: number;
  storage: number;
  ads: number;
  subscriptions: number;
  total: number;
}

export interface CostsByKind {
  ai: number;
  /** Trigger.dev background jobs that run the reader. */
  jobs: number;
  cloud: number;
  fees: number;
  marketing: number;
  team: number;
  fixed: number;
  total: number;
}

export interface YearResult {
  year: number;
  /** Paying customers at the end of the year. */
  customers: number;
  /** Bookkeeper and CPA partners at the end of the year. */
  partners: number;
  /** Pages read during the year. */
  pages: number;
  revenue: RevenueByStream;
  costs: CostsByKind;
  businessTaxKind: "3% percentage tax" | "VAT";
  businessTax: number;
  incomeTax: number;
  netProfit: number;
  /** Net profit as a share of revenue (0 when there is no revenue). */
  margin: number;
}

export interface ModelResult {
  aiCostPerPage: number;
  /** Trigger.dev cost per page, in pesos (before the monthly plan minimum). */
  jobsCostPerPage: number;
  years: YearResult[];
  totals: {
    customers: number;
    revenue: RevenueByStream;
    costs: number;
    taxes: number;
    netProfit: number;
    margin: number;
  };
}

/** Estimated AI cost of reading one page, in pesos. */
export function aiCostPerPage(reader: ReaderMode, recheckSharePct: number): number {
  if (reader === "flash") return COST_PER_PAGE.flash;
  if (reader === "pro") return COST_PER_PAGE.pro;
  const recheck = clamp(recheckSharePct, 0, 100) / 100;
  return (
    COST_PER_PAGE.flash +
    recheck * COST_PER_PAGE.haiku +
    recheck * ESCALATION_SHARE * COST_PER_PAGE.pro
  );
}

/**
 * Trigger.dev cost of reading one page, in pesos: one model call per photo, one per group of
 * PDF pages, more calls for pages that are read again, each billed for its seconds of compute
 * plus the per-run fee.
 */
export function jobsCostPerPage(
  inputs: Pick<ModelInputs, "reader" | "recheckSharePct" | "pdfPageSharePct" | "jobSecondsPerCall">,
): number {
  const pdf = clamp(inputs.pdfPageSharePct, 0, 100) / 100;
  const callsPerPage = 1 - pdf + pdf / TRIGGER.pdfPagesPerCall;
  const recheck = clamp(inputs.recheckSharePct, 0, 100) / 100;
  const reads = inputs.reader === "pipeline" ? 1 + recheck + recheck * ESCALATION_SHARE : 1;
  const usdPerCall =
    Math.max(inputs.jobSecondsPerCall, 0) * TRIGGER.usdPerSecond + TRIGGER.usdPerRun;
  return callsPerPage * reads * usdPerCall * PESOS_PER_USD;
}

/** Trigger.dev cost of the parent job that starts each run, in pesos. */
export const JOBS_COST_PER_RUN =
  (TRIGGER.parentSecondsPerRun * TRIGGER.usdPerSecond + TRIGGER.usdPerRun) * PESOS_PER_USD;

/** The payment fee on one payment of `amount` pesos. */
export function paymentFee(
  inputs: Pick<ModelInputs, "paymentFeePct" | "paymentFeeFixedUsd">,
  amount: number,
): number {
  if (amount <= 0) return 0;
  return (
    (Math.max(inputs.paymentFeePct, 0) / 100) * amount +
    Math.max(inputs.paymentFeeFixedUsd, 0) * PESOS_PER_USD
  );
}

/** Pages over a limit, which are charged one by one. */
const extraPages = (pages: number, limit: number) => Math.max(pages - limit, 0);

/** Paying customers at the end of a month: a straight ramp in year 1, then steady growth. */
export function customersAtMonth(month: number, inputs: ModelInputs): number {
  if (month <= 0) return 0;
  const lastMonth = Math.max(Math.round(inputs.years), 1) * 12;
  const atMonth12 = (MICRO_ENTERPRISES * Math.max(inputs.year1SharePct, 0)) / 100;
  const atLastMonth = (MICRO_ENTERPRISES * Math.max(inputs.finalSharePct, 0)) / 100;
  if (month <= 12) return (atMonth12 * month) / 12;
  if (lastMonth <= 12 || atMonth12 <= 0) return atMonth12;
  const monthlyGrowth = (atLastMonth / atMonth12) ** (1 / (lastMonth - 12));
  return atMonth12 * monthlyGrowth ** (Math.min(month, lastMonth) - 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Monthly cloud and storage cost in pesos, scaling with accounts and stored gigabytes. */
function cloudMonthly(accounts: number, gigabytes: number): number {
  const tiered =
    Math.max(gigabytes * 0.2 - 100, 0) * 0.021 +
    gigabytes * 0.8 * 0.006 +
    Math.max(gigabytes * 0.2 * 0.1 - 250, 0) * 0.09;
  if (accounts >= 5_000) return (404 + tiered) * PESOS_PER_USD;
  const storage =
    gigabytes >= 3_000
      ? Math.max(gigabytes * 0.2 - 100, 0) * 0.021 + gigabytes * 0.8 * 0.006
      : Math.max(gigabytes - 100, 0) * 0.021;
  return (59 + storage + Math.max(gigabytes * 0.1 - 250, 0) * 0.09) * PESOS_PER_USD;
}

function emptyYear(year: number): YearResult {
  return {
    year,
    customers: 0,
    partners: 0,
    pages: 0,
    revenue: { parser: 0, storage: 0, ads: 0, subscriptions: 0, total: 0 },
    costs: { ai: 0, jobs: 0, cloud: 0, fees: 0, marketing: 0, team: 0, fixed: 0, total: 0 },
    businessTaxKind: "3% percentage tax",
    businessTax: 0,
    incomeTax: 0,
    netProfit: 0,
    margin: 0,
  };
}

export function runModel(inputs: ModelInputs): ModelResult {
  const yearCount = Math.max(Math.round(inputs.years), 1);
  const costPerPage = aiCostPerPage(inputs.reader, inputs.recheckSharePct);
  const jobsPerPage = jobsCostPerPage(inputs);
  const runsPerMonth = Math.max(inputs.runsPerYear, 0) / 12;
  const pagesPerRun = Math.max(inputs.pagesPerRun, 0);
  const extraPerRun = extraPages(pagesPerRun, RUN_PAGE_LIMIT) * EXTRA_PAGE_PRICE;
  // Pages an average Premium customer has read each month: the plan limit times how much of it
  // they use. At 100% every Premium customer reads their whole limit; above 100% the extra
  // pages are charged one by one.
  const premiumLimit = Math.max(inputs.premiumPageLimit, 0);
  const premiumPages = premiumLimit * (clamp(inputs.premiumUsagePct, 0, 200) / 100);
  const premiumExtra = extraPages(premiumPages, premiumLimit) * PREMIUM_EXTRA_PAGE_PRICE;
  const premiumShare = clamp(inputs.premiumSharePct, 0, 100) / 100;
  const partnerRunPrice = Math.round(inputs.runPrice * (1 - PARTNER_DISCOUNT));

  const years: YearResult[] = [];

  for (let yearIndex = 0; yearIndex < yearCount; yearIndex++) {
    const result = emptyYear(yearIndex + 1);

    for (let month = yearIndex * 12 + 1; month <= (yearIndex + 1) * 12; month++) {
      const customers = Math.round(customersAtMonth(month, inputs));
      const signups = Math.max(
        customersAtMonth(month, inputs) - customersAtMonth(month - 1, inputs) * (1 - MONTHLY_CHURN),
        0,
      );
      const premium = customers * premiumShare;
      const regular = customers - premium;
      const storageAddOns = regular * STORAGE_ADDON_SHARE;
      const partners = PARTNERS_TARGET * Math.min(month / PARTNERS_TARGET_MONTH, 1);
      const accounts = customers + partners;

      const parser =
        regular * runsPerMonth * (inputs.runPrice + extraPerRun) +
        premium * (inputs.premiumPrice + premiumExtra) +
        partners * runsPerMonth * (partnerRunPrice + extraPerRun);
      const storage = storageAddOns * inputs.storagePrice;

      const adsOn = inputs.includeAds && month >= ADS_START_MONTH;
      const boosts = adsOn ? partners * BOOST_UPTAKE * BOOST_MONTHLY : 0;
      const lenderAds = adsOn
        ? (accounts * AD_VIEWS_PER_ACCOUNT * AD_FILL * AD_PRICE_PER_THOUSAND) / 1_000
        : 0;
      const ads = boosts + lenderAds;

      const subscriptionsOn = inputs.includeSubscriptions && month >= SUBSCRIPTIONS_START_MONTH;
      const researchSubscribers = subscriptionsOn
        ? RESEARCH_SUBSCRIBERS_START +
          ((RESEARCH_SUBSCRIBERS_MONTH_36 - RESEARCH_SUBSCRIBERS_START) *
            (month - SUBSCRIPTIONS_START_MONTH)) /
            (36 - SUBSCRIPTIONS_START_MONTH)
        : 0;
      const subscriptions = subscriptionsOn
        ? researchSubscribers * RESEARCH_PRICE + accounts * NEWSLETTER_UPTAKE * NEWSLETTER_PRICE
        : 0;

      const revenue = parser + storage + ads + subscriptions;

      const runs = (regular + partners) * runsPerMonth + premium * runsPerMonth + signups;
      const pages =
        (regular + partners) * runsPerMonth * pagesPerRun +
        premium * premiumPages +
        signups * TRIAL_PAGES;
      // Trigger.dev bills its plan fee or the usage, whichever is higher.
      const jobs = Math.max(
        pages * jobsPerPage + runs * JOBS_COST_PER_RUN,
        TRIGGER.planUsdMonthly * PESOS_PER_USD,
      );
      const gigabytes = (regular + partners) * 0.3 + premium * 15 + storageAddOns * 5;

      result.customers = customers;
      result.partners = Math.round(partners);
      result.pages += pages;
      result.revenue.parser += parser;
      result.revenue.storage += storage;
      result.revenue.ads += ads;
      result.revenue.subscriptions += subscriptions;
      result.revenue.total += revenue;
      result.costs.ai += pages * costPerPage;
      result.costs.jobs += jobs;
      result.costs.cloud +=
        cloudMonthly(accounts, gigabytes) + (subscriptionsOn ? RESEARCH_HOSTING_MONTHLY : 0);
      // Every payment pays the share; each one also pays the fixed fee. Ads are invoiced by bank
      // transfer, so they pay neither.
      const payments =
        (regular + partners) * runsPerMonth +
        premium +
        storageAddOns +
        (adsOn ? (partners * BOOST_UPTAKE * 52) / 12 : 0) +
        (subscriptionsOn ? researchSubscribers + accounts * NEWSLETTER_UPTAKE : 0);
      result.costs.fees +=
        (Math.max(inputs.paymentFeePct, 0) / 100) * (revenue - lenderAds) +
        payments * Math.max(inputs.paymentFeeFixedUsd, 0) * PESOS_PER_USD;
      result.costs.marketing += (Math.max(inputs.marketingPct, 0) / 100) * revenue;
      result.costs.team += (Math.max(inputs.teamPct, 0) / 100) * revenue;
      result.costs.fixed += Math.max(inputs.fixedMonthly, 0);
    }

    const { costs, revenue } = result;
    costs.total =
      costs.ai + costs.jobs + costs.cloud + costs.fees + costs.marketing + costs.team + costs.fixed;

    // Business tax: 3% percentage tax up to ₱3M of yearly revenue, VAT above it. Input VAT is
    // claimed on AI, cloud, fees, marketing and the non-salary half of team costs.
    if (revenue.total > VAT_THRESHOLD) {
      const vatable =
        costs.ai + costs.jobs + costs.cloud + costs.fees + costs.marketing + costs.team / 2;
      result.businessTaxKind = "VAT";
      result.businessTax = Math.max(((revenue.total - vatable) * 12) / 112, 0);
    } else {
      result.businessTax = revenue.total * 0.03;
    }

    const profitBeforeIncomeTax = revenue.total - costs.total - result.businessTax;
    const incomeTaxRate = profitBeforeIncomeTax <= SMALL_CORPORATION_INCOME ? 0.2 : 0.25;
    result.incomeTax = Math.max(profitBeforeIncomeTax, 0) * incomeTaxRate;
    result.netProfit = profitBeforeIncomeTax - result.incomeTax;
    result.margin = revenue.total > 0 ? result.netProfit / revenue.total : 0;
    years.push(result);
  }

  const revenue: RevenueByStream = { parser: 0, storage: 0, ads: 0, subscriptions: 0, total: 0 };
  let costs = 0;
  let taxes = 0;
  let netProfit = 0;
  for (const year of years) {
    revenue.parser += year.revenue.parser;
    revenue.storage += year.revenue.storage;
    revenue.ads += year.revenue.ads;
    revenue.subscriptions += year.revenue.subscriptions;
    revenue.total += year.revenue.total;
    costs += year.costs.total;
    taxes += year.businessTax + year.incomeTax;
    netProfit += year.netProfit;
  }

  return {
    aiCostPerPage: costPerPage,
    jobsCostPerPage: jobsPerPage,
    years,
    totals: {
      customers: years.at(-1)?.customers ?? 0,
      revenue,
      costs,
      taxes,
      netProfit,
      margin: revenue.total > 0 ? netProfit / revenue.total : 0,
    },
  };
}

/** One Premium customer's month: what their pages cost us and what we keep. */
export interface PremiumMonth {
  /** Pages read in the month: the limit times the share of it used. */
  pages: number;
  /** What the pages over the limit bring in. */
  extraRevenue: number;
  aiCost: number;
  jobsCost: number;
  paymentFee: number;
  /** Price and extras less the payment fee, AI and Trigger.dev. Cloud, team and marketing come
   *  out of this. */
  kept: number;
  /** `kept` as a share of what the customer paid. */
  keptShare: number;
  /** Pages a month at which costs eat the whole Premium price (before any extras). */
  breakEvenPages: number;
}

export function premiumMonth(inputs: ModelInputs): PremiumMonth {
  const perPage = aiCostPerPage(inputs.reader, inputs.recheckSharePct) + jobsCostPerPage(inputs);
  const price = Math.max(inputs.premiumPrice, 0);
  const limit = Math.max(inputs.premiumPageLimit, 0);
  const pages = limit * (clamp(inputs.premiumUsagePct, 0, 200) / 100);
  const extraRevenue = extraPages(pages, limit) * PREMIUM_EXTRA_PAGE_PRICE;
  const paid = price + extraRevenue;
  const aiCost = pages * aiCostPerPage(inputs.reader, inputs.recheckSharePct);
  const jobsCost = pages * jobsCostPerPage(inputs) + JOBS_COST_PER_RUN;
  const fee = paymentFee(inputs, paid);
  const kept = paid - fee - aiCost - jobsCost;
  return {
    pages,
    extraRevenue,
    aiCost,
    jobsCost,
    paymentFee: fee,
    kept,
    keptShare: paid > 0 ? kept / paid : 0,
    breakEvenPages: perPage > 0 ? (price - paymentFee(inputs, price)) / perPage : Infinity,
  };
}

/** One regular (or partner) run: what the customer pays and what is left after its costs. */
export interface RunEconomics {
  pages: number;
  basePrice: number;
  /** What the pages over the run's limit bring in. */
  extraRevenue: number;
  aiCost: number;
  jobsCost: number;
  paymentFee: number;
  kept: number;
  keptShare: number;
}

export function runEconomics(inputs: ModelInputs, partner = false): RunEconomics {
  const pages = Math.max(inputs.pagesPerRun, 0);
  const basePrice = partner
    ? Math.round(inputs.runPrice * (1 - PARTNER_DISCOUNT))
    : inputs.runPrice;
  const extraRevenue = extraPages(pages, RUN_PAGE_LIMIT) * EXTRA_PAGE_PRICE;
  const paid = basePrice + extraRevenue;
  const aiCost = pages * aiCostPerPage(inputs.reader, inputs.recheckSharePct);
  const jobsCost = pages * jobsCostPerPage(inputs) + JOBS_COST_PER_RUN;
  const fee = paymentFee(inputs, paid);
  const kept = paid - fee - aiCost - jobsCost;
  return {
    pages,
    basePrice,
    extraRevenue,
    aiCost,
    jobsCost,
    paymentFee: fee,
    kept,
    keptShare: paid > 0 ? kept / paid : 0,
  };
}

/** One row of the Premium limit comparison. */
export interface LimitComparison {
  limit: number;
  month: PremiumMonth;
  /** AI cost over the whole plan. */
  planAiCost: number;
  /** Net profit over the whole plan at the chosen usage. */
  planNetProfit: number;
  /** Net profit over the whole plan if every Premium customer uses their full limit. */
  planNetProfitFullUse: number;
}

/**
 * Runs the plan once per Premium limit, with every other input unchanged, so limits can be
 * compared side by side (for example 300 against 1,000 pages a month).
 */
export function compareLimits(inputs: ModelInputs, limits: number[]): LimitComparison[] {
  return limits.map((limit) => {
    const atUsage = runModel({ ...inputs, premiumPageLimit: limit });
    const fullUse = runModel({ ...inputs, premiumPageLimit: limit, premiumUsagePct: 100 });
    return {
      limit,
      month: premiumMonth({ ...inputs, premiumPageLimit: limit }),
      planAiCost: atUsage.years.reduce((sum, year) => sum + year.costs.ai, 0),
      planNetProfit: atUsage.totals.netProfit,
      planNetProfitFullUse: fullUse.totals.netProfit,
    };
  });
}
