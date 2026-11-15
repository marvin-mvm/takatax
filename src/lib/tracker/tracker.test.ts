import { describe, expect, it } from "vitest";

import type { LedgerRecord } from "@shared/domain/records.ts";
import type { TaxProfile } from "@shared/domain/tax-profile.ts";

import { monthlySeries, pieSlices, tableRows, totalsOf } from "./tracker";

const profile: TaxProfile = {
  tin: "123-456-789-000",
  registeredName: "Juan Dela Cruz",
  rdoCode: "038",
  registeredAddress: "Quezon City",
  lineOfBusiness: "Printing",
  registrationDate: "2024-01-01",
  vatRegistered: false,
  withholdingAgent: true,
  incomeTaxOption: "graduated_osd",
  businessType: "services",
  mixedIncome: false,
};

const record = (changes: Partial<LedgerRecord>): LedgerRecord => ({
  id: Math.random().toString(36),
  documentId: "doc",
  kind: "sale",
  date: "2026-01-10",
  counterparty: "Client",
  description: "",
  amount: 0,
  vat: 0,
  taxWithheld: 0,
  ...changes,
});

const records: LedgerRecord[] = [
  record({ date: "2026-01-10", amount: 100_000 }),
  record({ date: "2026-02-10", amount: 50_000 }),
  record({
    kind: "expense",
    date: "2026-01-05",
    amount: 18_000,
    category: "rent",
    taxWithheld: 900,
  }),
  record({ kind: "expense", date: "2026-02-05", amount: 3_000, category: "utilities" }),
  record({ kind: "withholding", date: "2026-03-31", amount: 20_000, taxWithheld: 400 }),
];

describe("monthlySeries", () => {
  it("adds up earnings, spending and tax per month", () => {
    const series = monthlySeries(records, profile, {
      year: 2026,
      fromMonth: 1,
      toMonth: 3,
      taxType: "all",
    });
    expect(series.map((p) => [p.label, p.earned, p.spent])).toEqual([
      ["Jan", 100_000, 18_000],
      ["Feb", 50_000, 3_000],
      ["Mar", 0, 0],
    ]);
    // January: 3% percentage tax on ₱100,000 plus ₱900 withheld from rent; no income tax yet
    // because ₱60,000 taxable is under ₱250,000.
    expect(series[0]?.tax).toBe(3_900);
  });

  it("narrows to one tax type", () => {
    const withholding = monthlySeries(records, profile, {
      year: 2026,
      fromMonth: 1,
      toMonth: 2,
      taxType: "withholding",
    });
    expect(withholding.map((p) => [p.earned, p.spent, p.tax])).toEqual([
      [0, 18_000, 900],
      [0, 0, 0],
    ]);
  });
});

describe("totals and pie", () => {
  it("splits sales into spent, tax and kept", () => {
    const totals = totalsOf(
      monthlySeries(records, profile, { year: 2026, fromMonth: 1, toMonth: 2, taxType: "all" }),
    );
    expect(totals).toEqual({ earned: 150_000, spent: 21_000, tax: 5_400, kept: 123_600 });
    expect(pieSlices(totals).map((s) => [s.key, s.value])).toEqual([
      ["spent", 21_000],
      ["tax", 5_400],
      ["kept", 123_600],
    ]);
  });

  it("has nothing to split without sales", () => {
    expect(pieSlices({ earned: 0, spent: 500, tax: 0, kept: -500 })).toEqual([]);
  });
});

describe("tableRows", () => {
  it("lists the period's rows, newest first, with the taxes each one feeds", () => {
    const rows = tableRows(records, profile, {
      year: 2026,
      fromMonth: 1,
      toMonth: 3,
      taxType: "income_tax",
    });
    expect(rows.map((r) => [r.date, r.kind])).toEqual([
      ["2026-03-31", "withholding"],
      ["2026-02-10", "sale"],
      ["2026-01-10", "sale"],
    ]);
    expect(rows[1]?.taxTypes).toEqual(["income_tax", "percentage_tax"]);
  });
});
