import { describe, expect, it } from "vitest";

import { checkDocument, sameTaxFields } from "./checks.ts";
import {
  type ExchangeRate,
  type FetchJson,
  conversionNote,
  convertDocument,
  convertReading,
  currencyCode,
  currencyOf,
  isUnconverted,
  lookupRate,
  rateSources,
} from "./currency.ts";
import { toLedgerRows } from "./ledger.ts";
import type { ReadResult } from "./pipeline.ts";
import { type ExtractedDocument, parseExtraction } from "./schema.ts";

/** A cloud service's receipt: $8.40, no Philippine VAT. */
const receipt = (changes: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-10-31",
  documentNumber: "5412-0001",
  issuerName: "Cloud Mail Inc.",
  issuerTin: null,
  recipientName: "Juan Dela Cruz",
  recipientTin: null,
  totalAmount: 8.4,
  vatAmount: 0,
  currency: "USD",
  expenseCategory: "communication",
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 1, tin: 1, date: 1, kind: 1 },
  notes: null,
  ...changes,
});

const RATE: ExchangeRate = { rate: 63.954, date: "2026-10-30", source: "test" };
const reading = (...documents: ExtractedDocument[]): ReadResult => ({
  documents,
  path: ["fast"],
  status: "accepted",
  flags: [],
});

describe("currencyCode", () => {
  it("reads signs and codes however they are printed", () => {
    expect(currencyCode("$")).toBe("USD");
    expect(currencyCode("US$")).toBe("USD");
    expect(currencyCode(" usd ")).toBe("USD");
    expect(currencyCode("₱")).toBe("PHP");
    expect(currencyCode("Php")).toBe("PHP");
    expect(currencyCode("pesos")).toBe("PHP");
    expect(currencyCode("€")).toBe("EUR");
    expect(currencyCode("sgd")).toBe("SGD");
  });

  it("is null for anything that is not a currency", () => {
    expect(currencyCode(null)).toBeNull();
    expect(currencyCode("")).toBeNull();
    expect(currencyCode("dollars maybe")).toBeNull();
    expect(currencyCode(12)).toBeNull();
  });

  it("is kept by the reading, and a document with no currency counts as pesos", () => {
    const [usd, plain] = parseExtraction({
      documents: [
        { kind: "expense_receipt", totalAmount: 250, currency: "$" },
        { kind: "expense_receipt", totalAmount: 1_120 },
      ],
    });
    expect(usd?.currency).toBe("USD");
    expect(plain?.currency).toBeNull();
    expect(currencyOf(plain ?? {})).toBe("PHP");
    expect(isUnconverted(usd ?? {})).toBe(true);
    expect(isUnconverted(plain ?? {})).toBe(false);
  });
});

describe("convertDocument", () => {
  it("turns the amounts into pesos to the centavo and keeps what was printed", () => {
    const converted = convertDocument(receipt(), RATE);
    expect(converted.totalAmount).toBe(537.21);
    expect(converted.vatAmount).toBe(0);
    expect(converted.incomePayment).toBeNull();
    expect(converted.converted).toEqual({
      currency: "USD",
      rate: 63.954,
      rateDate: "2026-10-30",
      source: "test",
      totalAmount: 8.4,
      vatAmount: 0,
      incomePayment: null,
      taxWithheld: null,
    });
    expect(isUnconverted(converted)).toBe(false);
    expect(conversionNote(converted)).toBe(" (USD 8.40 at ₱63.954)");
    expect(conversionNote(receipt())).toBe("");
  });

  it("converts a $250 receipt to thousands of pesos, not ₱250", () => {
    const converted = convertDocument(receipt({ totalAmount: 250, vatAmount: null }), RATE);
    expect(converted.totalAmount).toBe(15_988.5);
    expect(converted.vatAmount).toBeNull();
  });
});

describe("the ledger", () => {
  it("records a converted receipt in pesos and says what was printed", () => {
    const rows = toLedgerRows(convertDocument(receipt(), RATE), "acct", "doc");
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "expense",
        amount_centavos: 53_721,
        vat_centavos: 0,
        description: "Cloud Mail Inc. (USD 8.40 at ₱63.954)",
      }),
    ]);
  });

  it("records a converted sale the same way", () => {
    const sale = convertDocument(
      receipt({ kind: "sales_invoice", documentNumber: "INV-7", totalAmount: 1_000 }),
      RATE,
    );
    expect(toLedgerRows(sale, "acct", "doc")[0]).toMatchObject({
      kind: "sale",
      amount_centavos: 6_395_400,
      description: "INV-7 (USD 1000.00 at ₱63.954)",
    });
  });

  it("never records a foreign amount as pesos", () => {
    expect(toLedgerRows(receipt(), "acct", "doc")).toEqual([]);
  });

  it("leaves peso documents exactly as before", () => {
    const peso = receipt({ currency: "PHP", totalAmount: 1_120, vatAmount: 120 });
    expect(toLedgerRows(peso, "acct", "doc")[0]).toMatchObject({
      amount_centavos: 112_000,
      description: "Cloud Mail Inc.",
    });
    const old = receipt({ totalAmount: 1_120, vatAmount: 120 });
    delete old.currency;
    expect(toLedgerRows(old, "acct", "doc")[0]?.amount_centavos).toBe(112_000);
  });
});

describe("the checks", () => {
  it("do not apply the Philippine VAT rule to a foreign document", () => {
    expect(checkDocument(receipt({ totalAmount: 108, vatAmount: 8 }))).toEqual([]);
    expect(checkDocument(receipt({ currency: "PHP", totalAmount: 108, vatAmount: 8 }))).toContain(
      "vat_mismatch",
    );
  });

  it("treat two readings in different currencies as a disagreement", () => {
    expect(sameTaxFields(receipt(), receipt())).toBe(true);
    expect(sameTaxFields(receipt(), receipt({ currency: "PHP" }))).toBe(false);
    expect(sameTaxFields(receipt({ currency: null }), receipt({ currency: "PHP" }))).toBe(true);
  });
});

describe("lookupRate", () => {
  const today = "2026-11-16";
  /** A fake network: answers the URLs it is given and records every call. */
  const network = (answers: Record<string, unknown>) => {
    const calls: string[] = [];
    const fetchJson: FetchJson = (url) => {
      calls.push(url);
      const match = Object.keys(answers).find((part) => url.includes(part));
      if (!match) return Promise.reject(new Error("down"));
      return Promise.resolve(answers[match]);
    };
    return { calls, fetchJson };
  };

  it("asks for the rate of the document's date first", async () => {
    const { calls, fetchJson } = network({
      "frankfurter.dev/v1/2026-10-31": { base: "USD", date: "2026-10-30", rates: { PHP: 63.9 } },
    });
    expect(await lookupRate(fetchJson, "USD", "2026-10-31", today)).toEqual({
      rate: 63.9,
      date: "2026-10-30",
      source: "European Central Bank (Frankfurter)",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("https://api.frankfurter.dev/v1/2026-10-31?base=USD&symbols=PHP");
  });

  it("falls back to the second source when the first is down", async () => {
    const { calls, fetchJson } = network({
      "currency-api@2026-10-31": { date: "2026-10-31", usd: { php: 63.8 } },
    });
    const rate = await lookupRate(fetchJson, "usd", "2026-10-31", today);
    expect(rate).toMatchObject({ rate: 63.8, date: "2026-10-31" });
    expect(rate?.source).toContain("currency-api");
    expect(calls).toHaveLength(2);
  });

  it("uses the latest rate for a missing or future date", async () => {
    const { calls, fetchJson } = network({
      "frankfurter.dev/v1/latest": { date: "2026-11-16", rates: { PHP: 64 } },
    });
    expect((await lookupRate(fetchJson, "USD", null, today))?.rate).toBe(64);
    expect((await lookupRate(fetchJson, "USD", "2027-01-01", today))?.date).toBe("2026-11-16");
    expect(calls.every((url) => url.includes("/latest"))).toBe(true);
    expect(rateSources("USD", "2026-10-31", today)).toHaveLength(4);
    expect(rateSources("USD", null, today)).toHaveLength(2);
  });

  it("ignores a reply without a sensible rate, and gives up when no source answers", async () => {
    const bad = network({ frankfurter: { rates: { PHP: 0 } }, "currency-api": { usd: {} } });
    expect(await lookupRate(bad.fetchJson, "USD", "2026-10-31", today)).toBeNull();
    expect(bad.calls).toHaveLength(4);
    expect(await lookupRate(network({}).fetchJson, "USD", "2026-10-31", today)).toBeNull();
    expect(await lookupRate(network({}).fetchJson, "not a currency", null, today)).toBeNull();
  });
});

describe("convertReading", () => {
  it("converts foreign documents and leaves peso ones alone", async () => {
    const asked: string[] = [];
    const result = await convertReading(
      reading(
        receipt(),
        receipt({ currency: "PHP", totalAmount: 500 }),
        receipt({ currency: null }),
      ),
      (currency, date) => {
        asked.push(`${currency} ${date}`);
        return Promise.resolve(RATE);
      },
    );
    expect(asked).toEqual(["USD 2026-10-31"]);
    expect(result.status).toBe("accepted");
    expect(result.flags).toEqual([]);
    expect(result.documents.map((doc) => doc.totalAmount)).toEqual([537.21, 500, 8.4]);
    expect(result.documents[0]?.converted?.currency).toBe("USD");
    expect(result.documents[1]?.converted).toBeUndefined();
  });

  it("sends the reading to review, with no peso amount, when the rate cannot be found", async () => {
    const unknown = await convertReading(reading(receipt()), () => Promise.resolve(null));
    const failed = await convertReading(reading(receipt()), () => Promise.reject(new Error("x")));
    for (const result of [unknown, failed]) {
      expect(result.status).toBe("needs_review");
      expect(result.flags).toEqual(["currency_not_converted"]);
      expect(result.documents[0]?.totalAmount).toBe(8.4);
      expect(toLedgerRows(result.documents[0] ?? receipt(), "acct", "doc")).toEqual([]);
    }
  });

  it("does not convert twice", async () => {
    const once = await convertReading(reading(receipt()), () => Promise.resolve(RATE));
    const twice = await convertReading(once, () => Promise.reject(new Error("not needed")));
    expect(twice.documents[0]?.totalAmount).toBe(537.21);
    expect(twice.status).toBe("accepted");
  });
});
