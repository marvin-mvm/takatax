import { describe, expect, it } from "vitest";

import {
  type ReviewDraft,
  draftOf,
  isIsoDay,
  parseAmount,
  reviewOutcome,
  reviewProblems,
  reviewedReading,
  savedReadings,
  unsureFields,
} from "./review.ts";
import type { ExtractedDocument } from "./schema.ts";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = "22222222-2222-4222-8222-222222222222";

const reading = (changes: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-11-02",
  documentNumber: "OR-1042",
  issuerName: "Mercury Drug",
  issuerTin: "000-388-474-000",
  recipientName: "Olive Ramos",
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
  ...changes,
});

const draft = (changes: Partial<ReviewDraft> = {}): ReviewDraft => ({
  ...draftOf(reading()),
  ...changes,
});

describe("savedReadings", () => {
  it("reads back what the reader saved with a document", () => {
    const saved = JSON.parse(JSON.stringify([reading(), reading({ kind: "sales_invoice" })]));
    expect(savedReadings(saved)).toEqual([reading(), reading({ kind: "sales_invoice" })]);
  });

  it("keeps how a foreign amount was converted", () => {
    const converted = {
      currency: "USD",
      rate: 58.12,
      rateDate: "2026-11-02",
      source: "European Central Bank (Frankfurter)",
      totalAmount: 250,
      vatAmount: null,
      incomePayment: null,
      taxWithheld: null,
    };
    const [back] = savedReadings([
      { ...reading({ currency: "USD", totalAmount: 14530 }), converted },
    ]);
    expect(back?.converted).toEqual(converted);
    expect(back?.totalAmount).toBe(14530);
  });

  it("gives nothing for a COR, a reading in progress or an empty column", () => {
    expect(savedReadings({ isCor: true, tin: "123-456-789" })).toEqual([]);
    expect(savedReadings({ reading: { next: 1, pagesDone: 5, results: [] } })).toEqual([]);
    expect(savedReadings(null)).toEqual([]);
    expect(savedReadings([])).toEqual([]);
  });

  it("drops a conversion that makes no sense", () => {
    const [back] = savedReadings([{ ...reading(), converted: { currency: "USD", rate: 0 } }]);
    expect(back?.converted).toBeUndefined();
  });
});

describe("draftOf", () => {
  it("fills the form with what the AI read of an expense", () => {
    expect(draftOf(reading())).toEqual({
      kind: "expense_receipt",
      date: "2026-11-02",
      name: "Mercury Drug",
      tin: "000-388-474-000",
      documentNumber: "OR-1042",
      total: "1120",
      vat: "120",
      category: "supplies",
      periodFrom: "",
      periodTo: "",
      incomePayment: "",
      taxWithheld: "",
    });
  });

  it("takes the customer, not the seller, as the other side of a sale", () => {
    const sale = draftOf(
      reading({ kind: "sales_invoice", recipientName: "Acme Corp", recipientTin: "123-456-789" }),
    );
    expect(sale.name).toBe("Acme Corp");
    expect(sale.tin).toBe("123-456-789");
  });

  it("starts empty when the AI found nothing", () => {
    const empty = draftOf(null);
    expect(empty.kind).toBe("unknown");
    expect(empty.date).toBe("");
    expect(empty.total).toBe("");
  });

  it("never offers a foreign amount as pesos", () => {
    const usd = draftOf(reading({ currency: "USD", totalAmount: 250, vatAmount: 12 }));
    expect(usd.total).toBe("");
    expect(usd.vat).toBe("");
  });

  it("offers the peso amount of a converted document", () => {
    const converted = draftOf(
      reading({
        currency: "USD",
        totalAmount: 14530,
        vatAmount: null,
        converted: {
          currency: "USD",
          rate: 58.12,
          rateDate: "2026-11-02",
          source: "ECB",
          totalAmount: 250,
          vatAmount: null,
          incomePayment: null,
          taxWithheld: null,
        },
      }),
    );
    expect(converted.total).toBe("14530");
  });

  it("ignores a category the app does not know", () => {
    expect(draftOf(reading({ expenseCategory: "snacks" })).category).toBe("");
  });
});

describe("unsureFields", () => {
  it("points at nothing when the AI was sure of everything", () => {
    expect(unsureFields(reading())).toEqual([]);
  });

  it("points at the figures the AI was unsure of", () => {
    const fields = unsureFields(
      reading({ confidence: { amount: 0.5, tin: 0.6, date: 0.4, kind: 0.95 } }),
    );
    expect(fields.sort()).toEqual(["date", "tin", "total"]);
  });

  it("points at what could not be found", () => {
    expect(unsureFields(reading({ date: null, totalAmount: null })).sort()).toEqual([
      "date",
      "total",
    ]);
  });

  it("points at the kind when it does not look like a tax document", () => {
    expect(unsureFields(reading({ kind: "unknown" }))).toEqual(["kind"]);
  });

  it("points at a 2307's own boxes", () => {
    const fields = unsureFields(
      reading({
        kind: "form_2307",
        date: null,
        periodTo: null,
        incomePayment: 50000,
        taxWithheld: null,
      }),
    );
    expect(fields.sort()).toEqual(["periodTo", "taxWithheld"]);
  });

  it("points at amounts still in another currency, and at a TIN that is not one", () => {
    const fields = unsureFields(
      reading({ currency: "USD", totalAmount: 250, vatAmount: 12, issuerTin: "12-34" }),
    );
    expect(fields.sort()).toEqual(["tin", "total", "vat"]);
  });
});

describe("parseAmount and isIsoDay", () => {
  it("reads amounts the way people type them", () => {
    expect(parseAmount("1250.50")).toBe(1250.5);
    expect(parseAmount("1,250.5")).toBe(1250.5);
    expect(parseAmount("₱ 1,250")).toBe(1250);
    expect(parseAmount("P1250")).toBe(1250);
    expect(parseAmount("php 99.99")).toBe(99.99);
  });

  it("refuses what is not an amount", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("$250")).toBeNull();
  });

  it("knows a real day from a made-up one", () => {
    expect(isIsoDay("2026-11-30")).toBe(true);
    expect(isIsoDay("2026-11-31")).toBe(false);
    expect(isIsoDay("11/30/2026")).toBe(false);
  });
});

describe("reviewProblems", () => {
  it("finds nothing wrong with a complete expense", () => {
    expect(reviewProblems(draft(), "2026-11-17")).toEqual({});
  });

  it("asks for the date and the total", () => {
    expect(reviewProblems(draft({ date: "", total: "" }))).toEqual({
      date: "Enter the date printed on the document.",
      total: "Enter the total amount.",
    });
  });

  it("refuses a date that does not exist or is in the future", () => {
    expect(reviewProblems(draft({ date: "2026-02-30" })).date).toBe("This is not a real date.");
    expect(reviewProblems(draft({ date: "2062-11-02" }), "2026-11-17").date).toBe(
      "This date is in the future.",
    );
  });

  it("refuses a zero total, VAT above the total and a TIN that is not one", () => {
    expect(reviewProblems(draft({ total: "0" })).total).toBe("The amount must be more than zero.");
    expect(reviewProblems(draft({ total: "100", vat: "120" })).vat).toBe(
      "The VAT cannot be more than the total.",
    );
    expect(reviewProblems(draft({ tin: "12-34" })).tin).toMatch(/^A TIN has/);
  });

  it("lets the VAT, the TIN, the name and the category stay empty", () => {
    expect(reviewProblems(draft({ vat: "", tin: "", name: "", category: "" }))).toEqual({});
  });

  it("asks a 2307 for its period, income payment and tax withheld", () => {
    const form = draft({
      kind: "form_2307",
      periodFrom: "",
      periodTo: "",
      incomePayment: "",
      taxWithheld: "",
    });
    expect(Object.keys(reviewProblems(form)).sort()).toEqual([
      "incomePayment",
      "periodTo",
      "taxWithheld",
    ]);
    const filled = {
      ...form,
      periodFrom: "2026-07-01",
      periodTo: "2026-09-30",
      incomePayment: "50000",
      taxWithheld: "5000",
    };
    expect(reviewProblems(filled, "2026-11-17")).toEqual({});
    expect(reviewProblems({ ...filled, taxWithheld: "60000" }).taxWithheld).toBe(
      "The tax withheld cannot be more than the income payment.",
    );
    expect(reviewProblems({ ...filled, periodFrom: "2026-10-01" }).periodFrom).toBe(
      "The period starts after it ends.",
    );
  });

  it("asks nothing of something that is not a tax document", () => {
    expect(reviewProblems(draft({ kind: "unknown", date: "", total: "" }))).toEqual({});
  });
});

describe("reviewedReading and reviewOutcome", () => {
  it("saves the corrected figures as certain, in pesos", () => {
    const original = reading({
      date: null,
      totalAmount: null,
      confidence: { amount: 0.3, tin: 0.9, date: 0.2, kind: 0.9 },
      notes: "The date is smudged.",
    });
    const fixed = reviewedReading(
      { ...draftOf(original), date: "2026-11-02", total: "1,120.00" },
      original,
    );
    expect(fixed.date).toBe("2026-11-02");
    expect(fixed.totalAmount).toBe(1120);
    expect(fixed.vatAmount).toBe(120);
    expect(fixed.currency).toBe("PHP");
    expect(fixed.confidence).toEqual({ amount: 1, tin: 1, date: 1, kind: 1 });
    expect(fixed.notes).toBe("The date is smudged.");
    expect(fixed.issuerName).toBe("Mercury Drug");
  });

  it("gives a ledger row for a document the AI could not date", () => {
    const original = reading({ date: null });
    const { readings, rows } = reviewOutcome(
      [{ ...draftOf(original), date: "2026-11-02" }],
      [original],
      ACCOUNT,
      DOCUMENT,
    );
    expect(readings).toHaveLength(1);
    expect(rows).toEqual([
      {
        account_id: ACCOUNT,
        document_id: DOCUMENT,
        kind: "expense",
        record_date: "2026-11-02",
        counterparty: "Mercury Drug",
        counterparty_tin: "000-388-474-000",
        description: "Mercury Drug",
        category: "supplies",
        amount_centavos: 112000,
        vat_centavos: 12000,
      },
    ]);
  });

  it("turns a receipt into a sale when the person says it is one", () => {
    const original = reading({ recipientName: "Acme Corp", recipientTin: "123-456-789" });
    const asSale = reviewedReading(
      { ...draftOf(original), kind: "sales_invoice", name: "Acme Corp", tin: "123-456-789" },
      original,
    );
    expect(asSale.kind).toBe("sales_invoice");
    expect(asSale.recipientName).toBe("Acme Corp");
    expect(asSale.issuerName).toBe("Mercury Drug");
    expect(asSale.expenseCategory).toBeNull();
    const { rows } = reviewOutcome(
      [{ ...draftOf(original), kind: "sales_invoice", name: "Acme Corp", tin: "123-456-789" }],
      [original],
      ACCOUNT,
      DOCUMENT,
    );
    expect(rows[0]).toMatchObject({
      kind: "sale",
      counterparty: "Acme Corp",
      description: "OR-1042",
    });
  });

  it("dates a 2307 by the end of its period", () => {
    const original = reading({ kind: "form_2307", date: "2026-10-15" });
    const { rows } = reviewOutcome(
      [
        {
          ...draftOf(original),
          periodFrom: "2026-07-01",
          periodTo: "2026-09-30",
          incomePayment: "50000",
          taxWithheld: "5000",
        },
      ],
      [original],
      ACCOUNT,
      DOCUMENT,
    );
    expect(rows[0]).toMatchObject({
      kind: "withholding",
      record_date: "2026-09-30",
      amount_centavos: 5_000_000,
      tax_withheld_centavos: 500_000,
    });
  });

  it("counts nothing for something that is not a tax document", () => {
    const original = reading({ kind: "unknown", date: null, totalAmount: null });
    const { readings, rows } = reviewOutcome([draftOf(original)], [original], ACCOUNT, DOCUMENT);
    expect(readings[0]?.kind).toBe("unknown");
    expect(rows).toEqual([]);
  });

  it("saves a document typed in by hand when the AI read nothing", () => {
    const typed: ReviewDraft = {
      ...draftOf(null),
      kind: "expense_receipt",
      date: "2026-11-05",
      name: "Sari-sari store",
      total: "85",
    };
    const { readings, rows } = reviewOutcome([typed], [null], ACCOUNT, DOCUMENT);
    expect(readings[0]).toMatchObject({
      kind: "expense_receipt",
      totalAmount: 85,
      vatAmount: null,
    });
    expect(rows[0]).toMatchObject({ kind: "expense", amount_centavos: 8500, vat_centavos: 0 });
  });

  it("keeps the note of a conversion only while its peso amounts stand", () => {
    const converted = {
      currency: "USD",
      rate: 58.12,
      rateDate: "2026-11-02",
      source: "ECB",
      totalAmount: 250,
      vatAmount: null,
      incomePayment: null,
      taxWithheld: null,
    };
    const original = reading({ currency: "USD", totalAmount: 14530, vatAmount: null, converted });
    const kept = reviewOutcome([draftOf(original)], [original], ACCOUNT, DOCUMENT);
    expect(kept.readings[0]?.converted).toEqual(converted);
    expect(kept.rows[0]?.description).toBe("Mercury Drug (USD 250.00 at ₱58.12)");

    const changed = reviewOutcome(
      [{ ...draftOf(original), total: "14000" }],
      [original],
      ACCOUNT,
      DOCUMENT,
    );
    expect(changed.readings[0]?.converted).toBeUndefined();
    expect(changed.readings[0]?.currency).toBe("PHP");
    expect(changed.rows[0]?.description).toBe("Mercury Drug");
  });

  it("counts a foreign document once the person types its peso amount", () => {
    const original = reading({ currency: "USD", totalAmount: 250, vatAmount: null });
    const { rows } = reviewOutcome(
      [{ ...draftOf(original), total: "14530" }],
      [original],
      ACCOUNT,
      DOCUMENT,
    );
    expect(rows[0]).toMatchObject({ amount_centavos: 1_453_000 });
  });
});
