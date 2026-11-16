import { describe, expect, it } from "vitest";

import { FORM_INFO, normalizeFormCode } from "../parser/registration.ts";
import {
  BIR_FORMS,
  BIR_TAX_TYPE_LABEL,
  FORM_PAYMENT_TEXT,
  birForm,
  canonicalFormCode,
  formsFiledFor,
  isFiled,
  isOnCalendar,
} from "./bir-forms.ts";
import { filingsForPeriodYear, formsToFile } from "./deadlines.ts";
import type { TaxProfile } from "./tax-profile.ts";

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

const rows = (...forms: string[]) =>
  forms.map((form) => ({ taxType: "AS PRINTED", form, frequency: null, effectiveDate: null }));
const withCor = (...forms: string[]): TaxProfile => ({ ...profile, corTaxTypes: rows(...forms) });
const of = (filings: ReturnType<typeof filingsForPeriodYear>, form: string) =>
  filings.filter((filing) => filing.form === form);
const due = (filings: ReturnType<typeof filingsForPeriodYear>, id: string) =>
  filings.find((filing) => filing.id === id)?.dueDate;

describe("the table of BIR forms", () => {
  it("lists each form once, written the BIR's way", () => {
    const codes = BIR_FORMS.map((entry) => entry.form);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^\d{4}(-[A-Z]{1,2}|[A-Z])?$/);
  });

  it("describes every form in plain words", () => {
    for (const entry of BIR_FORMS) {
      expect(entry.title.length, entry.form).toBeGreaterThan(8);
      expect(entry.shortTitle.length, entry.form).toBeGreaterThan(4);
      expect(entry.frequency.length, entry.form).toBeGreaterThan(4);
      expect(BIR_TAX_TYPE_LABEL[entry.taxType], entry.form).toBeTruthy();
      expect(FORM_PAYMENT_TEXT[entry.payment], entry.form).toBeTruthy();
    }
  });

  it("says what to have ready for every return on the calendar", () => {
    for (const entry of BIR_FORMS) {
      if (isOnCalendar(entry.form)) expect(entry.needs.length, entry.form).toBeGreaterThan(0);
    }
  });

  it("covers every tax type a COR can list", () => {
    const covered = new Set(BIR_FORMS.map((entry) => entry.taxType));
    expect([...covered].sort()).toEqual(Object.keys(BIR_TAX_TYPE_LABEL).sort());
  });

  it("knows which forms are no longer filed", () => {
    const retired = [
      ...["0605", "2550M", "2551M", "1601-E", "1601-F", "1600", "1704"],
      ...["1702", "1602", "1603", "1604-CF"],
    ];
    for (const code of retired) {
      expect(isFiled(code), code).toBe(false);
      expect(isOnCalendar(code), code).toBe(false);
    }
    expect(isFiled("1604-E")).toBe(true);
    // A form that is not in the table is kept as filed, but it has no calendar.
    expect(isFiled("9999")).toBe(true);
    expect(isOnCalendar("9999")).toBe(false);
  });

  it("keeps one-off returns off the calendar", () => {
    const oneOff = ["1706", "1707", "1800", "1801", "2000-OT", "1606", "2552", "2553"];
    for (const code of [...oneOff, "2200-A", "2200-M", "2200-P"]) {
      expect(isFiled(code), code).toBe(true);
      expect(isOnCalendar(code), code).toBe(false);
    }
  });

  it("reads a form number however it is typed", () => {
    expect(canonicalFormCode("0619", "e")).toBe("0619-E");
    expect(canonicalFormCode("1702", "rt")).toBe("1702-RT");
    expect(canonicalFormCode("1701", "A")).toBe("1701A");
    expect(canonicalFormCode("2200", "an")).toBe("2200-AN");
    expect(canonicalFormCode("2000", "")).toBe("2000");
    expect(canonicalFormCode("9999", "X")).toBeNull();
    for (const entry of BIR_FORMS) {
      expect(normalizeFormCode(entry.form), entry.form).toBe(entry.form);
      expect(normalizeFormCode(entry.form.replace("-", "")), entry.form).toBe(entry.form);
      expect(normalizeFormCode(`BIR Form No. ${entry.form.replace("-", " ")}`), entry.form).toBe(
        entry.form,
      );
    }
  });

  it("feeds the form details the screens show", () => {
    expect(Object.keys(FORM_INFO).sort()).toEqual(BIR_FORMS.map((entry) => entry.form).sort());
    expect(FORM_INFO["0605"]?.active).toBe(false);
    expect(FORM_INFO["1601-C"]?.active).toBe(true);
    expect(birForm("1601-C")?.title).toBe(FORM_INFO["1601-C"]?.title);
  });
});

describe("the calendar for whatever a COR lists", () => {
  it("schedules every repeating form in the table when a COR lists it", () => {
    for (const entry of BIR_FORMS) {
      // An individual files one annual return, chosen from the profile, so these are skipped.
      if (["1701", "1701A", "1701-MS", "1700"].includes(entry.form)) continue;
      if (!isOnCalendar(entry.form)) continue;
      const filings = of(filingsForPeriodYear(withCor(entry.form), 2026), entry.form);
      expect(filings.length, entry.form).toBeGreaterThan(0);
      expect(new Set(filings.map((filing) => filing.id)).size, entry.form).toBe(filings.length);
      for (const filing of filings) {
        expect(filing.dueDate > filing.periodStart, filing.id).toBe(true);
        expect(filing.dueDate <= "2027-12-31", filing.id).toBe(true);
        expect(filing.payment, filing.id).toBe(entry.payment);
      }
    }
  });

  it("schedules withholding on salaries: monthly, December by January 15, and the annual list", () => {
    const filings = filingsForPeriodYear(withCor("1601-C", "1604-C"), 2026);
    expect(of(filings, "1601-C")).toHaveLength(12);
    expect(due(filings, "1601-C-2026-01")).toBe("2026-02-10");
    expect(due(filings, "1601-C-2026-11")).toBe("2026-12-10");
    expect(due(filings, "1601-C-2026-12")).toBe("2027-01-15");
    expect(due(filings, "1604-C-2026")).toBe("2027-01-31");
    expect(of(filings, "1604-C")[0]?.payment).toBe("none");
    expect(of(filings, "1601-C")[0]?.payment).toBe("not_estimated");
  });

  it("schedules final withholding tax like expanded withholding tax", () => {
    const filings = filingsForPeriodYear(withCor("0619-F", "1601-FQ", "1604-F"), 2026);
    expect(of(filings, "0619-F")).toHaveLength(8);
    expect(due(filings, "0619-F-2026-02")).toBe("2026-03-10");
    expect(filings.some((filing) => filing.id === "0619-F-2026-03")).toBe(false);
    expect(due(filings, "1601-FQ-2026-Q1")).toBe("2026-04-30");
    expect(due(filings, "1601-FQ-2026-Q4")).toBe("2027-01-31");
    expect(due(filings, "1604-F-2026")).toBe("2027-01-31");
  });

  it("schedules the other quarterly and monthly returns", () => {
    const filings = filingsForPeriodYear(
      withCor("1602Q", "1603Q", "1600-VT", "1600-PT", "2000", "1707-A"),
      2026,
    );
    expect(due(filings, "1602Q-2026-Q2")).toBe("2026-07-31");
    expect(due(filings, "1603Q-2026-Q3")).toBe("2026-10-31");
    expect(of(filings, "1600-VT")).toHaveLength(12);
    expect(due(filings, "1600-VT-2026-12")).toBe("2027-01-10");
    expect(due(filings, "1600-PT-2026-06")).toBe("2026-07-10");
    expect(of(filings, "2000")).toHaveLength(12);
    expect(due(filings, "2000-2026-01")).toBe("2026-02-05");
    expect(due(filings, "1707-A-2026")).toBe("2027-04-15");
  });

  it("gives a corporation its own income tax returns instead of 1701Q and 1701", () => {
    const corporate = withCor("1702Q", "1702-RT", "2550Q", "1601-C");
    expect(formsToFile(corporate)).not.toContain("1701Q");
    const filings = filingsForPeriodYear(corporate, 2026);
    expect(filings.some((filing) => filing.form.startsWith("1701"))).toBe(false);
    expect(of(filings, "1702Q")).toHaveLength(3);
    expect(due(filings, "1702Q-2026-Q1")).toBe("2026-05-30");
    expect(due(filings, "1702Q-2026-Q3")).toBe("2026-11-29");
    expect(due(filings, "1702-RT-2026")).toBe("2027-04-15");
  });

  it("keeps an individual's returns when the COR lists both kinds", () => {
    const forms = formsToFile(withCor("1701Q", "1701", "1702Q"));
    expect(forms).toContain("1701Q");
    expect(forms).toContain("1701");
  });

  it("leaves one-off, retired and unknown forms off the calendar without failing", () => {
    const listed = withCor("1706", "2000-OT", "2200-A", "1800", "1704", "0605", "9999");
    expect(filingsForPeriodYear(listed, 2026)).toEqual(filingsForPeriodYear(profile, 2026));
  });

  it("does not add the salary-only return 1700 for someone in business", () => {
    expect(formsToFile(withCor("1700", "1701Q"))).not.toContain("1700");
  });

  it("keeps one annual return when the COR also lists the optional 1701-MS", () => {
    const filings = filingsForPeriodYear(withCor("1701", "1701-MS", "1701Q"), 2026);
    expect(filings.filter((filing) => filing.dueDate === "2027-04-15")).toHaveLength(1);
    expect(filings.some((filing) => filing.form === "1701-MS")).toBe(false);
  });

  it("schedules the returns of banks, race tracks, clinics and digital sellers", () => {
    const filings = filingsForPeriodYear(
      withCor("0620", "1621", "1600-WP", "2200-C", "2550-DS"),
      2026,
    );
    expect(of(filings, "0620")).toHaveLength(8);
    expect(due(filings, "0620-2026-01")).toBe("2026-02-10");
    expect(due(filings, "1621-2026-Q1")).toBe("2026-04-30");
    expect(of(filings, "1600-WP")).toHaveLength(12);
    expect(due(filings, "1600-WP-2026-12")).toBe("2027-01-20");
    expect(of(filings, "2200-C")).toHaveLength(12);
    expect(due(filings, "2200-C-2026-03")).toBe("2026-04-10");
    expect(due(filings, "2550-DS-2026-Q4")).toBe("2027-01-25");
  });
});

describe("old form numbers on an old COR", () => {
  it("names what is filed today in place of a retired form", () => {
    expect(formsFiledFor("2551M")).toEqual(["2551Q"]);
    expect(formsFiledFor("1601-E")).toEqual(["0619-E", "1601-EQ", "1604-E"]);
    expect(formsFiledFor("1604-CF")).toEqual(["1604-C", "1604-F"]);
    expect(formsFiledFor("0605")).toEqual([]);
    expect(formsFiledFor("2551Q")).toEqual(["2551Q"]);
    expect(formsFiledFor("9999")).toEqual(["9999"]);
    for (const entry of BIR_FORMS) {
      for (const code of entry.replacedBy ?? []) expect(isOnCalendar(code), code).toBe(true);
    }
  });

  it("schedules today's returns for them", () => {
    const old = withCor("1601-E", "2551M", "1601-F", "1604-CF", "1600", "1602", "1603", "2550M");
    const forms = formsToFile(old).sort();
    expect(forms).toEqual(
      [
        ...["0619-E", "1601-EQ", "1604-E", "0619-F", "1601-FQ", "1604-F", "1604-C"],
        ...["1600-VT", "1600-PT", "1602Q", "1603Q", "2550Q", "2551Q", "1701Q", "1701A"],
      ].sort(),
    );
    const filed = new Set(filingsForPeriodYear(old, 2026).map((filing) => filing.form));
    for (const code of ["1601-E", "2551M", "1601-F", "1604-CF", "1600", "1602", "1603", "2550M"]) {
      expect(filed.has(code), code).toBe(false);
    }
  });

  it("treats the old corporate return 1702 as today's 1702-RT", () => {
    const filings = filingsForPeriodYear(withCor("1702", "1702Q"), 2026);
    expect(filings.some((filing) => filing.form.startsWith("1701"))).toBe(false);
    expect(due(filings, "1702-RT-2026")).toBe("2027-04-15");
  });
});
