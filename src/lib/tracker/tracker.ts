/**
 * Everything the tracker shows, computed from the ledger: the monthly series behind the line
 * and bar charts, the split behind the pie chart, the totals and the filtered table rows.
 */

import { endOfMonth, isoDate, monthShortName } from "@shared/domain/dates.ts";
import { type LedgerRecord, recordTaxTypes, round2 } from "@shared/domain/records.ts";
import { taxForPeriod } from "@shared/domain/tax-estimates.ts";
import { type TaxProfile, type TaxTypeId, taxTypesFor } from "@shared/domain/tax-profile.ts";

export type ChartKind = "line" | "bar" | "pie";
export type TaxFilter = "all" | TaxTypeId;

export interface TrackerFilters {
  year: number;
  fromMonth: number;
  toMonth: number;
  taxType: TaxFilter;
}

export interface MonthPoint {
  month: number;
  label: string;
  /** Sales collected (VAT included). */
  earned: number;
  /** Expenses paid. */
  spent: number;
  /** Tax that month's figures add, for the selected tax types. */
  tax: number;
}

export interface Totals {
  earned: number;
  spent: number;
  tax: number;
  /** What is left of sales after expenses and tax. Can be negative. */
  kept: number;
}

export interface PieSlice {
  key: "spent" | "tax" | "kept";
  label: string;
  value: number;
}

export interface TableRow extends LedgerRecord {
  taxTypes: TaxTypeId[];
}

const inMonth = (record: LedgerRecord, year: number, month: number) =>
  record.date >= isoDate(year, month, 1) && record.date <= endOfMonth(year, month);

/** Whether a record counts under the tax-type filter. */
function matches(record: LedgerRecord, profile: TaxProfile, taxType: TaxFilter): boolean {
  return taxType === "all" || recordTaxTypes(record, profile).includes(taxType);
}

/** The tax types a filter covers, limited to the ones this taxpayer files. */
export function activeTaxTypes(profile: TaxProfile, taxType: TaxFilter): TaxTypeId[] {
  const filed = taxTypesFor(profile);
  return taxType === "all" ? filed : filed.filter((type) => type === taxType);
}

export function monthlySeries(
  records: LedgerRecord[],
  profile: TaxProfile,
  filters: TrackerFilters,
): MonthPoint[] {
  const { year, fromMonth, toMonth, taxType } = filters;
  const types = activeTaxTypes(profile, taxType);
  const points: MonthPoint[] = [];
  for (let month = fromMonth; month <= toMonth; month++) {
    let earned = 0;
    let spent = 0;
    for (const record of records) {
      if (!inMonth(record, year, month) || !matches(record, profile, taxType)) continue;
      if (record.kind === "sale") earned += record.amount;
      else if (record.kind === "expense") spent += record.amount;
    }
    const start = isoDate(year, month, 1);
    const end = endOfMonth(year, month);
    const tax = types.reduce(
      (sum, type) => sum + taxForPeriod(records, profile, type, start, end),
      0,
    );
    points.push({
      month,
      label: monthShortName(month),
      earned: round2(earned),
      spent: round2(spent),
      tax: round2(tax),
    });
  }
  return points;
}

export function totalsOf(points: MonthPoint[]): Totals {
  const sum = (key: "earned" | "spent" | "tax") => round2(points.reduce((s, p) => s + p[key], 0));
  const earned = sum("earned");
  const spent = sum("spent");
  const tax = sum("tax");
  return { earned, spent, tax, kept: round2(earned - spent - tax) };
}

/** Where each peso of sales went: expenses, tax, and what was kept. Empty without sales. */
export function pieSlices(totals: Totals): PieSlice[] {
  if (totals.earned <= 0) return [];
  return [
    { key: "spent" as const, label: "Spent", value: totals.spent },
    { key: "tax" as const, label: "Tax", value: totals.tax },
    { key: "kept" as const, label: "Kept", value: Math.max(totals.kept, 0) },
  ].filter((slice) => slice.value > 0);
}

export function tableRows(
  records: LedgerRecord[],
  profile: TaxProfile,
  filters: TrackerFilters,
): TableRow[] {
  const start = isoDate(filters.year, filters.fromMonth, 1);
  const end = endOfMonth(filters.year, filters.toMonth);
  return records
    .filter((r) => r.date >= start && r.date <= end && matches(r, profile, filters.taxType))
    .map((r) => ({ ...r, taxTypes: recordTaxTypes(r, profile) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
