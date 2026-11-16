/**
 * Turns what the reader found in a document into ledger rows (amounts in centavos). Used by the
 * Trigger.dev reader job; kept here so it is unit-tested with the rest of the reader.
 */

import type { ExtractedDocument } from "./schema.ts";

export interface LedgerRow {
  account_id: string;
  document_id: string;
  kind: "sale" | "expense" | "withholding";
  record_date: string;
  counterparty: string;
  counterparty_tin: string | null;
  description: string;
  category?: string | null;
  amount_centavos: number;
  vat_centavos?: number;
  tax_withheld_centavos?: number;
}

const centavos = (pesos: number | null) => Math.round((pesos ?? 0) * 100);

export function toLedgerRows(
  doc: ExtractedDocument,
  accountId: string,
  documentId: string,
): LedgerRow[] {
  const recordDate = doc.date ?? doc.periodTo;
  if (!recordDate) return [];
  const base = {
    account_id: accountId,
    document_id: documentId,
    record_date: recordDate,
    counterparty: (doc.kind === "sales_invoice" ? doc.recipientName : doc.issuerName) ?? "",
    counterparty_tin: doc.kind === "sales_invoice" ? doc.recipientTin : doc.issuerTin,
  };
  switch (doc.kind) {
    case "sales_invoice":
      return [
        {
          ...base,
          kind: "sale",
          description: doc.documentNumber ?? "Sale",
          amount_centavos: centavos(doc.totalAmount),
          vat_centavos: centavos(doc.vatAmount),
        },
      ];
    case "expense_receipt":
      return [
        {
          ...base,
          kind: "expense",
          description: doc.issuerName ?? "Expense",
          category: doc.expenseCategory,
          amount_centavos: centavos(doc.totalAmount),
          vat_centavos: centavos(doc.vatAmount),
        },
      ];
    case "form_2307":
      return [
        {
          ...base,
          kind: "withholding",
          description: `Form 2307 ${doc.periodFrom ?? ""} to ${doc.periodTo ?? ""}`.trim(),
          amount_centavos: centavos(doc.incomePayment),
          tax_withheld_centavos: centavos(doc.taxWithheld),
        },
      ];
    default:
      return [];
  }
}
