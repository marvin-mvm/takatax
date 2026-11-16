/**
 * Calendar helpers on ISO dates ("YYYY-MM-DD"). Everything is computed in UTC so a date never
 * shifts by a day because of the user's time zone.
 */

export type IsoDate = string;

export function isoDate(year: number, month: number, day: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function parseIso(date: IsoDate): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return { year, month, day };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIso(date);
  return isoDate(year, month, day + days);
}

/** The last day of a month, for example (2026, 2) -> "2026-02-28". */
export function endOfMonth(year: number, month: number): IsoDate {
  return isoDate(year, month + 1, 0);
}

export function quarterOf(month: number): 1 | 2 | 3 | 4 {
  return (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

export function quarterBounds(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): { start: IsoDate; end: IsoDate } {
  return { start: isoDate(year, quarter * 3 - 2, 1), end: endOfMonth(year, quarter * 3) };
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIso(from);
  const b = parseIso(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function monthShortName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

/** "2026-05-15" -> "May 15, 2026" */
export function formatIsoDate(date: IsoDate): string {
  const { year, month, day } = parseIso(date);
  return `${monthShortName(month)} ${day}, ${year}`;
}
