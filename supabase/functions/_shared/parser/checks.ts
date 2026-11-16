/**
 * Arithmetic and format checks run on every document the AI reads. A failed check marks the
 * document unsure even when the model was confident, because confident-but-wrong readings are
 * the errors a second model alone does not catch.
 */

import type { ExtractedDocument } from "./schema.ts";

export type CheckFlag =
  | "low_confidence"
  | "vat_mismatch"
  | "tin_format"
  | "missing_amount"
  | "missing_date"
  | "outside_period"
  | "unusual_withholding_rate"
  | "not_a_document"
  | "pages_not_paid";

export const CHECK_FLAG_TEXT: Record<CheckFlag, string> = {
  low_confidence: "The AI was not sure about a key figure.",
  vat_mismatch: "The VAT is not 12/112 of the total.",
  tin_format: "A TIN does not look like a valid TIN.",
  missing_amount: "No amount was found.",
  missing_date: "No date was found.",
  outside_period: "The date is outside the period being filed.",
  unusual_withholding_rate: "The tax withheld is not a standard rate (1, 2, 5, 10 or 15%).",
  not_a_document: "This does not look like a receipt, invoice or Form 2307.",
  pages_not_paid:
    "This PDF has more pages than were counted at upload; only the pages paid for were read.",
};

/** Below this, a field counts as unsure. Tune on the 200-document test set. */
export const CONFIDENCE_THRESHOLD = 0.8;

const TIN_PATTERN = /^\d{9}(\d{3,5})?$/;
const STANDARD_RATES = [0.01, 0.02, 0.05, 0.1, 0.15];

/** "123-456-789-000" -> "123456789000"; null when it is not a TIN. */
export function normalizeTin(tin: string | null | undefined): string | null {
  if (!tin) return null;
  const digits = tin.replace(/[\s-]/g, "");
  return TIN_PATTERN.test(digits) ? digits : null;
}

/** VAT shown on an invoice should be 12/112 of the VAT-inclusive total, within ₱1. */
export function vatMatchesTotal(total: number, vat: number): boolean {
  return Math.abs(total * (12 / 112) - vat) <= 1;
}

/** Tax withheld on a 2307 should be a standard rate of the income payment, within 0.2%. */
export function isStandardWithholdingRate(incomePayment: number, taxWithheld: number): boolean {
  if (incomePayment <= 0) return false;
  const rate = taxWithheld / incomePayment;
  return STANDARD_RATES.some((standard) => Math.abs(rate - standard) <= 0.002);
}

export function checkDocument(
  doc: ExtractedDocument,
  period?: { start: string; end: string },
): CheckFlag[] {
  const flags: CheckFlag[] = [];
  if (doc.kind === "unknown") return ["not_a_document"];
  if (doc.kind === "cor") return [];

  const { amount, tin, date, kind } = doc.confidence;
  if (Math.min(amount, tin, date, kind) < CONFIDENCE_THRESHOLD) flags.push("low_confidence");

  for (const value of [doc.issuerTin, doc.recipientTin]) {
    if (value && !normalizeTin(value)) {
      flags.push("tin_format");
      break;
    }
  }

  const docDate = doc.kind === "form_2307" ? (doc.periodTo ?? doc.date) : doc.date;
  if (!docDate) flags.push("missing_date");
  else if (period && (docDate < period.start || docDate > period.end)) flags.push("outside_period");

  if (doc.kind === "form_2307") {
    if (!doc.incomePayment || !doc.taxWithheld) flags.push("missing_amount");
    else if (!isStandardWithholdingRate(doc.incomePayment, doc.taxWithheld)) {
      flags.push("unusual_withholding_rate");
    }
  } else {
    if (!doc.totalAmount || doc.totalAmount <= 0) flags.push("missing_amount");
    else if (
      doc.vatAmount &&
      doc.vatAmount > 0 &&
      !vatMatchesTotal(doc.totalAmount, doc.vatAmount)
    ) {
      flags.push("vat_mismatch");
    }
  }
  return flags;
}

/** The fields that decide the tax. Two readings agree only when all of these match. */
export function sameTaxFields(a: ExtractedDocument, b: ExtractedDocument): boolean {
  const money = (x: number | null, y: number | null) =>
    x === null || y === null ? x === y : Math.abs(x - y) < 0.01;
  return (
    a.kind === b.kind &&
    a.date === b.date &&
    normalizeTin(a.issuerTin) === normalizeTin(b.issuerTin) &&
    money(a.totalAmount, b.totalAmount) &&
    money(a.vatAmount, b.vatAmount) &&
    money(a.taxWithheld, b.taxWithheld) &&
    money(a.incomePayment, b.incomePayment)
  );
}
