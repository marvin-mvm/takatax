/**
 * Checking a reading by hand. When the reader is not sure of a document, the person looks at what
 * the AI read, corrects it and saves it; that is what counts from then on.
 *
 * - `savedReadings` turns `documents.extracted` back into readings, for the screen.
 * - A `ReviewDraft` is one reading as the form holds it (text boxes, so everything is a string).
 * - `reviewProblems` says what still has to be filled in; `reviewOutcome` gives the corrected
 *   readings and their ledger rows, which the database function `review_document` saves.
 *
 * Amounts in a draft are always pesos. A document printed in another currency whose exchange
 * rate could not be fetched starts with empty amounts, so $250 is never accepted as ₱250.
 */

import { CONFIDENCE_THRESHOLD, normalizeTin } from "./checks.ts";
import { type Conversion, PESO, isUnconverted } from "./currency.ts";
import { type LedgerRow, toLedgerRows } from "./ledger.ts";
import { type ExtractedDocument, parseExtraction } from "./schema.ts";

/** What a checked document can be. A COR is confirmed on its own screen. */
export type ReviewKind = "expense_receipt" | "sales_invoice" | "form_2307" | "unknown";

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  expense_receipt: "Receipt or purchase invoice (an expense)",
  sales_invoice: "Sales invoice (income)",
  form_2307: "Form 2307 (tax withheld from you)",
  unknown: "Not a tax document",
};

export const EXPENSE_CATEGORIES = [
  "cost_of_sales",
  "rent",
  "utilities",
  "communication",
  "supplies",
  "transportation",
  "professional_fees",
  "representation",
  "repairs",
  "taxes_licenses",
  "salaries",
  "equipment",
  "personal",
  "other",
] as const;

/** One reading as the form holds it. Amounts are pesos, dates "YYYY-MM-DD", "" when empty. */
export interface ReviewDraft {
  kind: ReviewKind;
  date: string;
  /** The other side: the supplier of an expense, the customer of a sale, the payor of a 2307. */
  name: string;
  tin: string;
  documentNumber: string;
  total: string;
  vat: string;
  category: string;
  periodFrom: string;
  periodTo: string;
  incomePayment: string;
  taxWithheld: string;
}

export type ReviewField = keyof ReviewDraft;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === "string" ? value : "");

function conversionOf(raw: unknown): Conversion | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const rate = num(c["rate"]);
  if (!str(c["currency"]) || rate === null || rate <= 0) return null;
  return {
    currency: str(c["currency"]),
    rate,
    rateDate: str(c["rateDate"]),
    source: str(c["source"]),
    totalAmount: num(c["totalAmount"]),
    vatAmount: num(c["vatAmount"]),
    incomePayment: num(c["incomePayment"]),
    taxWithheld: num(c["taxWithheld"]),
  };
}

/**
 * The readings saved with a finished document (`documents.extracted`). Anything else there (a
 * COR's details, a reading still in progress, nothing) gives an empty list.
 */
export function savedReadings(raw: unknown): ExtractedDocument[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ExtractedDocument[] => {
    const [reading] = parseExtraction({ documents: [item] });
    if (!reading) return [];
    const converted = conversionOf((item as { converted?: unknown }).converted);
    return [converted ? { ...reading, converted } : reading];
  });
}

const reviewKindOf = (reading: ExtractedDocument | null): ReviewKind =>
  reading && reading.kind !== "cor" ? reading.kind : "unknown";

/** "1250.5" for 1250.5, "" for nothing: what goes in an amount box. */
const amountText = (value: number | null): string =>
  value === null ? "" : String(Math.round(value * 100) / 100);

/** The other side of a document of this kind, as the AI read it. */
export function counterpartyOf(
  reading: ExtractedDocument | null,
  kind: ReviewKind,
): { name: string; tin: string } {
  if (!reading) return { name: "", tin: "" };
  return kind === "sales_invoice"
    ? { name: reading.recipientName ?? "", tin: reading.recipientTin ?? "" }
    : { name: reading.issuerName ?? "", tin: reading.issuerTin ?? "" };
}

/** What the form starts with: the reading as the AI left it, or an empty form. */
export function draftOf(reading: ExtractedDocument | null): ReviewDraft {
  const kind = reviewKindOf(reading);
  // Amounts still in another currency are not pesos: leave them for the person to type.
  const foreign = reading ? isUnconverted(reading) : false;
  const amount = (value: number | null | undefined) => (foreign ? "" : amountText(value ?? null));
  return {
    kind,
    date: reading?.date ?? "",
    ...counterpartyOf(reading, kind),
    documentNumber: reading?.documentNumber ?? "",
    total: amount(reading?.totalAmount),
    vat: amount(reading?.vatAmount),
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(reading?.expenseCategory ?? "")
      ? (reading?.expenseCategory ?? "")
      : "",
    periodFrom: reading?.periodFrom ?? "",
    periodTo: reading?.periodTo ?? "",
    incomePayment: amount(reading?.incomePayment),
    taxWithheld: amount(reading?.taxWithheld),
  };
}

/**
 * The boxes to point out to the person: where the AI was unsure, and what it could not find.
 * Only boxes shown for the reading's kind are listed.
 */
export function unsureFields(reading: ExtractedDocument | null): ReviewField[] {
  if (!reading) return [];
  const kind = reviewKindOf(reading);
  const fields = new Set<ReviewField>();
  const low = (score: number) => score < CONFIDENCE_THRESHOLD;
  if (kind === "unknown" || low(reading.confidence.kind)) fields.add("kind");
  if (kind === "unknown") return [...fields];

  const foreign = isUnconverted(reading);
  const withholding = kind === "form_2307";
  if (withholding) {
    if (low(reading.confidence.date) || !reading.periodTo) fields.add("periodTo");
    if (low(reading.confidence.amount) || foreign || !reading.incomePayment)
      fields.add("incomePayment");
    if (low(reading.confidence.amount) || foreign || !reading.taxWithheld)
      fields.add("taxWithheld");
  } else {
    if (low(reading.confidence.date) || !reading.date) fields.add("date");
    if (low(reading.confidence.amount) || foreign || !reading.totalAmount) fields.add("total");
    if (foreign && reading.vatAmount) fields.add("vat");
  }
  const { tin } = counterpartyOf(reading, kind);
  if (low(reading.confidence.tin) || (tin !== "" && !normalizeTin(tin))) fields.add("tin");
  return [...fields];
}

/** "1,234.50", "₱1234.5" or "1234" -> 1234.5; null when it is not an amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, "").replace(/^(php|p)/i, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** True for a real calendar day written "YYYY-MM-DD". */
export function isIsoDay(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const day = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === text;
}

const TIN_PROBLEM = "A TIN has 9 or 12 to 14 digits. Leave it empty if you cannot read it.";

/**
 * What is wrong with a draft, by box. Empty when it can be saved. `today` ("YYYY-MM-DD") catches
 * a date in the future, which is a misread year more often than a real document.
 */
export function reviewProblems(
  draft: ReviewDraft,
  today?: string,
): Partial<Record<ReviewField, string>> {
  const problems: Partial<Record<ReviewField, string>> = {};
  // Nothing more is asked of something that is not a tax document.
  if (draft.kind === "unknown") return problems;

  const day = (field: "date" | "periodFrom" | "periodTo", missing: string) => {
    const value = draft[field].trim();
    if (!value) problems[field] = missing;
    else if (!isIsoDay(value)) problems[field] = "This is not a real date.";
    else if (today && value > today) problems[field] = "This date is in the future.";
  };
  const amount = (field: "total" | "incomePayment" | "taxWithheld", missing: string) => {
    const value = parseAmount(draft[field]);
    if (!draft[field].trim()) problems[field] = missing;
    else if (value === null) problems[field] = "Enter an amount in pesos, for example 1250.50.";
    else if (value <= 0) problems[field] = "The amount must be more than zero.";
    return value;
  };

  if (draft.tin.trim() && !normalizeTin(draft.tin)) problems.tin = TIN_PROBLEM;

  if (draft.kind === "form_2307") {
    day("periodTo", "Enter the last day of the period the form covers.");
    if (draft.periodFrom.trim()) {
      day("periodFrom", "");
      if (!problems.periodFrom && !problems.periodTo && draft.periodFrom > draft.periodTo) {
        problems.periodFrom = "The period starts after it ends.";
      }
    }
    const income = amount("incomePayment", "Enter the total income payment.");
    const withheld = amount("taxWithheld", "Enter the total tax withheld.");
    if (income !== null && withheld !== null && withheld > income && !problems.taxWithheld) {
      problems.taxWithheld = "The tax withheld cannot be more than the income payment.";
    }
    return problems;
  }

  day("date", "Enter the date printed on the document.");
  const total = amount("total", "Enter the total amount.");
  if (draft.vat.trim()) {
    const vat = parseAmount(draft.vat);
    if (vat === null) problems.vat = "Enter the VAT in pesos, or leave it empty.";
    else if (total !== null && vat > total) problems.vat = "The VAT cannot be more than the total.";
  }
  return problems;
}

const text = (value: string): string | null => value.trim() || null;
const sameAmount = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.005;

/**
 * The reading as corrected by the person: every figure counts as certain, and the amounts are
 * pesos. What the AI read of the other party, and its note, are kept. The original conversion
 * from another currency is kept only while the peso amounts are the ones it produced.
 */
export function reviewedReading(
  draft: ReviewDraft,
  original: ExtractedDocument | null,
): ExtractedDocument {
  const certain = { amount: 1, tin: 1, date: 1, kind: 1 };
  const base: ExtractedDocument = {
    kind: "unknown",
    date: null,
    documentNumber: null,
    issuerName: null,
    issuerTin: null,
    recipientName: null,
    recipientTin: null,
    totalAmount: null,
    vatAmount: null,
    currency: PESO,
    expenseCategory: null,
    periodFrom: null,
    periodTo: null,
    incomePayment: null,
    taxWithheld: null,
    atc: null,
    confidence: certain,
    notes: null,
  };
  // Not a tax document: keep what was read, for the record, but nothing is counted.
  if (draft.kind === "unknown") {
    return { ...base, ...(original ?? {}), kind: "unknown", confidence: certain };
  }

  const party = { name: text(draft.name), tin: text(draft.tin) };
  const reading: ExtractedDocument = {
    ...base,
    kind: draft.kind,
    documentNumber: text(draft.documentNumber),
    issuerName: original?.issuerName ?? null,
    issuerTin: original?.issuerTin ?? null,
    recipientName: original?.recipientName ?? null,
    recipientTin: original?.recipientTin ?? null,
    atc: original?.atc ?? null,
    notes: original?.notes ?? null,
  };
  if (draft.kind === "sales_invoice") {
    reading.recipientName = party.name;
    reading.recipientTin = party.tin;
  } else {
    reading.issuerName = party.name;
    reading.issuerTin = party.tin;
  }

  if (draft.kind === "form_2307") {
    // The period decides the quarter the credit belongs to, so it is the record's date.
    reading.periodFrom = text(draft.periodFrom);
    reading.periodTo = text(draft.periodTo);
    reading.incomePayment = parseAmount(draft.incomePayment);
    reading.taxWithheld = parseAmount(draft.taxWithheld);
  } else {
    reading.date = text(draft.date);
    reading.totalAmount = parseAmount(draft.total);
    reading.vatAmount = draft.vat.trim() ? parseAmount(draft.vat) : null;
    if (draft.kind === "expense_receipt") reading.expenseCategory = text(draft.category);
  }

  const converted = original?.converted;
  if (
    converted &&
    original.kind === draft.kind &&
    sameAmount(original.totalAmount, reading.totalAmount) &&
    sameAmount(original.vatAmount, reading.vatAmount) &&
    sameAmount(original.incomePayment, reading.incomePayment) &&
    sameAmount(original.taxWithheld, reading.taxWithheld)
  ) {
    reading.currency = converted.currency;
    reading.converted = converted;
  }
  return reading;
}

export interface ReviewOutcome {
  /** The corrected readings, saved in place of the AI's. */
  readings: ExtractedDocument[];
  /** Their ledger rows. None when nothing in the file is a tax document. */
  rows: LedgerRow[];
}

/** What to save for a checked document: `drafts[i]` corrects `originals[i]` (null: typed in). */
export function reviewOutcome(
  drafts: ReviewDraft[],
  originals: (ExtractedDocument | null)[],
  accountId: string,
  documentId: string,
): ReviewOutcome {
  const readings = drafts.map((draft, index) => reviewedReading(draft, originals[index] ?? null));
  return {
    readings,
    rows: readings.flatMap((reading) => toLedgerRows(reading, accountId, documentId)),
  };
}
