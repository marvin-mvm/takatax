import { describe, expect, it } from "vitest";

import {
  flagsFromTaxTypes,
  normalizeFormCode,
  parseRegistration,
  parseTaxTypes,
} from "./registration.ts";

describe("normalizeFormCode", () => {
  it("writes forms the way the BIR does", () => {
    expect(normalizeFormCode("0619E")).toBe("0619-E");
    expect(normalizeFormCode("1601 EQ")).toBe("1601-EQ");
    expect(normalizeFormCode("1601-EQ")).toBe("1601-EQ");
    expect(normalizeFormCode("2551Q")).toBe("2551Q");
    expect(normalizeFormCode("2551 Q")).toBe("2551Q");
    expect(normalizeFormCode("BIR Form No. 1701Q")).toBe("1701Q");
    expect(normalizeFormCode("1701")).toBe("1701");
    expect(normalizeFormCode("0605")).toBe("0605");
  });

  it("is null for anything that is not a form", () => {
    expect(normalizeFormCode("")).toBeNull();
    expect(normalizeFormCode(null)).toBeNull();
    expect(normalizeFormCode("Quarterly")).toBeNull();
  });
});

describe("parseTaxTypes", () => {
  it("keeps one row per form and drops blanks and repeats", () => {
    const rows = parseTaxTypes([
      {
        taxType: "WITHHOLDING TAX - EXPANDED",
        form: "0619E",
        frequency: "Monthly",
        effectiveDate: "2022-08-15",
      },
      {
        taxType: "WITHHOLDING TAX - EXPANDED",
        form: "1601EQ",
        frequency: "Quarterly",
        effectiveDate: null,
      },
      {
        taxType: "WITHHOLDING TAX - EXPANDED",
        form: "1601-EQ",
        frequency: null,
        effectiveDate: null,
      },
      {
        taxType: "PERCENTAGE TAX - QUARTERLY",
        form: "2551Q",
        frequency: null,
        effectiveDate: "bad",
      },
      { taxType: "  ", form: null },
    ]);
    expect(rows.map((r) => r.form)).toEqual(["0619-E", "1601-EQ", "2551Q"]);
    expect(rows[0]?.effectiveDate).toBe("2022-08-15");
    expect(rows[2]?.effectiveDate).toBeNull();
  });

  it("reads older readings that kept only the names", () => {
    expect(parseTaxTypes(["INDIVIDUAL INCOME TAX"])).toEqual([
      { taxType: "INDIVIDUAL INCOME TAX", form: null, frequency: null, effectiveDate: null },
    ]);
  });
});

describe("parseRegistration", () => {
  it("tidies a COR reading", () => {
    const cor = parseRegistration({
      isCor: true,
      tin: "912-345-678",
      branchCode: "00000",
      registeredName: "JUAN  DELA CRUZ",
      tradeName: "JDC Design Studio",
      registeredAddress: "123 Rizal St., Brgy. San Roque, Cebu City",
      rdoCode: "081",
      lineOfBusiness: ["Graphic design activities", "Other information technology services"],
      registrationDate: "2022-08-15",
      tinIssuanceDate: "2013-04-29",
      taxpayerType: "Individual",
      taxTypes: [
        {
          taxType: "PERCENTAGE TAX - QUARTERLY",
          form: "2551Q",
          frequency: null,
          effectiveDate: null,
        },
      ],
      vatRegistered: false,
      eightPercentIndicated: false,
    });
    expect(cor.registeredName).toBe("JUAN DELA CRUZ");
    expect(cor.lineOfBusiness).toBe(
      "Graphic design activities; Other information technology services",
    );
    expect(cor.taxTypes[0]?.form).toBe("2551Q");
    expect(cor.vatRegistered).toBe(false);
  });

  it("marks VAT when a VAT return is listed, even if the flag was missed", () => {
    const cor = parseRegistration({
      taxTypes: [{ taxType: "VALUE-ADDED TAX", form: "2550Q" }],
      vatRegistered: false,
    });
    expect(cor.vatRegistered).toBe(true);
  });

  it("never throws on junk", () => {
    expect(parseRegistration(null).taxTypes).toEqual([]);
    expect(parseRegistration("nope").tin).toBeNull();
  });
});

describe("flagsFromTaxTypes", () => {
  it("finds a withholding agent from 0619-E or 1601-EQ", () => {
    expect(
      flagsFromTaxTypes(parseTaxTypes([{ taxType: "WITHHOLDING TAX - EXPANDED", form: "0619E" }])),
    ).toEqual({ vatRegistered: false, withholdingAgent: true });
  });

  it("finds a withholding agent from the printed name when no form is shown", () => {
    expect(
      flagsFromTaxTypes(parseTaxTypes(["WITHHOLDING TAX - EXPANDED/OTHERS"])).withholdingAgent,
    ).toBe(true);
  });

  it("is neither for percentage and income tax only", () => {
    expect(
      flagsFromTaxTypes(
        parseTaxTypes([
          { taxType: "PERCENTAGE TAX - QUARTERLY", form: "2551Q" },
          { taxType: "INCOME TAX", form: "1701Q" },
        ]),
      ),
    ).toEqual({ vatRegistered: false, withholdingAgent: false });
  });
});
