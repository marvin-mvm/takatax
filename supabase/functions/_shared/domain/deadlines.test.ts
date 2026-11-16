import { describe, expect, it } from "vitest";

import { filingsForPeriodYear, upcomingFilings } from "./deadlines.ts";
import { type TaxProfile, taxTypesFor } from "./tax-profile.ts";

const profile: TaxProfile = {
  tin: "123-456-789-000",
  registeredName: "Juan Dela Cruz",
  rdoCode: "038",
  registeredAddress: "Quezon City",
  lineOfBusiness: "Printing services",
  registrationDate: "2024-03-01",
  vatRegistered: false,
  withholdingAgent: false,
  incomeTaxOption: "graduated_osd",
  businessType: "services",
  mixedIncome: false,
};

const due = (filings: ReturnType<typeof filingsForPeriodYear>, id: string) =>
  filings.find((filing) => filing.id === id)?.dueDate;

describe("taxTypesFor", () => {
  it("gives a non-VAT graduated filer income tax and percentage tax", () => {
    expect(taxTypesFor(profile)).toEqual(["income_tax", "percentage_tax"]);
  });

  it("drops percentage tax for 8% filers and replaces it with VAT when VAT-registered", () => {
    expect(taxTypesFor({ ...profile, incomeTaxOption: "eight_percent" })).toEqual(["income_tax"]);
    expect(taxTypesFor({ ...profile, vatRegistered: true, withholdingAgent: true })).toEqual([
      "income_tax",
      "vat",
      "withholding",
    ]);
  });
});

describe("filingsForPeriodYear", () => {
  const filings = filingsForPeriodYear({ ...profile, withholdingAgent: true }, 2026);

  it("uses the statutory due dates", () => {
    expect(due(filings, "1701Q-2026-Q1")).toBe("2026-05-15");
    expect(due(filings, "1701Q-2026-Q3")).toBe("2026-11-15");
    expect(due(filings, "1701A-2026")).toBe("2027-04-15");
    expect(due(filings, "2551Q-2026-Q1")).toBe("2026-04-25");
    expect(due(filings, "2551Q-2026-Q4")).toBe("2027-01-25");
    expect(due(filings, "0619-E-2026-01")).toBe("2026-02-10");
    expect(due(filings, "1601-EQ-2026-Q1")).toBe("2026-04-30");
    expect(due(filings, "1601-EQ-2026-Q2")).toBe("2026-07-31");
  });

  it("has no fourth-quarter 1701Q and 0619-E only for the first two months of a quarter", () => {
    expect(filings.some((filing) => filing.id === "1701Q-2026-Q4")).toBe(false);
    expect(filings.filter((filing) => filing.form === "0619-E")).toHaveLength(8);
    expect(filings.some((filing) => filing.id === "0619-E-2026-03")).toBe(false);
  });

  it("makes 1701Q cumulative from January", () => {
    const q2 = filings.find((filing) => filing.id === "1701Q-2026-Q2");
    expect(q2?.periodStart).toBe("2026-01-01");
    expect(q2?.periodEnd).toBe("2026-06-30");
  });

  it("uses Form 1701 for itemized deductions", () => {
    const itemized = filingsForPeriodYear(
      { ...profile, incomeTaxOption: "graduated_itemized" },
      2026,
    );
    expect(itemized.some((filing) => filing.id === "1701-2026")).toBe(true);
  });
});

describe("upcomingFilings", () => {
  it("lists what is due next, including last year's annual return", () => {
    const next = upcomingFilings(profile, "2026-04-01", 3).map((filing) => filing.id);
    expect(next).toEqual(["1701A-2025", "2551Q-2026-Q1", "1701Q-2026-Q1"]);
  });
});
