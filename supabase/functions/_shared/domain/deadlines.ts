/**
 * The returns a profile files, with their periods and due dates (NIRC as amended by EOPT).
 * Due dates falling on weekends or holidays are not moved here; the BIR moves them to the next
 * working day.
 */

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

/** Every return whose period falls in `year`, plus the annual income tax return for `year`. */
export function filingsForPeriodYear(profile: TaxProfile, year: number): Filing[] {
  const types = taxTypesFor(profile);
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
    // 1701A for the 8% option or OSD with business income only; 1701 otherwise.
    const annualForm = itemized || profile.mixedIncome ? "1701" : "1701A";
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

  if (types.includes("percentage_tax")) {
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

  if (types.includes("vat")) {
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

  if (types.includes("withholding")) {
    for (const q of QUARTERS) {
      const { start, end } = quarterBounds(year, q);
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

  return filings.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Returns due on or after `from`, soonest first, looking at this year's and last year's periods. */
export function upcomingFilings(profile: TaxProfile, from: IsoDate, limit = 6): Filing[] {
  const year = Number(from.slice(0, 4));
  return [...filingsForPeriodYear(profile, year - 1), ...filingsForPeriodYear(profile, year)]
    .filter((filing) => filing.dueDate >= from)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}
