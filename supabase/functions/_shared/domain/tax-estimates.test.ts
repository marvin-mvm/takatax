import { describe, expect, it } from "vitest";

import { filingsForPeriodYear } from "./deadlines.ts";
import type { LedgerRecord } from "./records.ts";
import {
  estimateFiling,
  graduatedIncomeTax,
  incomeTaxToDate,
  percentageTaxRate,
  taxForPeriod,
} from "./tax-estimates.ts";
import type { TaxProfile } from "./tax-profile.ts";

const profile: TaxProfile = {
  tin: "123-456-789-000",
  registeredName: "Juan Dela Cruz",
  rdoCode: "038",
  registeredAddress: "Quezon City",
  lineOfBusiness: "Printing services",
  registrationDate: "2024-03-01",
  vatRegistered: false,
  withholdingAgent: true,
  incomeTaxOption: "graduated_osd",
  businessType: "services",
  mixedIncome: false,
};

let id = 0;
const sale = (date: string, amount: number): LedgerRecord => ({
  id: `r${++id}`,
  documentId: null,
  kind: "sale",
  date,
  counterparty: "Client",
  description: "Printing",
  amount,
  vat: 0,
  taxWithheld: 0,
});

describe("graduatedIncomeTax", () => {
  it("follows the 2023 table", () => {
    expect(graduatedIncomeTax(250_000, 2026)).toBe(0);
    expect(graduatedIncomeTax(400_000, 2026)).toBe(22_500);
    expect(graduatedIncomeTax(500_000, 2026)).toBe(42_500);
    expect(graduatedIncomeTax(1_000_000, 2026)).toBe(152_500);
  });

  it("uses the older table before 2023", () => {
    expect(graduatedIncomeTax(500_000, 2022)).toBe(55_000);
  });
});

describe("percentageTaxRate", () => {
  it("is 1% from July 2020 to June 2023 and 3% otherwise", () => {
    expect(percentageTaxRate("2022-12-31")).toBe(0.01);
    expect(percentageTaxRate("2023-07-01")).toBe(0.03);
  });
});

describe("incomeTaxToDate", () => {
  const records = [sale("2026-01-15", 500_000), sale("2026-04-15", 500_000)];

  it("applies the 40% standard deduction under OSD", () => {
    // ₱1,000,000 gross -> ₱600,000 taxable -> 22,500 + 20% of 200,000
    expect(incomeTaxToDate(records, profile, "2026-06-30")).toBe(62_500);
  });

  it("applies 8% above the ₱250,000 reduction", () => {
    const eight = { ...profile, incomeTaxOption: "eight_percent" as const };
    expect(incomeTaxToDate(records, eight, "2026-06-30")).toBe(60_000);
    expect(incomeTaxToDate(records, { ...eight, mixedIncome: true }, "2026-06-30")).toBe(80_000);
  });
});

describe("taxForPeriod and estimateFiling", () => {
  const records: LedgerRecord[] = [
    sale("2026-01-15", 500_000),
    sale("2026-04-15", 500_000),
    { ...sale("2026-04-20", 0), kind: "withholding", amount: 100_000, taxWithheld: 2_000 },
    {
      ...sale("2026-05-01", 0),
      kind: "expense",
      category: "rent",
      amount: 20_000,
      taxWithheld: 1_000,
    },
  ];
  const filings = filingsForPeriodYear(profile, 2026);
  const find = (id: string) => {
    const filing = filings.find((f) => f.id === id);
    if (!filing) throw new Error(id);
    return filing;
  };

  it("splits cumulative income tax across quarters", () => {
    expect(taxForPeriod(records, profile, "income_tax", "2026-01-01", "2026-03-31")).toBe(7_500);
    expect(taxForPeriod(records, profile, "income_tax", "2026-04-01", "2026-06-30")).toBe(55_000);
  });

  it("estimates the second-quarter 1701Q net of 2307 credits", () => {
    expect(estimateFiling(find("1701Q-2026-Q2"), records, profile)).toEqual({
      taxDue: 55_000,
      credits: 2_000,
      payable: 53_000,
    });
  });

  it("estimates percentage tax and withholding for their own quarter", () => {
    expect(estimateFiling(find("2551Q-2026-Q2"), records, profile).payable).toBe(15_000);
    expect(estimateFiling(find("1601-EQ-2026-Q2"), records, profile).payable).toBe(1_000);
  });
});
