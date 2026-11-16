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
 * false (launch, today): Standard runs of up to 250 pages are free for everyone, taxpayers and
 * partners. Pages over 250 (₱2 each) and Premium (₱800 a month) show "coming soon" and cannot
 * be bought, on the screens and on the server.
 *
 * true: the full pricing below applies (trial, ₱199 runs, partner price, ₱2 extra pages,
 * Premium), paid through Xendit (supabase/functions/_lib/payments.ts). Set it once Xendit is
 * connected, then redeploy the site and the edge functions.
 */
export const PAYMENTS_LIVE = false;

/**
 * Prices in pesos. Runs are counted in pages: a photo is one page and a PDF counts every page,
 * because the AI reads each page.
 */
export const PRICING = {
  runPrice: 199,
  /** Pages a Standard run includes. */
  runPages: 250,
  /** Each page over a run's (or a Premium month's) limit. */
  extraPage: 2,
  /** Bookkeepers, CPAs and tax lawyers pay 25% less for their clients' runs. */
  partnerDiscount: 0.25,
  trialPages: 10,
  premiumMonthly: 800,
  /** Pages a Premium month includes. */
  premiumPages: 1_000,
  premiumStorageGb: 15,
  storageAddOnMonthly: 250,
  storageAddOnGb: 5,
  freeStorageMb: 300,
} as const;

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

export interface RunQuote {
  pages: number;
  plan: RunPlan;
  /** Pages the plan covers before ₱2 a page applies (250 a run, Premium's pages left). */
  limit: number;
  /** Pages covered by the trial, the run price or Premium. */
  included: number;
  /** Pages over the limit, ₱2 each. */
  extra: number;
  basePrice: number;
  extraPrice: number;
  total: number;
  /** One line for the price, for example "₱199 + 12 × ₱2". */
  summary: string;
  /** True when the run needs something that is not on sale yet (pages over 250 at launch). */
  blocked: boolean;
}

/**
 * The price of reading `pages` pages in one run:
 * - free trial: the first 10 pages of an account, once;
 * - Premium: the pages left in the month are included, then ₱2 a page;
 * - Standard (and partner, 25% off the ₱199): 250 pages, then ₱2 a page.
 * While payments are not live (PAYMENTS_LIVE), a Standard run of up to 250 pages is free and
 * anything over 250 pages is blocked as "coming soon".
 */
export function quoteRun(
  pages: number,
  options: {
    partner?: boolean;
    trialAvailable?: boolean;
    premiumRemaining?: number;
    paymentsLive?: boolean;
  } = {},
): RunQuote {
  const count = Math.max(Math.floor(pages), 0);
  if (!(options.paymentsLive ?? PAYMENTS_LIVE)) {
    const extra = Math.max(count - PRICING.runPages, 0);
    return {
      pages: count,
      plan: "free",
      limit: PRICING.runPages,
      included: count - extra,
      extra,
      basePrice: 0,
      extraPrice: extra * PRICING.extraPage,
      total: 0,
      summary:
        extra > 0
          ? `Free up to ${PRICING.runPages} pages; extra pages coming soon`
          : "Free during launch",
      blocked: extra > 0,
    };
  }
  if (options.trialAvailable && count > 0 && count <= PRICING.trialPages) {
    return {
      pages: count,
      plan: "trial",
      limit: PRICING.trialPages,
      included: count,
      extra: 0,
      basePrice: 0,
      extraPrice: 0,
      total: 0,
      summary: "Free trial",
      blocked: false,
    };
  }
  if (options.premiumRemaining !== undefined) {
    const limit = Math.max(Math.floor(options.premiumRemaining), 0);
    const extra = Math.max(count - limit, 0);
    const extraPrice = extra * PRICING.extraPage;
    return {
      pages: count,
      plan: "premium",
      limit,
      included: count - extra,
      extra,
      basePrice: 0,
      extraPrice,
      total: extraPrice,
      summary: extra > 0 ? `Premium + ${extra} × ₱${PRICING.extraPage}` : "Included in Premium",
      blocked: false,
    };
  }
  const discount = options.partner ? 1 - PRICING.partnerDiscount : 1;
  const basePrice = count === 0 ? 0 : Math.round(PRICING.runPrice * discount);
  const extra = Math.max(count - PRICING.runPages, 0);
  const extraPrice = extra * PRICING.extraPage;
  return {
    pages: count,
    plan: options.partner ? "partner" : "standard",
    limit: PRICING.runPages,
    included: Math.min(count, PRICING.runPages),
    extra,
    basePrice,
    extraPrice,
    total: basePrice + extraPrice,
    summary:
      count === 0
        ? "No pages yet"
        : extra > 0
          ? `₱${basePrice} + ${extra} × ₱${PRICING.extraPage}`
          : `₱${basePrice} for up to ${PRICING.runPages} pages`,
    blocked: false,
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
 * with 50 total combined pages." and, over the limit, which limit and what the extra pages cost.
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
  if (quote.plan === "free") {
    if (quote.extra > 0) {
      lines.push(
        `It exceeded the ${quote.limit.toLocaleString("en-PH")} limit for a Standard run. Extra pages (₱${PRICING.extraPage} each) are coming soon, so for now please remove ${plural(quote.extra, "page")} to keep this run to ${quote.limit.toLocaleString("en-PH")}.`,
      );
    }
  } else if (quote.plan === "trial") {
    lines.push("Your free trial covers them.");
  } else if (quote.extra > 0) {
    const where =
      quote.plan === "premium"
        ? `the ${quote.limit.toLocaleString("en-PH")} pages left in your Premium month`
        : `the ${quote.limit.toLocaleString("en-PH")} limit for a Standard run`;
    lines.push(
      `It exceeded ${where}, so ₱${PRICING.extraPage} will be applied for each of the ${plural(quote.extra, "extra page")} (₱${quote.extraPrice.toLocaleString("en-PH")}).`,
    );
  }
  return lines;
}
