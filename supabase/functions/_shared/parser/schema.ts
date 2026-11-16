/**
 * The JSON shape the AI must return for each uploaded file, and a dependency-free check of it.
 * The same schema is sent to OpenRouter as `response_format` so the model is held to it.
 */

export type DocumentKind = "sales_invoice" | "expense_receipt" | "form_2307" | "cor" | "unknown";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  sales_invoice: "Sales invoice",
  expense_receipt: "Receipt or purchase invoice",
  form_2307: "Form 2307 (withholding)",
  cor: "Certificate of Registration (COR)",
  unknown: "Not a tax document",
};

/** One document as read by the AI. Money is in pesos; dates are "YYYY-MM-DD". */
export interface ExtractedDocument {
  kind: DocumentKind;
  date: string | null;
  documentNumber: string | null;
  issuerName: string | null;
  issuerTin: string | null;
  recipientName: string | null;
  recipientTin: string | null;
  totalAmount: number | null;
  vatAmount: number | null;
  expenseCategory: string | null;
  /** Form 2307 only: the period covered and the totals. */
  periodFrom: string | null;
  periodTo: string | null;
  incomePayment: number | null;
  taxWithheld: number | null;
  atc: string | null;
  /** 0 to 1 for each figure that matters; drives the second read and the review screen. */
  confidence: { amount: number; tin: number; date: number; kind: number };
  notes: string | null;
}

/** What the AI reads off a Certificate of Registration (BIR Form 2303). */
export interface ExtractedRegistration {
  isCor: boolean;
  tin: string | null;
  registeredName: string | null;
  tradeName: string | null;
  rdoCode: string | null;
  registeredAddress: string | null;
  lineOfBusiness: string | null;
  registrationDate: string | null;
  /** Tax types as printed, for example "Income Tax", "Percentage Tax - Quarterly". */
  taxTypes: string[];
  vatRegistered: boolean;
  /** Only true when the COR says 8% or "in lieu of" in so many words. */
  eightPercentIndicated: boolean;
}

const nullable = (type: string) => ({ type: [type, "null"] });

/** JSON Schema for a list of documents, used as the structured-output format. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documents"],
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "date",
          "documentNumber",
          "issuerName",
          "issuerTin",
          "recipientName",
          "recipientTin",
          "totalAmount",
          "vatAmount",
          "expenseCategory",
          "periodFrom",
          "periodTo",
          "incomePayment",
          "taxWithheld",
          "atc",
          "confidence",
          "notes",
        ],
        properties: {
          kind: {
            type: "string",
            enum: ["sales_invoice", "expense_receipt", "form_2307", "cor", "unknown"],
          },
          date: nullable("string"),
          documentNumber: nullable("string"),
          issuerName: nullable("string"),
          issuerTin: nullable("string"),
          recipientName: nullable("string"),
          recipientTin: nullable("string"),
          totalAmount: nullable("number"),
          vatAmount: nullable("number"),
          expenseCategory: nullable("string"),
          periodFrom: nullable("string"),
          periodTo: nullable("string"),
          incomePayment: nullable("number"),
          taxWithheld: nullable("number"),
          atc: nullable("string"),
          confidence: {
            type: "object",
            additionalProperties: false,
            required: ["amount", "tin", "date", "kind"],
            properties: {
              amount: { type: "number" },
              tin: { type: "number" },
              date: { type: "number" },
              kind: { type: "number" },
            },
          },
          notes: nullable("string"),
        },
      },
    },
  },
} as const;

const KINDS = new Set<DocumentKind>([
  "sales_invoice",
  "expense_receipt",
  "form_2307",
  "cor",
  "unknown",
]);

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const score = (value: unknown): number => Math.min(Math.max(num(value) ?? 0, 0), 1);
const isoOrNull = (value: unknown): string | null => {
  const text = str(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) ? text.slice(0, 10) : null;
};

/**
 * Checks and tidies the model's JSON. Anything malformed becomes null with a low confidence
 * instead of throwing, so one bad field sends the document to review rather than failing the run.
 */
export function parseExtraction(raw: unknown): ExtractedDocument[] {
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { documents?: unknown }).documents)
      ? (raw as { documents: unknown[] }).documents
      : [];
  return list.flatMap((item): ExtractedDocument[] => {
    if (!item || typeof item !== "object") return [];
    const doc = item as Record<string, unknown>;
    const confidence = (doc["confidence"] ?? {}) as Record<string, unknown>;
    const kind = KINDS.has(doc["kind"] as DocumentKind) ? (doc["kind"] as DocumentKind) : "unknown";
    return [
      {
        kind,
        date: isoOrNull(doc["date"]),
        documentNumber: str(doc["documentNumber"]),
        issuerName: str(doc["issuerName"]),
        issuerTin: str(doc["issuerTin"]),
        recipientName: str(doc["recipientName"]),
        recipientTin: str(doc["recipientTin"]),
        totalAmount: num(doc["totalAmount"]),
        vatAmount: num(doc["vatAmount"]),
        expenseCategory: str(doc["expenseCategory"]),
        periodFrom: isoOrNull(doc["periodFrom"]),
        periodTo: isoOrNull(doc["periodTo"]),
        incomePayment: num(doc["incomePayment"]),
        taxWithheld: num(doc["taxWithheld"]),
        atc: str(doc["atc"]),
        confidence: {
          amount: score(confidence["amount"]),
          tin: score(confidence["tin"]),
          date: score(confidence["date"]),
          kind: score(confidence["kind"]),
        },
        notes: str(doc["notes"]),
      },
    ];
  });
}
