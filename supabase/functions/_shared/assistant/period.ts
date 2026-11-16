/**
 * The dates the records assistant reads for the period on screen: the first day of `fromMonth`
 * to the last day of `toMonth`. The last day is the month's real one (30 for November, 28 or 29
 * for February), because the database refuses a date such as "2026-11-31".
 */

import { type IsoDate, endOfMonth, isoDate } from "../domain/dates.ts";

export interface AssistantPeriod {
  from: IsoDate;
  to: IsoDate;
}

const whole = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;

/** The period's first and last day, or null when the year or the months make no sense. */
export function assistantPeriod(scope: {
  year: unknown;
  fromMonth: unknown;
  toMonth: unknown;
}): AssistantPeriod | null {
  const year = whole(scope.year, 2000, 2100);
  const fromMonth = whole(scope.fromMonth, 1, 12);
  const toMonth = whole(scope.toMonth, 1, 12);
  if (year === null || fromMonth === null || toMonth === null || fromMonth > toMonth) return null;
  return { from: isoDate(year, fromMonth, 1), to: endOfMonth(year, toMonth) };
}
