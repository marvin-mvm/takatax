import { describe, expect, it } from "vitest";

import { toLedgerRows } from "./ledger.ts";
import type { ExtractedDocument } from "./schema.ts";

const doc = (overrides: Partial<ExtractedDocument>): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-10-05",
  documentNumber: null,
  issuerName: "Ace Hardware",
  issuerTin: "123-456-789-000",
  recipientName: null,
  recipientTin: null,
  totalAmount: 1_120,
  vatAmount: 120,
  expenseCategory: "supplies",
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 1, tin: 1, date: 1, kind: 1 },
  notes: null,
  ...overrides,
});

describe("toLedgerRows", () => {
  it("records an expense in centavos with its supplier", () => {
    expect(toLedgerRows(doc({}), "acct", "doc")).toEqual([
      expect.objectContaining({
        kind: "expense",
        counterparty: "Ace Hardware",
        amount_centavos: 112_000,
        vat_centavos: 12_000,
        category: "supplies",
      }),
    ]);
  });

  it("records a sale against the customer and a 2307 at the end of its period", () => {
    const sale = toLedgerRows(
      doc({ kind: "sales_invoice", recipientName: "Juan", documentNumber: "SI-0042" }),
      "acct",
      "doc",
    );
    expect(sale[0]).toMatchObject({ kind: "sale", counterparty: "Juan", description: "SI-0042" });
    const withholding = toLedgerRows(
      doc({
        kind: "form_2307",
        date: null,
        periodFrom: "2026-07-01",
        periodTo: "2026-09-30",
        incomePayment: 50_000,
        taxWithheld: 1_000,
      }),
      "acct",
      "doc",
    );
    expect(withholding[0]).toMatchObject({
      kind: "withholding",
      record_date: "2026-09-30",
      tax_withheld_centavos: 100_000,
    });
  });

  it("skips documents with no date and ones that are not tax documents", () => {
    expect(toLedgerRows(doc({ date: null }), "acct", "doc")).toEqual([]);
    expect(toLedgerRows(doc({ kind: "unknown" }), "acct", "doc")).toEqual([]);
  });
});
