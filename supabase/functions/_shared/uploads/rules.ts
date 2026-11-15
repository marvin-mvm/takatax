/**
 * Upload limits and run pricing, shared by the upload screen (to show the price before paying)
 * and the edge function (to enforce it). Prices are in pesos.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 300;

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

export const PRICING = {
  runPrice: 199,
  runDocuments: 250,
  extraDocument: 2,
  /** Bookkeepers, CPAs and tax lawyers pay 25% less for their clients' runs. */
  partnerDiscount: 0.25,
  trialDocuments: 10,
  premiumMonthly: 800,
  premiumDocuments: 1_000,
  premiumStorageGb: 15,
  storageAddOnMonthly: 250,
  storageAddOnGb: 5,
  freeStorageMb: 300,
} as const;

export type FileProblem = "type" | "size" | "empty";

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  type: "Only photos (JPEG, PNG, WebP, HEIC) and PDFs can be read.",
  size: "This file is over 10 MB. Take the photo again or split the PDF.",
  empty: "This file is empty.",
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

export interface RunQuote {
  documents: number;
  /** Covered by the free trial, a Premium month, or the run itself. */
  included: number;
  extra: number;
  basePrice: number;
  extraPrice: number;
  total: number;
  /** One line for the pay button, for example "₱199 + 12 × ₱2". */
  summary: string;
}

/**
 * The price of reading `documents` documents in one run. The free trial covers the first 10
 * documents of an account once; a Premium month covers its monthly allowance.
 */
export function quoteRun(
  documents: number,
  options: { partner?: boolean; trialAvailable?: boolean; premiumRemaining?: number } = {},
): RunQuote {
  const count = Math.max(Math.floor(documents), 0);
  if (options.trialAvailable && count <= PRICING.trialDocuments) {
    return {
      documents: count,
      included: count,
      extra: 0,
      basePrice: 0,
      extraPrice: 0,
      total: 0,
      summary: "Free trial",
    };
  }
  if (options.premiumRemaining !== undefined && count <= options.premiumRemaining) {
    return {
      documents: count,
      included: count,
      extra: 0,
      basePrice: 0,
      extraPrice: 0,
      total: 0,
      summary: "Included in Premium",
    };
  }
  const discount = options.partner ? 1 - PRICING.partnerDiscount : 1;
  const basePrice = count === 0 ? 0 : Math.round(PRICING.runPrice * discount);
  const extra = Math.max(count - PRICING.runDocuments, 0);
  const extraPrice = extra * PRICING.extraDocument;
  const summary =
    count === 0
      ? "No documents yet"
      : extra > 0
        ? `₱${basePrice} + ${extra} × ₱${PRICING.extraDocument}`
        : `₱${basePrice} for up to ${PRICING.runDocuments} documents`;
  return {
    documents: count,
    included: Math.min(count, PRICING.runDocuments),
    extra,
    basePrice,
    extraPrice,
    total: basePrice + extraPrice,
    summary,
  };
}
