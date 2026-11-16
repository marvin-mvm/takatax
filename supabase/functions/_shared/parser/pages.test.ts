import { describe, expect, it } from "vitest";

import type { ReadResult } from "./pipeline.ts";
import type { ExtractedDocument } from "./schema.ts";
import { combineReadings, pageGroups, pagesPerCall } from "./pages.ts";

const result = (overrides: Partial<ReadResult>): ReadResult => ({
  documents: [],
  path: ["fast"],
  status: "accepted",
  flags: [],
  ...overrides,
});

describe("pageGroups", () => {
  it("covers every page in groups of five", () => {
    expect(pageGroups(12)).toEqual([
      { from: 1, to: 5 },
      { from: 6, to: 10 },
      { from: 11, to: 12 },
    ]);
    expect(pageGroups(1)).toEqual([{ from: 1, to: 1 }]);
    expect(pageGroups(0)).toEqual([]);
  });

  it("uses smaller groups when asked", () => {
    expect(pageGroups(3, 1)).toHaveLength(3);
  });
});

describe("pagesPerCall", () => {
  it("sends five light pages per call, and heavy scanned pages one at a time", () => {
    expect(pagesPerCall(500_000, 10)).toBe(5);
    expect(pagesPerCall(200 * 1024 * 1024, 20)).toBe(1);
    expect(pagesPerCall(30 * 1024 * 1024, 10)).toBe(3);
  });
});

const receipt: ExtractedDocument = {
  kind: "expense_receipt",
  date: "2026-11-02",
  documentNumber: null,
  issuerName: "Mercury Drug",
  issuerTin: null,
  recipientName: null,
  recipientTin: null,
  totalAmount: 1120,
  vatAmount: 120,
  currency: "PHP",
  expenseCategory: "supplies",
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 0.95, tin: 0.95, date: 0.95, kind: 0.95 },
  notes: null,
};

describe("combineReadings", () => {
  it("joins the documents of all groups and keeps the furthest step", () => {
    const combined = combineReadings([
      result({ path: ["fast"], documents: [receipt] }),
      result({ path: ["fast", "recheck"], documents: [receipt] }),
    ]);
    expect(combined.status).toBe("accepted");
    expect(combined.flags).toEqual([]);
    expect(combined.documents).toHaveLength(2);
    expect(combined.path).toEqual(["fast", "recheck"]);
  });

  it("sends a file in which nothing was found to review, never marks it as read", () => {
    const photo = combineReadings([result({})]);
    expect(photo.documents).toEqual([]);
    expect(photo.status).toBe("needs_review");
    expect(photo.flags).toEqual(["not_a_document"]);

    const blankPdf = combineReadings([result({}), result({})], ["pages_not_paid"]);
    expect(blankPdf.status).toBe("needs_review");
    expect(blankPdf.flags).toEqual(["pages_not_paid", "not_a_document"]);
  });

  it("does not mind a blank page in a PDF that has documents on its other pages", () => {
    const combined = combineReadings([result({ documents: [receipt] }), result({})]);
    expect(combined.status).toBe("accepted");
    expect(combined.flags).toEqual([]);
  });

  it("needs review if any group does, with every flag once", () => {
    const combined = combineReadings(
      [
        result({ status: "needs_review", flags: ["vat_mismatch"], documents: [receipt] }),
        result({
          status: "needs_review",
          flags: ["vat_mismatch", "missing_date"],
          documents: [receipt],
        }),
      ],
      ["pages_not_paid"],
    );
    expect(combined.status).toBe("needs_review");
    expect(combined.flags).toEqual(["vat_mismatch", "missing_date", "pages_not_paid"]);
  });
});
