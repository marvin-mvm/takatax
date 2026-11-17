/**
 * Upload limits and run pricing, shared by the upload screen (to show the price before paying)
 * and the edge function (to enforce it). Prices are in pesos.
 */

/** One file: big enough for long PDF statements; R2 takes up to 5 GiB in a single upload. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
/** One upload batch, all files together. Files go straight from the browser to R2. */
export const MAX_BATCH_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 1_000;
/** Pages in one PDF. Each page is read by the AI, so very long files are split first. */
export const MAX_PDF_PAGES = 1_000;

export const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

/** For the file picker's `accept` attribute. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_TYPES, ".heic", ".heif"].join(",");

/**
 * The payments switch.
 *
 * false (launch, today): every account's first Standard run, 80 pages, is free. The pages are
 * counted across uploads (a photo is one page, a PDF every page) until the 80 are used. More
 * pages (₱3.50 each) and Premium (₱649 a month) show "coming soon" and cannot be bought, on the
 * screens and on the server.
 *
 * true: the full pricing below applies (trial, ₱149 runs, partner price, extra pages, Premium),
 * paid through Xendit (supabase/functions/_lib/payments.ts). Set it once Xendit is connected,
 * then redeploy the site and the edge functions.
 */
export const PAYMENTS_LIVE = false;

/**
 * Prices in pesos. Runs are counted in pages: a photo is one page and a PDF counts every page,
 * because the AI reads each page.
 */
export const PRICING = {
  runPrice: 149,
  /** Pages a Standard run includes. */
  runPages: 80,
  /** Each page over a Standard run's limit. */
  extraPage: 3.5,
  /** Bookkeepers, CPAs and tax lawyers pay 25% less for their clients' runs. */
  partnerDiscount: 0.25,
  trialPages: 10,
  premiumMonthly: 649,
  /** Pages a Premium month includes. */
  premiumPages: 300,
  /** Each page over a Premium month's limit. */
  premiumExtraPage: 2.65,
  premiumStorageGb: 15,
  storageAddOnMonthly: 250,
  storageAddOnGb: 5,
  freeStorageMb: 300,
} as const;

/** What a bookkeeper, CPA or tax lawyer pays for a client's run, in whole pesos. */
export const PARTNER_RUN_PRICE = Math.round(PRICING.runPrice * (1 - PRICING.partnerDiscount));

/** An amount of pesos to the centavo, without floating-point leftovers. */
const toCentavo = (amount: number) => Math.round(amount * 100) / 100;

/** "₱149", "₱3.50", "₱1,234.50": whole pesos stay short, anything else shows its centavos. */
export function pesoText(amount: number): string {
  const value = toCentavo(amount);
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export type FileProblem = "type" | "size" | "empty" | "pdf" | "pages";

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  type: "Only photos (JPEG, PNG, WebP, HEIC) and PDFs can be read.",
  size: "This file is over 200 MB. Split the PDF into smaller files.",
  empty: "This file is empty.",
  pdf: "This PDF could not be opened. It may be damaged or protected with a password.",
  pages: `This PDF has more than ${MAX_PDF_PAGES.toLocaleString("en-PH")} pages. Split it into smaller files.`,
};

export function checkFile(file: { name: string; type: string; size: number }): FileProblem | null {
  if (file.size === 0) return "empty";
  if (file.size > MAX_FILE_BYTES) return "size";
  const type = file.type.toLowerCase();
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const accepted =
    (ACCEPTED_TYPES as readonly string[]).includes(type) || ["heic", "heif"].includes(extension);
  return accepted ? null : "type";
}

export type RunPlan = "free" | "trial" | "premium" | "standard" | "partner";

/**
 * An account's Standard pages so far. A run adds pages (80 for each run, 10 for the free trial,
 * each extra page bought) and every page sent for reading uses one, across uploads: pages a run
 * did not use stay for the next upload. Premium's pages are counted by the month instead.
 */
export interface StandardPages {
  /** Pages the account's runs have added. */
  added: number;
  /** Pages already sent for reading against them. */
  used: number;
}

/**
 * How many Standard pages an account has and has left.
 * - Launch: the first run is free and adds 80 pages, so an account that has none yet has 80.
 * - Payments live: what its runs added, plus the free trial's 10 pages while they are unused.
 */
export function pagesLeft(
  standard: StandardPages | undefined,
  options: { trialAvailable?: boolean; paymentsLive?: boolean } = {},
): { limit: number; used: number; left: number } {
  const added = Math.max(Math.floor(standard?.added ?? 0), 0);
  const used = Math.max(Math.floor(standard?.used ?? 0), 0);
  const limit = !(options.paymentsLive ?? PAYMENTS_LIVE)
    ? added > 0
      ? added
      : PRICING.runPages
    : added + (options.trialAvailable ? PRICING.trialPages : 0);
  return { limit, used, left: Math.max(limit - used, 0) };
}

export interface RunQuote {
  pages: number;
  plan: RunPlan;
  /** Pages this run can read before the price per extra page applies. */
  limit: number;
  /** Pages covered by the pages left, the trial, the run price or Premium. */
  included: number;
  /** Pages over the limit. */
  extra: number;
  /** The price of each page over the limit on this plan. */
  extraRate: number;
  basePrice: number;
  extraPrice: number;
  total: number;
  /** One line for the price, for example "₱149 + 12 × ₱3.50". */
  summary: string;
  /** True when the run needs something that is not on sale yet (extra pages at launch). */
  blocked: boolean;
  /** Standard pages this run adds to the account: a run's 80, the trial's 10, extra pages. */
  pagesAdded: number;
  /** True when this run takes the account's free trial. */
  usesTrial: boolean;
  /** The pages the run is counted against: the account's Standard pages, or Premium's month. */
  allowance: number;
  /** Pages left on the account once this run is read. */
  leftAfter: number;
}

/**
 * The price of reading `pages` pages, counted against the account's pages:
 * - Launch (PAYMENTS_LIVE false): the first Standard run of 80 pages is free. Pages are used
 *   across uploads; when they run out, more pages are "coming soon" and the run is blocked.
 * - Premium: the pages left in the month are included, then ₱2.65 a page.
 * - Standard (and partner, 25% off the ₱149): pages left from earlier runs are used first, then
 *   the free trial's 10 pages (once, not for partners); when more are needed, a new run of 80
 *   pages for ₱149, then ₱3.50 a page. Pages a run does not use stay on the account.
 */
export function quoteRun(
  pages: number,
  options: {
    partner?: boolean;
    trialAvailable?: boolean;
    premiumRemaining?: number;
    paymentsLive?: boolean;
    /** The account's Standard pages so far. Left out, the account is taken as new. */
    standard?: StandardPages;
  } = {},
): RunQuote {
  const count = Math.max(Math.floor(pages), 0);
  const added = Math.max(Math.floor(options.standard?.added ?? 0), 0);
  const used = Math.max(Math.floor(options.standard?.used ?? 0), 0);

  if (!(options.paymentsLive ?? PAYMENTS_LIVE)) {
    const { limit, left } = pagesLeft({ added, used }, { paymentsLive: false });
    const extra = Math.max(count - left, 0);
    return {
      pages: count,
      plan: "free",
      limit: left,
      included: count - extra,
      extra,
      extraRate: PRICING.extraPage,
      basePrice: 0,
      extraPrice: toCentavo(extra * PRICING.extraPage),
      total: 0,
      summary:
        extra > 0
          ? left > 0
            ? `${left.toLocaleString("en-PH")} free pages left; extra pages coming soon`
            : `Your ${limit.toLocaleString("en-PH")} free pages are used; extra pages coming soon`
          : "Free during launch",
      blocked: extra > 0,
      // The free run of 80 pages is given with the account's first run.
      pagesAdded: added > 0 || count === 0 || extra > 0 ? 0 : PRICING.runPages,
      usesTrial: false,
      allowance: limit,
      leftAfter: Math.max(left - count, 0),
    };
  }

  if (options.premiumRemaining !== undefined) {
    const limit = Math.max(Math.floor(options.premiumRemaining), 0);
    const extra = Math.max(count - limit, 0);
    const extraPrice = toCentavo(extra * PRICING.premiumExtraPage);
    return {
      pages: count,
      plan: "premium",
      limit,
      included: count - extra,
      extra,
      extraRate: PRICING.premiumExtraPage,
      basePrice: 0,
      extraPrice,
      total: extraPrice,
      summary:
        extra > 0
          ? `Premium + ${extra} × ${pesoText(PRICING.premiumExtraPage)}`
          : "Included in Premium",
      blocked: false,
      pagesAdded: 0,
      usesTrial: false,
      allowance: PRICING.premiumPages,
      leftAfter: Math.max(limit - count, 0),
    };
  }

  // Standard: the pages left first, then the free trial, then a new run.
  const left = Math.max(added - used, 0);
  const trial = options.trialAvailable && !options.partner ? PRICING.trialPages : 0;
  const usesTrial = trial > 0 && count > left;
  const free = left + (usesTrial ? trial : 0);
  const need = Math.max(count - free, 0);
  const buys = need > 0;
  const discount = options.partner ? 1 - PRICING.partnerDiscount : 1;
  const basePrice = buys ? Math.round(PRICING.runPrice * discount) : 0;
  const extra = buys ? Math.max(need - PRICING.runPages, 0) : 0;
  const extraPrice = toCentavo(extra * PRICING.extraPage);
  const pagesAdded = (usesTrial ? trial : 0) + (buys ? PRICING.runPages + extra : 0);
  return {
    pages: count,
    plan: buys
      ? options.partner
        ? "partner"
        : "standard"
      : usesTrial
        ? "trial"
        : options.partner
          ? "partner"
          : "standard",
    limit: buys ? free + PRICING.runPages : free,
    included: count - extra,
    extra,
    extraRate: PRICING.extraPage,
    basePrice,
    extraPrice,
    total: toCentavo(basePrice + extraPrice),
    summary:
      count === 0
        ? "No pages yet"
        : !buys
          ? usesTrial
            ? "Free trial"
            : "Covered by your pages left"
          : extra > 0
            ? `₱${basePrice} + ${extra} × ${pesoText(PRICING.extraPage)}`
            : `₱${basePrice} for up to ${PRICING.runPages} pages`,
    blocked: false,
    pagesAdded,
    usesTrial,
    allowance: added + pagesAdded,
    leftAfter: Math.max(added + pagesAdded - used - count, 0),
  };
}

/** What was picked for one upload: photos by format, PDFs and their pages. */
export interface BatchCounts {
  /** Photos, each one page. */
  images: number;
  /** True when every photo is a JPEG, so the message can say "JPG". */
  allJpeg: boolean;
  pdfs: number;
  /** Pages in all the PDFs together. */
  pdfPages: number;
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-PH")} ${count === 1 ? one : many}`;

/**
 * The message shown before reading starts, for example "You uploaded 10 JPG and 2 PDF files
 * with 50 total combined pages." and, when the pages left do not cover them, what is missing
 * and what it costs.
 */
export function batchMessage(counts: BatchCounts, quote: RunQuote): string[] {
  const parts: string[] = [];
  if (counts.images > 0) {
    parts.push(
      counts.allJpeg
        ? `${counts.images.toLocaleString("en-PH")} JPG`
        : plural(counts.images, "image"),
    );
  }
  if (counts.pdfs > 0) parts.push(plural(counts.pdfs, "PDF file"));
  const total = counts.images + counts.pdfPages;
  const lines = [
    `You uploaded ${parts.join(" and ")} with ${plural(total, "total combined page", "total combined pages")}.`,
  ];
  const soon = `Extra pages (${pesoText(quote.extraRate)} each) are coming soon`;
  if (quote.plan === "free") {
    if (quote.extra > 0) {
      lines.push(
        quote.limit > 0
          ? `You have ${plural(quote.limit, "page")} left of your ${quote.allowance.toLocaleString("en-PH")} free pages. ${soon}, so for now please remove ${plural(quote.extra, "page")}.`
          : `You have used your ${quote.allowance.toLocaleString("en-PH")} free pages. ${soon}.`,
      );
    }
  } else if (quote.plan === "trial") {
    lines.push("Your free trial covers them.");
  } else if (quote.extra > 0) {
    const where =
      quote.plan === "premium"
        ? `the ${quote.limit.toLocaleString("en-PH")} pages left in your Premium month`
        : quote.limit === PRICING.runPages
          ? `the ${quote.limit.toLocaleString("en-PH")} limit for a Standard run`
          : `the ${quote.limit.toLocaleString("en-PH")} pages your pages left and a new run cover`;
    lines.push(
      `It exceeded ${where}, so ${pesoText(quote.extraRate)} will be applied for each of the ${plural(quote.extra, "extra page")} (${pesoText(quote.extraPrice)}).`,
    );
  } else if (quote.total === 0 && quote.pages > 0 && quote.plan !== "premium") {
    lines.push("Your pages left cover them.");
  }
  return lines;
}
