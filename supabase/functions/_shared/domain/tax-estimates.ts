/**
 * Estimates of the tax each return will ask for, from the ledger so far. These follow the
 * Takatax2 rules engine (NIRC as amended by TRAIN, CREATE and EOPT) but are simplified:
 * they are a guide for the tracker and the deadline list, not the figures to file.
 */

import { type IsoDate, addDays, parseIso, quarterBounds } from "./dates.ts";
import type { Filing } from "./deadlines.ts";
import { type LedgerRecord, round2 } from "./records.ts";
import type { TaxProfile, TaxTypeId } from "./tax-profile.ts";

// Graduated income tax for individuals from 2023: [lower bound, tax at lower bound, rate above]
const GRADUATED_2023: [number, number, number][] = [
  [0, 0, 0],
  [250_000, 0, 0.15],
  [400_000, 22_500, 0.2],
  [800_000, 102_500, 0.25],
  [2_000_000, 402_500, 0.3],
  [8_000_000, 2_202_500, 0.35],
];
const GRADUATED_2018_2022: [number, number, number][] = [
  [0, 0, 0],
  [250_000, 0, 0.2],
  [400_000, 30_000, 0.25],
  [800_000, 130_000, 0.3],
  [2_000_000, 490_000, 0.32],
  [8_000_000, 2_410_000, 0.35],
];

export const EIGHT_PERCENT_RATE = 0.08;
export const EIGHT_PERCENT_REDUCTION = 250_000;
export const OSD_RATE = 0.4;
export const VAT_RATE = 0.12;
const REPRESENTATION_CAP = { services: 0.01, goods: 0.005 } as const;

export function graduatedIncomeTax(taxableIncome: number, year: number): number {
  if (taxableIncome <= 0) return 0;
  const table = year >= 2023 ? GRADUATED_2023 : GRADUATED_2018_2022;
  for (let i = table.length - 1; i >= 0; i--) {
    const [lower, base, rate] = table[i] ?? [0, 0, 0];
    if (taxableIncome > lower) return round2(base + (taxableIncome - lower) * rate);
  }
  return 0;
}

/** 3% percentage tax, except 1% from July 2020 to June 2023 (CREATE Act). */
export function percentageTaxRate(on: IsoDate): number {
  return on >= "2020-07-01" && on <= "2023-06-30" ? 0.01 : 0.03;
}

const inRange = (date: IsoDate, start: IsoDate, end: IsoDate) => date >= start && date <= end;

/** Gross sales between two dates, without VAT for VAT-registered taxpayers. */
export function grossSales(
  records: LedgerRecord[],
  profile: TaxProfile,
  start: IsoDate,
  end: IsoDate,
) {
  return records
    .filter((r) => r.kind === "sale" && inRange(r.date, start, end))
    .reduce((sum, r) => sum + r.amount - (profile.vatRegistered ? r.vat : 0), 0);
}

/** Expenses that reduce income tax under itemized deductions, with the meals cap applied. */
export function deductibleExpenses(
  records: LedgerRecord[],
  profile: TaxProfile,
  start: IsoDate,
  end: IsoDate,
): { costOfSales: number; deductions: number } {
  let costOfSales = 0;
  let deductions = 0;
  let representation = 0;
  for (const r of records) {
    if (r.kind !== "expense" || !inRange(r.date, start, end)) continue;
    const amount = r.amount - (profile.vatRegistered ? r.vat : 0);
    switch (r.category) {
      case "personal":
      case "equipment": // a capital asset: only depreciation counts, not yet supported
        break;
      case "cost_of_sales":
        if (profile.businessType === "goods") costOfSales += amount;
        else deductions += amount;
        break;
      case "representation":
        representation += amount;
        break;
      default:
        deductions += amount;
    }
  }
  const gross = grossSales(records, profile, start, end);
  const cap = Math.max(REPRESENTATION_CAP[profile.businessType] * (gross - costOfSales), 0);
  return { costOfSales, deductions: deductions + Math.min(representation, cap) };
}

/** Income tax due on the year's figures from January 1 to `end` (the 1701Q method). */
export function incomeTaxToDate(
  records: LedgerRecord[],
  profile: TaxProfile,
  end: IsoDate,
): number {
  const { year } = parseIso(end);
  const start = `${year}-01-01`;
  const gross = grossSales(records, profile, start, end);
  if (profile.incomeTaxOption === "eight_percent") {
    const reduction = profile.mixedIncome ? 0 : EIGHT_PERCENT_REDUCTION;
    return round2(Math.max(gross - reduction, 0) * EIGHT_PERCENT_RATE);
  }
  const { costOfSales, deductions } = deductibleExpenses(records, profile, start, end);
  const grossIncome = gross - (profile.businessType === "goods" ? costOfSales : 0);
  const taxable =
    profile.incomeTaxOption === "graduated_osd"
      ? grossIncome * (1 - OSD_RATE)
      : grossIncome - deductions;
  return graduatedIncomeTax(taxable, year);
}

/** Income tax withheld by clients (2307s received) between two dates: a credit. */
export function withholdingCredits(records: LedgerRecord[], start: IsoDate, end: IsoDate): number {
  return records
    .filter((r) => r.kind === "withholding" && inRange(r.date, start, end))
    .reduce((sum, r) => sum + r.taxWithheld, 0);
}

/** Tax incurred in one period, per tax type, before credits. Used for the tracker chart. */
export function taxForPeriod(
  records: LedgerRecord[],
  profile: TaxProfile,
  taxType: TaxTypeId,
  start: IsoDate,
  end: IsoDate,
): number {
  switch (taxType) {
    case "income_tax": {
      // Income tax is computed on the year to date, so a period's share is the difference
      // between the tax to date at its end and at the day before it starts.
      const dayBefore = addDays(start, -1);
      const before =
        parseIso(dayBefore).year === parseIso(start).year
          ? incomeTaxToDate(records, profile, dayBefore)
          : 0;
      return round2(Math.max(incomeTaxToDate(records, profile, end) - before, 0));
    }
    case "percentage_tax":
      if (profile.vatRegistered || profile.incomeTaxOption === "eight_percent") return 0;
      return round2(grossSales(records, profile, start, end) * percentageTaxRate(end));
    case "vat": {
      if (!profile.vatRegistered) return 0;
      const output = records
        .filter((r) => r.kind === "sale" && inRange(r.date, start, end))
        .reduce((sum, r) => sum + r.vat, 0);
      const input = records
        .filter((r) => r.kind === "expense" && inRange(r.date, start, end))
        .reduce((sum, r) => sum + r.vat, 0);
      return round2(Math.max(output - input, 0));
    }
    case "withholding":
      if (!profile.withholdingAgent) return 0;
      return round2(
        records
          .filter((r) => r.kind === "expense" && inRange(r.date, start, end))
          .reduce((sum, r) => sum + r.taxWithheld, 0),
      );
  }
}

export interface FilingEstimate {
  /** Tax the return computes before credits. */
  taxDue: number;
  /** Credits from 2307s received in the period. */
  credits: number;
  /** What to pay: tax due less credits, never below zero. */
  payable: number;
}

/** Estimated amount for one return, from the records available so far. */
export function estimateFiling(
  filing: Filing,
  records: LedgerRecord[],
  profile: TaxProfile,
): FilingEstimate {
  const { periodStart: start, periodEnd: end } = filing;
  let taxDue = 0;
  let credits = 0;
  switch (filing.form) {
    case "1701Q": {
      // Cumulative return: tax to date, less what earlier quarters already paid, less 2307s.
      const { year, month } = parseIso(end);
      const quarterStart = quarterBounds(year, (month / 3) as 1 | 2 | 3).start;
      taxDue = taxForPeriod(records, profile, "income_tax", quarterStart, end);
      credits = withholdingCredits(records, quarterStart, end);
      break;
    }
    case "1701A":
    case "1701": {
      // The annual return covers what the three quarterly returns did not: the fourth quarter.
      const { year } = parseIso(end);
      const q4 = quarterBounds(year, 4);
      taxDue = taxForPeriod(records, profile, "income_tax", q4.start, end);
      credits = withholdingCredits(records, q4.start, end);
      break;
    }
    case "2551Q":
      taxDue = taxForPeriod(records, profile, "percentage_tax", start, end);
      break;
    case "2550Q":
      taxDue = taxForPeriod(records, profile, "vat", start, end);
      break;
    case "0619-E":
    case "1601-EQ":
      taxDue = taxForPeriod(records, profile, "withholding", start, end);
      break;
  }
  return {
    taxDue: round2(taxDue),
    credits: round2(credits),
    payable: round2(Math.max(taxDue - credits, 0)),
  };
}
