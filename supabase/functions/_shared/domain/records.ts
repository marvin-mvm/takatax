/**
 * The ledger: one row per sale, expense or withholding certificate, each linked to the
 * uploaded document it was read from. Amounts are in pesos.
 */

import type { IsoDate } from "./dates.ts";
import type { TaxProfile, TaxTypeId } from "./tax-profile.ts";

export type RecordKind = "sale" | "expense" | "withholding";

export type ExpenseCategory =
  | "cost_of_sales"
  | "rent"
  | "utilities"
  | "communication"
  | "supplies"
  | "transportation"
  | "professional_fees"
  | "representation"
  | "repairs"
  | "taxes_licenses"
  | "salaries"
  | "equipment"
  | "personal"
  | "other";

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  cost_of_sales: "Cost of sales",
  rent: "Rent",
  utilities: "Utilities",
  communication: "Phone and internet",
  supplies: "Supplies",
  transportation: "Transport",
  professional_fees: "Professional fees",
  representation: "Meals with clients",
  repairs: "Repairs",
  taxes_licenses: "Taxes and licenses",
  salaries: "Salaries",
  equipment: "Equipment",
  personal: "Personal",
  other: "Other",
};

export interface LedgerRecord {
  id: string;
  /** The uploaded document this row was read from (null when typed in by hand). */
  documentId: string | null;
  kind: RecordKind;
  date: IsoDate;
  /** Who the other side is: the client for a sale or 2307, the supplier for an expense. */
  counterparty: string;
  counterpartyTin?: string | undefined;
  description: string;
  category?: ExpenseCategory | undefined;
  /**
   * Sale or expense: the invoice total, VAT included.
   * Withholding (a 2307 received from a client): the income payment it covers.
   */
  amount: number;
  /** VAT shown on the invoice or receipt, if any. */
  vat: number;
  /**
   * Sale: tax the client withheld (also on a 2307). Expense: tax you withheld from a supplier
   * and owe the BIR. Withholding: tax withheld from you, a credit against your income tax.
   */
  taxWithheld: number;
}

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  sale: "Sale",
  expense: "Expense",
  withholding: "2307 received",
};

/** The taxes a record feeds, given the taxpayer's profile. Used to filter by tax type. */
export function recordTaxTypes(record: LedgerRecord, profile: TaxProfile): TaxTypeId[] {
  const types: TaxTypeId[] = [];
  if (record.kind === "sale") {
    types.push("income_tax");
    if (profile.vatRegistered) types.push("vat");
    else if (profile.incomeTaxOption !== "eight_percent") types.push("percentage_tax");
  } else if (record.kind === "expense") {
    if (profile.incomeTaxOption === "graduated_itemized") types.push("income_tax");
    if (profile.vatRegistered && record.vat > 0) types.push("vat");
    if (profile.withholdingAgent && record.taxWithheld > 0) types.push("withholding");
  } else {
    types.push("income_tax");
  }
  return types;
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;
