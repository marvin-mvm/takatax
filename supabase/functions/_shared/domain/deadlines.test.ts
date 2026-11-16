import { describe, expect, it } from "vitest";

import { annualIncomeTaxForm, filingsForPeriodYear, upcomingFilings } from "./deadlines.ts";
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

describe("returns confirmed from the COR", () => {
  const rows = (...forms: string[]) =>
    forms.map((form) => ({ taxType: "AS PRINTED", form, frequency: null, effectiveDate: null }));
  const formsOf = (filings: ReturnType<typeof filingsForPeriodYear>) =>
    [...new Set(filings.map((filing) => filing.form))].sort();

  // A sole proprietor's COR: withholding agent, percentage tax, income tax, and the old fee.
  const cor = rows("0619-E", "1601-EQ", "1604-E", "2551Q", "1701", "1701Q", "0605");
  const confirmed: TaxProfile = { ...profile, withholdingAgent: true, corTaxTypes: cor };

  it("schedules every form on the COR that is still filed, and nothing else", () => {
    expect(formsOf(filingsForPeriodYear(confirmed, 2026))).toEqual([
      "0619-E",
      "1601-EQ",
      "1604-E",
      "1701",
      "1701Q",
      "2551Q",
    ]);
  });

  it("files the annual form the COR names when the tax option allows either", () => {
    expect(annualIncomeTaxForm(confirmed)).toBe("1701");
    const filings = filingsForPeriodYear(confirmed, 2026);
    expect(due(filings, "1701-2026")).toBe("2027-04-15");
    expect(filings.some((filing) => filing.form === "1701A")).toBe(false);
  });

  it("keeps Form 1701A when the COR names it, both, or no annual form", () => {
    expect(annualIncomeTaxForm({ ...profile, corTaxTypes: rows("1701A", "1701Q") })).toBe("1701A");
    expect(annualIncomeTaxForm({ ...profile, corTaxTypes: rows("1701", "1701A") })).toBe("1701A");
    expect(annualIncomeTaxForm({ ...profile, corTaxTypes: rows("1701Q", "2551Q") })).toBe("1701A");
    expect(annualIncomeTaxForm(profile)).toBe("1701A");
  });

  it("uses Form 1701 for itemized deductions or a salary, whatever the COR names", () => {
    const names1701A = rows("1701A", "1701Q");
    expect(
      annualIncomeTaxForm({
        ...profile,
        incomeTaxOption: "graduated_itemized",
        corTaxTypes: names1701A,
      }),
    ).toBe("1701");
    expect(annualIncomeTaxForm({ ...profile, mixedIncome: true, corTaxTypes: names1701A })).toBe(
      "1701",
    );
  });

  it("adds the annual withholding return, due March 1 of the next year", () => {
    const filings = filingsForPeriodYear(confirmed, 2026);
    const annual = filings.filter((filing) => filing.form === "1604-E");
    expect(annual).toHaveLength(1);
    expect(annual[0]?.dueDate).toBe("2027-03-01");
    expect(annual[0]?.periodStart).toBe("2026-01-01");
    expect(annual[0]?.periodEnd).toBe("2026-12-31");
    // A withholding agent files it even when no COR forms were kept.
    const byFlag = filingsForPeriodYear({ ...profile, withholdingAgent: true }, 2026);
    expect(due(byFlag, "1604-E-2026")).toBe("2027-03-01");
  });

  it("never schedules the retired registration fee (0605)", () => {
    for (const year of [2025, 2026, 2027]) {
      expect(filingsForPeriodYear(confirmed, year).some((filing) => filing.form === "0605")).toBe(
        false,
      );
    }
    expect(filingsForPeriodYear({ ...profile, corTaxTypes: rows("0605") }, 2026)).toEqual(
      filingsForPeriodYear(profile, 2026),
    );
  });

  it("schedules a return listed on the COR even when its box is not ticked", () => {
    const listed = { ...profile, corTaxTypes: rows("1601-EQ", "1604-E", "2550Q") };
    expect(taxTypesFor(listed)).toEqual(["income_tax", "percentage_tax"]);
    const filings = filingsForPeriodYear(listed, 2026);
    expect(filings.filter((filing) => filing.form === "1601-EQ")).toHaveLength(4);
    expect(filings.filter((filing) => filing.form === "1604-E")).toHaveLength(1);
    expect(filings.filter((filing) => filing.form === "2550Q")).toHaveLength(4);
    // Only the forms that are listed: this COR has no 0619-E.
    expect(filings.some((filing) => filing.form === "0619-E")).toBe(false);
  });

  it("never takes away a return the profile calls for", () => {
    // The COR lists income tax only, but the owner ticked "withholding agent".
    const filings = filingsForPeriodYear(
      { ...profile, withholdingAgent: true, corTaxTypes: rows("1701", "1701Q") },
      2026,
    );
    expect(formsOf(filings)).toEqual(["0619-E", "1601-EQ", "1604-E", "1701", "1701Q", "2551Q"]);
  });

  it("leaves percentage tax out for 8% filers even when the COR still lists 2551Q", () => {
    const filings = filingsForPeriodYear(
      { ...profile, incomeTaxOption: "eight_percent", corTaxTypes: rows("2551Q", "1701Q") },
      2026,
    );
    expect(filings.some((filing) => filing.form === "2551Q")).toBe(false);
  });

  it("gives every return its own id and keeps them in due-date order", () => {
    const filings = filingsForPeriodYear(confirmed, 2026);
    expect(new Set(filings.map((filing) => filing.id)).size).toBe(filings.length);
    expect(filings.map((filing) => filing.dueDate)).toEqual(
      filings.map((filing) => filing.dueDate).sort(),
    );
  });

  it("shows the annual withholding return among what is due next", () => {
    const next = upcomingFilings(confirmed, "2027-02-11", 4).map((filing) => filing.id);
    expect(next).toEqual(["1604-E-2026", "0619-E-2027-02", "1701-2026", "2551Q-2027-Q1"]);
  });

  it("does not skip next year's first returns late in the year", () => {
    const next = upcomingFilings(confirmed, "2026-11-16", 6).map((filing) => filing.id);
    expect(next).toEqual([
      "0619-E-2026-11",
      "2551Q-2026-Q4",
      "1601-EQ-2026-Q4",
      "0619-E-2027-01",
      "1604-E-2026",
      "0619-E-2027-02",
    ]);
  });
});
