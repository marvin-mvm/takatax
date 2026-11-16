/**
 * The returns a profile files, with their periods and due dates (NIRC as amended by EOPT).
 * Due dates falling on weekends or holidays are not moved here; the BIR moves them to the next
 * working day.
 *
 * Which returns: the ones the profile's answers call for (its tax types), plus every return
 * confirmed from the COR. A return listed on the COR has to be filed even when there is nothing to
 * pay, so the COR can add returns but never takes one away. Any form in the table of BIR forms
 * (bir-forms.ts) that repeats on a calendar is scheduled, whatever COR it came from.
 */

import {
  type BirForm,
  type BirTaxType,
  type FormPayment,
  birForm,
  formsFiledFor,
  isOnCalendar,
} from "./bir-forms.ts";
import {
  type IsoDate,
  addDays,
  endOfMonth,
  isoDate,
  monthShortName,
  quarterBounds,
} from "./dates.ts";
import { type TaxProfile, type TaxTypeId, taxTypesFor } from "./tax-profile.ts";

export interface Filing {
  /** Stable key, for example "1701Q-2026-Q1". */
  id: string;
  form: string;
  title: string;
  /** The tracker's tax type the amount belongs to; "other" for taxes the tracker does not chart. */
  taxType: TaxTypeId | "other";
  periodStart: IsoDate;
  periodEnd: IsoDate;
  periodLabel: string;
  dueDate: IsoDate;
  /** What the taxpayer should have ready before the deadline. */
  needs: string[];
  /** Whether an amount is estimated, nothing is paid, or the amount is not computed yet. */
  payment: FormPayment;
}

type Quarter = 1 | 2 | 3 | 4;
const QUARTERS: Quarter[] = [1, 2, 3, 4];
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const TRACKER_TYPE: Partial<Record<BirTaxType, TaxTypeId>> = {
  income_tax: "income_tax",
  vat: "vat",
  percentage_tax: "percentage_tax",
  withholding_expanded: "withholding",
};

/**
 * The forms confirmed from the COR, as they are filed today. A form number the BIR retired is
 * swapped for what replaced it (an old COR's 2551M means 2551Q), and one with nothing in its
 * place, like the registration fee on 0605, is left out.
 */
function confirmedForms(profile: TaxProfile): Set<string> {
  const forms = new Set<string>();
  for (const row of profile.corTaxTypes ?? []) {
    if (!row.form) continue;
    for (const code of formsFiledFor(row.form)) forms.add(code);
  }
  return forms;
}

/**
 * The annual income tax return. Form 1701A only takes business income under the 8% rate or the
 * standard deduction, so itemized deductions or a salary always mean Form 1701. Otherwise the
 * form confirmed from the COR is used, and Form 1701A when the COR names neither or both.
 */
export function annualIncomeTaxForm(profile: TaxProfile): "1701" | "1701A" {
  if (profile.incomeTaxOption === "graduated_itemized" || profile.mixedIncome) return "1701";
  const confirmed = confirmedForms(profile);
  return confirmed.has("1701") && !confirmed.has("1701A") ? "1701" : "1701A";
}

/**
 * The forms to put on the calendar: what the profile's answers call for, plus every repeating
 * return confirmed from the COR.
 */
export function formsToFile(profile: TaxProfile): string[] {
  const types = taxTypesFor(profile);
  const confirmed = confirmedForms(profile);
  const forms = new Set<string>();

  // A COR that lists corporate income tax returns and no individual ones belongs to a
  // corporation or partnership, which files those instead of 1701Q and 1701.
  const names = [...confirmed];
  const corporate =
    names.some((code) => code.startsWith("1702")) && !names.some((code) => code.startsWith("1701"));
  if (!corporate) {
    forms.add("1701Q");
    forms.add(annualIncomeTaxForm(profile));
  }
  if (types.includes("percentage_tax")) forms.add("2551Q");
  if (types.includes("vat")) forms.add("2550Q");
  if (types.includes("withholding")) {
    forms.add("0619-E");
    forms.add("1601-EQ");
    forms.add("1604-E");
  }

  for (const code of confirmed) {
    if (!isOnCalendar(code)) continue;
    // One annual return for an individual, chosen above. 1701-MS is an optional stand-in for
    // it, and 1700 is for salary income alone.
    if (["1701", "1701A", "1701-MS", "1700"].includes(code)) continue;
    // The 8% rate replaces percentage tax, even when the COR still lists 2551Q.
    if (code === "2551Q" && profile.incomeTaxOption === "eight_percent") continue;
    forms.add(code);
  }
  return [...forms];
}

const pad = (month: number) => String(month).padStart(2, "0");

/** One form's returns for the periods in `year`. */
function schedule(entry: BirForm, year: number, profile: TaxProfile): Filing[] {
  const common = {
    form: entry.form,
    title: entry.shortTitle,
    taxType: TRACKER_TYPE[entry.taxType] ?? ("other" as const),
    needs: entry.needs,
    payment: entry.payment,
  };
  const quarterly = (q: Quarter, dueDate: IsoDate): Filing => {
    const { start, end } = quarterBounds(year, q);
    return {
      ...common,
      id: `${entry.form}-${year}-Q${q}`,
      periodStart: start,
      periodEnd: end,
      periodLabel: `Q${q} ${year}`,
      dueDate,
    };
  };
  const monthly = (month: number, dueDate: IsoDate): Filing => ({
    ...common,
    id: `${entry.form}-${year}-${pad(month)}`,
    periodStart: isoDate(year, month, 1),
    periodEnd: endOfMonth(year, month),
    periodLabel: `${monthShortName(month)} ${year}`,
    dueDate,
  });
  const annual = (dueDate: IsoDate): Filing => ({
    ...common,
    id: `${entry.form}-${year}`,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    periodLabel: `Year ${year}`,
    dueDate,
  });

  switch (entry.schedule) {
    case "income_quarterly": {
      const needs =
        profile.incomeTaxOption === "graduated_itemized"
          ? [...entry.needs, "Expense receipts and invoices addressed to your TIN"]
          : entry.needs;
      const dueDates: Record<1 | 2 | 3, IsoDate> = {
        1: isoDate(year, 5, 15),
        2: isoDate(year, 8, 15),
        3: isoDate(year, 11, 15),
      };
      // 1701Q is cumulative: each return covers January 1 to the end of its quarter.
      return ([1, 2, 3] as const).map((q) => ({
        ...quarterly(q, dueDates[q]),
        periodStart: `${year}-01-01`,
        periodLabel: `Q${q} ${year} (January to ${monthShortName(q * 3)})`,
        needs,
      }));
    }
    case "corporate_quarterly":
      // The first three quarters only: the annual return covers the fourth.
      return ([1, 2, 3] as const).map((q) => quarterly(q, addDays(quarterBounds(year, q).end, 60)));
    case "quarterly_25th":
      return QUARTERS.map((q) => quarterly(q, addDays(quarterBounds(year, q).end, 25)));
    case "quarterly_month_end":
      return QUARTERS.map((q) => quarterly(q, endOfMonth(year, q * 3 + 1)));
    case "monthly_10th":
      return MONTHS.map((month) => monthly(month, isoDate(year, month + 1, 10)));
    case "monthly_10th_december_15th":
      return MONTHS.map((month) =>
        monthly(month, month === 12 ? isoDate(year + 1, 1, 15) : isoDate(year, month + 1, 10)),
      );
    case "monthly_10th_two_of_three":
      // The third month of each quarter goes in with the quarterly return instead.
      return MONTHS.filter((month) => month % 3 !== 0).map((month) =>
        monthly(month, isoDate(year, month + 1, 10)),
      );
    case "monthly_5th":
      return MONTHS.map((month) => monthly(month, isoDate(year, month + 1, 5)));
    case "monthly_20th":
      return MONTHS.map((month) => monthly(month, isoDate(year, month + 1, 20)));
    case "annual_april_15":
      return [annual(isoDate(year + 1, 4, 15))];
    case "annual_january_31":
      return [annual(isoDate(year + 1, 1, 31))];
    case "annual_march_1":
      return [annual(isoDate(year + 1, 3, 1))];
    case "per_transaction":
    case "retired":
      return [];
  }
}

/** Every return whose period falls in `year`, plus the annual returns for `year`. */
export function filingsForPeriodYear(profile: TaxProfile, year: number): Filing[] {
  return formsToFile(profile)
    .flatMap((code) => {
      const entry = birForm(code);
      return entry ? schedule(entry, year, profile) : [];
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * Returns due on or after `from`, soonest first. Last year's periods are included for the annual
 * returns still to come, and next year's so that late in the year January's returns are not
 * skipped.
 */
export function upcomingFilings(profile: TaxProfile, from: IsoDate, limit = 6): Filing[] {
  const year = Number(from.slice(0, 4));
  return [year - 1, year, year + 1]
    .flatMap((periodYear) => filingsForPeriodYear(profile, periodYear))
    .filter((filing) => filing.dueDate >= from)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}
