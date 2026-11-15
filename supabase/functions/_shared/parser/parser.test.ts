import { describe, expect, it, vi } from "vitest";

import {
  checkDocument,
  isStandardWithholdingRate,
  normalizeTin,
  vatMatchesTotal,
} from "./checks.ts";
import { readWithEscalation } from "./pipeline.ts";
import { type ExtractedDocument, parseExtraction } from "./schema.ts";

const receipt = (changes: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-03-10",
  documentNumber: "OR-001",
  issuerName: "Supplier Inc.",
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
  confidence: { amount: 0.95, tin: 0.95, date: 0.95, kind: 0.99 },
  notes: null,
  ...changes,
});

describe("checks", () => {
  it("normalises TINs and rejects what is not one", () => {
    expect(normalizeTin("123-456-789-000")).toBe("123456789000");
    expect(normalizeTin("12-345")).toBeNull();
  });

  it("checks VAT is 12/112 of the total and 2307 rates are standard", () => {
    expect(vatMatchesTotal(1_120, 120)).toBe(true);
    expect(vatMatchesTotal(1_120, 200)).toBe(false);
    expect(isStandardWithholdingRate(10_000, 200)).toBe(true);
    expect(isStandardWithholdingRate(10_000, 333)).toBe(false);
  });

  it("passes a clean receipt and flags problems", () => {
    expect(checkDocument(receipt())).toEqual([]);
    expect(checkDocument(receipt({ vatAmount: 300 }))).toEqual(["vat_mismatch"]);
    expect(checkDocument(receipt({ date: null, totalAmount: null }))).toEqual([
      "missing_date",
      "missing_amount",
    ]);
    expect(checkDocument(receipt(), { start: "2026-04-01", end: "2026-06-30" })).toEqual([
      "outside_period",
    ]);
  });
});

describe("parseExtraction", () => {
  it("keeps good fields and turns malformed ones into null", () => {
    const [doc] = parseExtraction({
      documents: [
        {
          kind: "sales_invoice",
          date: "03/10/2026",
          totalAmount: "500",
          confidence: { amount: 2 },
        },
      ],
    });
    expect(doc?.kind).toBe("sales_invoice");
    expect(doc?.date).toBeNull();
    expect(doc?.totalAmount).toBeNull();
    expect(doc?.confidence.amount).toBe(1);
    expect(doc?.confidence.tin).toBe(0);
  });

  it("returns nothing for a reply that is not a document list", () => {
    expect(parseExtraction("not json")).toEqual([]);
    expect(parseExtraction({ documents: [null, 3] })).toEqual([]);
  });
});

describe("readWithEscalation", () => {
  const readers = (
    fast: ExtractedDocument[],
    recheck: ExtractedDocument[],
    settle: ExtractedDocument[],
  ) => ({
    fast: vi.fn().mockResolvedValue(fast),
    recheck: vi.fn().mockResolvedValue(recheck),
    settle: vi.fn().mockResolvedValue(settle),
  });

  it("stops after the fast model when everything checks out", async () => {
    const r = readers([receipt()], [], []);
    const result = await readWithEscalation(r);
    expect(result).toMatchObject({ path: ["fast"], status: "accepted" });
    expect(r.recheck).not.toHaveBeenCalled();
  });

  it("accepts when a doubtful reading is confirmed by the second model", async () => {
    const unsure = receipt({ confidence: { amount: 0.5, tin: 0.9, date: 0.9, kind: 0.9 } });
    const r = readers([unsure], [receipt()], []);
    const result = await readWithEscalation(r);
    expect(result).toMatchObject({ path: ["fast", "recheck"], status: "accepted" });
    expect(r.settle).not.toHaveBeenCalled();
  });

  it("asks the top model when the two disagree, and sends what is still unsure to review", async () => {
    const unsure = receipt({ confidence: { amount: 0.5, tin: 0.9, date: 0.9, kind: 0.9 } });
    const r = readers(
      [unsure],
      [receipt({ totalAmount: 1_210, vatAmount: 129.64 })],
      [receipt({ vatAmount: 300 })],
    );
    const result = await readWithEscalation(r);
    expect(result).toMatchObject({
      path: ["fast", "recheck", "settle"],
      status: "needs_review",
      flags: ["vat_mismatch"],
    });
  });
});
