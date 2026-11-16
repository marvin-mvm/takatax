/**
 * The returns a profile files, with their periods and due dates (NIRC as amended by EOPT).
 * Due dates falling on weekends or holidays are not moved here; the BIR moves them to the next
 * working day.
 *
 * Which returns: the ones the profile's answers call for (its tax types), plus every return
 * confirmed from the COR. A return listed on the COR has to be filed even when there is nothing to
 * pay, so the COR can add returns but never takes one away.
 */

import {
  type IsoDate,
  addDays,
  endOfMonth,
  isoDate,
  monthShortName,
  quarterBounds,
} from "./dates.ts";
import { FORM_INFO } from "../parser/registration.ts";
import { type TaxProfile, type TaxTypeId, taxTypesFor } from "./tax-profile.ts";

export interface Filing {
  /** Stable key, for example "1701Q-2026-Q1". */
  id: string;
  form: string;
  title: string;
  taxType: TaxTypeId;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  periodLabel: string;
  dueDate: IsoDate;
  /** What the taxpayer should have ready before the deadline. */
  needs: string[];
}

type Quarter = 1 | 2 | 3 | 4;
const QUARTERS: Quarter[] = [1, 2, 3, 4];

/**
 * The forms confirmed from the COR that are still filed. Forms the BIR retired, like the
 * registration fee on 0605, are left out.
 */
function confirmedForms(profile: TaxProfile): Set<string> {
  const forms = new Set<string>();
  for (const row of profile.corTaxTypes ?? []) {
    if (row.form && FORM_INFO[row.form]?.active !== false) forms.add(row.form);
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

/** Every return whose period falls in `year`, plus the annual returns for `year`. */
export function filingsForPeriodYear(profile: TaxProfile, year: number): Filing[] {
  const types = taxTypesFor(profile);
  const confirmed = confirmedForms(profile);
  const itemized = profile.incomeTaxOption === "graduated_itemized";
  const filings: Filing[] = [];

  if (types.includes("income_tax")) {
    const salesNeeds = [
      "Sales invoices you issued in the quarter",
      "Form 2307s your clients gave you for the quarter",
    ];
    if (itemized) salesNeeds.push("Expense receipts and invoices addressed to your TIN");
    const dueDates: Record<1 | 2 | 3, IsoDate> = {
      1: isoDate(year, 5, 15),
      2: isoDate(year, 8, 15),
      3: isoDate(year, 11, 15),
    };
    for (const q of [1, 2, 3] as const) {
      // 1701Q is cumulative: each return covers January 1 to the end of its quarter.
      const { end } = quarterBounds(year, q);
      filings.push({
        id: `1701Q-${year}-Q${q}`,
        form: "1701Q",
        title: "Quarterly income tax",
        taxType: "income_tax",
        periodStart: `${year}-01-01`,
        periodEnd: end,
        periodLabel: `Q${q} ${year} (January to ${monthShortName(q * 3)})`,
        dueDate: dueDates[q],
        needs: salesNeeds,
      });
    }
    const annualForm = annualIncomeTaxForm(profile);
    filings.push({
      id: `${annualForm}-${year}`,
      form: annualForm,
      title: "Annual income tax",
      taxType: "income_tax",
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
      periodLabel: `Year ${year}`,
      dueDate: isoDate(year + 1, 4, 15),
      needs: [
        "The year's sales invoices (fourth quarter included)",
        "All Form 2307s for the year",
        "Audited financial statements if sales passed ₱3 million",
      ],
    });
  }

  // The 8% rate replaces percentage tax, even when the COR still lists 2551Q.
  const percentageTax =
    types.includes("percentage_tax") ||
    (confirmed.has("2551Q") && profile.incomeTaxOption !== "eight_percent");
  if (percentageTax) {
    for (const q of QUARTERS) {
      const { start, end } = quarterBounds(year, q);
      filings.push({
        id: `2551Q-${year}-Q${q}`,
        form: "2551Q",
        title: "Quarterly percentage tax",
        taxType: "percentage_tax",
        periodStart: start,
        periodEnd: end,
        periodLabel: `Q${q} ${year}`,
        dueDate: addDays(end, 25),
        needs: ["Sales invoices you issued in the quarter"],
      });
    }
  }

  if (types.includes("vat") || confirmed.has("2550Q")) {
    for (const q of QUARTERS) {
      const { start, end } = quarterBounds(year, q);
      filings.push({
        id: `2550Q-${year}-Q${q}`,
        form: "2550Q",
        title: "Quarterly VAT",
        taxType: "vat",
        periodStart: start,
        periodEnd: end,
        periodLabel: `Q${q} ${year}`,
        dueDate: addDays(end, 25),
        needs: [
          "Sales invoices showing VAT",
          "Purchase invoices showing VAT, addressed to your TIN",
        ],
      });
    }
  }

  const withholding = types.includes("withholding");
  if (withholding || confirmed.has("0619-E")) {
    for (const q of QUARTERS) {
      // 0619-E for the first two months of each quarter, due the 10th of the next month.
      for (const offset of [0, 1]) {
        const month = q * 3 - 2 + offset;
        filings.push({
          id: `0619-E-${year}-${String(month).padStart(2, "0")}`,
          form: "0619-E",
          title: "Monthly withholding tax",
          taxType: "withholding",
          periodStart: isoDate(year, month, 1),
          periodEnd: endOfMonth(year, month),
          periodLabel: `${monthShortName(month)} ${year}`,
          dueDate: isoDate(year, month + 1, 10),
          needs: ["Rent and contractor payments for the month, and the tax you held back"],
        });
      }
    }
  }
  if (withholding || confirmed.has("1601-EQ")) {
    for (const q of QUARTERS) {
      const { start, end } = quarterBounds(year, q);
      filings.push({
        id: `1601-EQ-${year}-Q${q}`,
        form: "1601-EQ",
        title: "Quarterly withholding tax",
        taxType: "withholding",
        periodStart: start,
        periodEnd: end,
        periodLabel: `Q${q} ${year}`,
        dueDate: endOfMonth(year, q * 3 + 1),
        needs: [
          "The third month's rent and contractor payments",
          "Copies of the Form 2307s you gave your payees",
        ],
      });
    }
  }
  if (withholding || confirmed.has("1604-E")) {
    // The yearly list of payees and tax withheld, due March 1 of the next year. Nothing is paid
    // with it: the tax went in with the 0619-E and 1601-EQ returns.
    filings.push({
      id: `1604-E-${year}`,
      form: "1604-E",
      title: "Annual withholding tax information return",
      taxType: "withholding",
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
      periodLabel: `Year ${year}`,
      dueDate: isoDate(year + 1, 3, 1),
      needs: [
        "The year's rent and contractor payments, listed by payee",
        "The tax you held back from each payee, matching your four 1601-EQ returns",
      ],
    });
  }

  return filings.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
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
