/**
 * Takatax what-if financial model.
 *
 * A pure function: the same inputs always give the same numbers, so the deck's sliders and
 * the unit tests share one source of truth. Fixed assumptions come from the Takatax
 * feasibility study; the adjustable ones are the fields of `ModelInputs`.
 */

/** Operating micro enterprises in the Philippines (PSA 2023 List of Establishments, via DTI). */
export const MICRO_ENTERPRISES = 1_127_058;

/** Estimated AI cost per document for each model in the reader, in pesos. */
export const COST_PER_DOC = { flash: 0.17, haiku: 0.05, pro: 0.62 } as const;

/** Share of re-read documents that still disagree and go on to the top model. */
const ESCALATION_SHARE = 0.4;

const PESOS_PER_USD = 63;
const MONTHLY_CHURN = 0.02;
const TRIAL_DOCS = 11; // the COR plus 10 documents
const RUN_DOC_LIMIT = 250;
const PREMIUM_DOC_LIMIT = 300;
const STORAGE_ADDON_SHARE = 50 / 900; // of regular customers
const PARTNER_DISCOUNT = 0.25;
const PARTNERS_TARGET = 1_608; // 20% of BIR-accredited tax agents, plus CPAs at half that
const PARTNERS_TARGET_MONTH = 36;
const PAYMENT_FEE = 0.025;

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
  /** Price of one parse run, in pesos. */
  runPrice: number;
  /** Price of one Premium month, in pesos. */
  premiumPrice: number;
  /** Price of one 5 GB storage month, in pesos. */
  storagePrice: number;
  /** Parse runs a regular customer buys per year. */
  runsPerYear: number;
  /** Average documents in a parse run. */
  docsPerRun: number;
  /** Share of customers on the Premium plan, in percent. */
  premiumSharePct: number;
  /** Which models read the documents. */
  reader: ReaderMode;
  /** Share of documents that need a second read (three-step reader only), in percent. */
  recheckSharePct: number;
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
  runPrice: 199,
  premiumPrice: 800,
  storagePrice: 250,
  runsPerYear: 6,
  docsPerRun: 100,
  premiumSharePct: 10,
  reader: "pipeline",
  recheckSharePct: 50,
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
  /** Documents read during the year. */
  documents: number;
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
  aiCostPerDoc: number;
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

/** Estimated AI cost of reading one document, in pesos. */
export function aiCostPerDocument(reader: ReaderMode, recheckSharePct: number): number {
  if (reader === "flash") return COST_PER_DOC.flash;
  if (reader === "pro") return COST_PER_DOC.pro;
  const recheck = clamp(recheckSharePct, 0, 100) / 100;
  return (
    COST_PER_DOC.flash +
    recheck * COST_PER_DOC.haiku +
    recheck * ESCALATION_SHARE * COST_PER_DOC.pro
  );
}

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
    documents: 0,
    revenue: { parser: 0, storage: 0, ads: 0, subscriptions: 0, total: 0 },
    costs: { ai: 0, cloud: 0, fees: 0, marketing: 0, team: 0, fixed: 0, total: 0 },
    businessTaxKind: "3% percentage tax",
    businessTax: 0,
    incomeTax: 0,
    netProfit: 0,
    margin: 0,
  };
}

export function runModel(inputs: ModelInputs): ModelResult {
  const yearCount = Math.max(Math.round(inputs.years), 1);
  const costPerDoc = aiCostPerDocument(inputs.reader, inputs.recheckSharePct);
  const runsPerMonth = Math.max(inputs.runsPerYear, 0) / 12;
  const docsPerRun = clamp(inputs.docsPerRun, 0, RUN_DOC_LIMIT);
  const premiumDocs = PREMIUM_DOC_LIMIT * (docsPerRun / RUN_DOC_LIMIT);
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
        regular * runsPerMonth * inputs.runPrice +
        premium * inputs.premiumPrice +
        partners * runsPerMonth * partnerRunPrice;
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

      const documents =
        (regular + partners) * runsPerMonth * docsPerRun +
        premium * premiumDocs +
        signups * TRIAL_DOCS;
      const gigabytes = (regular + partners) * 0.3 + premium * 15 + storageAddOns * 5;

      result.customers = customers;
      result.partners = Math.round(partners);
      result.documents += documents;
      result.revenue.parser += parser;
      result.revenue.storage += storage;
      result.revenue.ads += ads;
      result.revenue.subscriptions += subscriptions;
      result.revenue.total += revenue;
      result.costs.ai += documents * costPerDoc;
      result.costs.cloud +=
        cloudMonthly(accounts, gigabytes) + (subscriptionsOn ? RESEARCH_HOSTING_MONTHLY : 0);
      result.costs.fees += PAYMENT_FEE * (revenue - lenderAds); // ads are invoiced by bank transfer
      result.costs.marketing += (Math.max(inputs.marketingPct, 0) / 100) * revenue;
      result.costs.team += (Math.max(inputs.teamPct, 0) / 100) * revenue;
      result.costs.fixed += Math.max(inputs.fixedMonthly, 0);
    }

    const { costs, revenue } = result;
    costs.total = costs.ai + costs.cloud + costs.fees + costs.marketing + costs.team + costs.fixed;

    // Business tax: 3% percentage tax up to ₱3M of yearly revenue, VAT above it. Input VAT is
    // claimed on AI, cloud, fees, marketing and the non-salary half of team costs.
    if (revenue.total > VAT_THRESHOLD) {
      const vatable = costs.ai + costs.cloud + costs.fees + costs.marketing + costs.team / 2;
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
    aiCostPerDoc: costPerDoc,
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
