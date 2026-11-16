/**
 * Reading a COR (BIR Form 2303): the JSON the model must return, tidying its reply, and what the
 * tax types on a COR mean. Shared by both readers, the COR check screen and the My COR page.
 *
 * A COR lists the business's tax types, each with the BIR form it is filed on (for example
 * "Withholding Tax - Expanded" on 0619-E and 1601-EQ, "Percentage Tax - Quarterly" on 2551Q).
 * Those forms are what the taxpayer must file, so they are read one by one and kept.
 */

/** One tax type row of a COR, with the BIR form it is filed on. */
export interface CorTaxType {
  /** The tax type as printed, for example "PERCENTAGE TAX - QUARTERLY". */
  taxType: string;
  /** The form as the BIR writes it, for example "2551Q", "0619-E", "1601-EQ"; null if not shown. */
  form: string | null;
  /** How often it is filed, as printed (for example "Quarterly"); null if not shown. */
  frequency: string | null;
  /** When the tax type took effect, YYYY-MM-DD; null if not shown. */
  effectiveDate: string | null;
}

/** What the reader saves from a COR, for the owner to check and confirm. */
export interface ExtractedRegistration {
  isCor: boolean;
  tin: string | null;
  /** The branch code after the TIN, for example "00000" (head office). */
  branchCode: string | null;
  registeredName: string | null;
  tradeName: string | null;
  /** The full registered address as printed. */
  registeredAddress: string | null;
  rdoCode: string | null;
  /** Every line of business as printed, separated by "; ". */
  lineOfBusiness: string | null;
  registrationDate: string | null;
  tinIssuanceDate: string | null;
  taxpayerType: string | null;
  taxTypes: CorTaxType[];
  vatRegistered: boolean;
  /** Only true when the COR says 8% or "in lieu of" in so many words. */
  eightPercentIndicated: boolean;
}

const nullable = (type: string) => ({ type: [type, "null"] });

/** JSON Schema for a COR, used as the structured-output format. */
export const REGISTRATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isCor",
    "tin",
    "branchCode",
    "registeredName",
    "tradeName",
    "registeredAddress",
    "rdoCode",
    "lineOfBusiness",
    "registrationDate",
    "tinIssuanceDate",
    "taxpayerType",
    "taxTypes",
    "vatRegistered",
    "eightPercentIndicated",
  ],
  properties: {
    isCor: { type: "boolean" },
    tin: nullable("string"),
    branchCode: nullable("string"),
    registeredName: nullable("string"),
    tradeName: nullable("string"),
    registeredAddress: nullable("string"),
    rdoCode: nullable("string"),
    lineOfBusiness: nullable("string"),
    registrationDate: nullable("string"),
    tinIssuanceDate: nullable("string"),
    taxpayerType: nullable("string"),
    taxTypes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["taxType", "form", "frequency", "effectiveDate"],
        properties: {
          taxType: { type: "string" },
          form: nullable("string"),
          frequency: nullable("string"),
          effectiveDate: nullable("string"),
        },
      },
    },
    vatRegistered: { type: "boolean" },
    eightPercentIndicated: { type: "boolean" },
  },
} as const;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;
const isoOrNull = (value: unknown): string | null => {
  const text = str(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) ? text.slice(0, 10) : null;
};

/**
 * A BIR form number the way the BIR writes it: "0619E" -> "0619-E", "1601 EQ" -> "1601-EQ",
 * "BIR Form No. 2551Q" -> "2551Q". Withholding forms (06xx, 16xx) take a dash before their
 * letters; the others (1701Q, 2550Q, 2551Q…) do not. Anything that is not a form number is null.
 */
export function normalizeFormCode(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const match = /(\d{4})\s*-?\s*([A-Za-z]{0,3})\b/.exec(text.replace(/BIR\s*Form\s*(No\.?)?/i, ""));
  if (!match) return null;
  const [, digits = "", letters = ""] = match;
  const suffix = letters.toUpperCase();
  if (!suffix) return digits;
  return /^(06|16)/.test(digits) ? `${digits}-${suffix}` : `${digits}${suffix}`;
}

/** Tidies the model's tax type rows: one row per form, no blanks, no duplicates. */
export function parseTaxTypes(raw: unknown): CorTaxType[] {
  const rows: CorTaxType[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    // Older readings kept only the printed names.
    const row = typeof item === "string" ? { taxType: item } : (item as Record<string, unknown>);
    if (!row || typeof row !== "object") continue;
    const taxType = str(row["taxType"]);
    const form = normalizeFormCode(row["form"]);
    if (!taxType && !form) continue;
    const key = `${(taxType ?? "").toUpperCase()}|${form ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      taxType: taxType ?? form ?? "",
      form,
      frequency: str(row["frequency"]),
      effectiveDate: isoOrNull(row["effectiveDate"]),
    });
  }
  return rows;
}

/** Checks and tidies the model's COR JSON. Anything malformed becomes null instead of throwing. */
export function parseRegistration(raw: unknown): ExtractedRegistration {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const taxTypes = parseTaxTypes(r["taxTypes"]);
  const lines = Array.isArray(r["lineOfBusiness"])
    ? (r["lineOfBusiness"] as unknown[]).map(str).filter(Boolean).join("; ")
    : str(r["lineOfBusiness"]);
  return {
    isCor: r["isCor"] !== false,
    tin: str(r["tin"]),
    branchCode: str(r["branchCode"]),
    registeredName: str(r["registeredName"]),
    tradeName: str(r["tradeName"]),
    registeredAddress: str(r["registeredAddress"]),
    rdoCode: str(r["rdoCode"]),
    lineOfBusiness: lines || null,
    registrationDate: isoOrNull(r["registrationDate"]),
    tinIssuanceDate: isoOrNull(r["tinIssuanceDate"]),
    taxpayerType: str(r["taxpayerType"]),
    taxTypes,
    vatRegistered: r["vatRegistered"] === true || hasVat(taxTypes),
    eightPercentIndicated: r["eightPercentIndicated"] === true,
  };
}

/** What a form is for, in plain words, and how often it is filed. */
export interface FormInfo {
  title: string;
  frequency: string;
  /** False for forms no longer filed (the annual registration fee ended in 2024). */
  active: boolean;
}

export const FORM_INFO: Record<string, FormInfo> = {
  "0619-E": {
    title: "Monthly remittance of expanded withholding tax",
    frequency: "Monthly (first two months of each quarter)",
    active: true,
  },
  "1601-EQ": {
    title: "Quarterly return of expanded withholding tax",
    frequency: "Quarterly",
    active: true,
  },
  "1604-E": {
    title: "Annual information return of expanded withholding tax",
    frequency: "Yearly",
    active: true,
  },
  "0619-F": {
    title: "Monthly remittance of final withholding tax",
    frequency: "Monthly (first two months of each quarter)",
    active: true,
  },
  "1601-FQ": {
    title: "Quarterly return of final withholding tax",
    frequency: "Quarterly",
    active: true,
  },
  "1601-C": {
    title: "Monthly return of tax withheld on salaries",
    frequency: "Monthly",
    active: true,
  },
  "1604-C": {
    title: "Annual information return of tax withheld on salaries",
    frequency: "Yearly",
    active: true,
  },
  "2551Q": { title: "Quarterly percentage tax return", frequency: "Quarterly", active: true },
  "2550Q": { title: "Quarterly VAT return", frequency: "Quarterly", active: true },
  "2550M": { title: "Monthly VAT declaration", frequency: "Monthly", active: true },
  "1701Q": { title: "Quarterly income tax return", frequency: "Quarterly", active: true },
  "1701": { title: "Annual income tax return", frequency: "Yearly", active: true },
  "1701A": {
    title: "Annual income tax return (business or profession only)",
    frequency: "Yearly",
    active: true,
  },
  "1702Q": { title: "Quarterly corporate income tax return", frequency: "Quarterly", active: true },
  "0605": {
    title: "Annual registration fee (no longer paid since January 2024)",
    frequency: "No longer filed",
    active: false,
  },
};

const formsOf = (taxTypes: CorTaxType[]) =>
  new Set(taxTypes.map((t) => t.form).filter((f): f is string => f !== null));

function hasVat(taxTypes: CorTaxType[]): boolean {
  const forms = formsOf(taxTypes);
  return (
    forms.has("2550Q") ||
    forms.has("2550M") ||
    taxTypes.some((t) => /value[- ]added/i.test(t.taxType))
  );
}

/**
 * What the COR's tax types say about the taxpayer: VAT-registered, and a withholding agent
 * (expanded withholding: 0619-E, 1601-EQ, 1604-E). Used to fill in the COR check screen.
 */
export function flagsFromTaxTypes(taxTypes: CorTaxType[]): {
  vatRegistered: boolean;
  withholdingAgent: boolean;
} {
  const forms = formsOf(taxTypes);
  return {
    vatRegistered: hasVat(taxTypes),
    withholdingAgent:
      ["0619-E", "1601-EQ", "1604-E"].some((f) => forms.has(f)) ||
      taxTypes.some((t) => /withholding tax\s*-\s*expanded/i.test(t.taxType)),
  };
}
