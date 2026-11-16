/** Dates and times as people in the Philippines read them. */

const TIME_ZONE = "Asia/Manila";

const timeOnly = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const dayAndMonth = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
});
const fullDay = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const dayMonthYear = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** "2026-11-15" in Manila, for grouping messages by day. */
export const manilaDay = (iso: string) => dayKey.format(new Date(iso));

/** "9:42 AM" */
export const clockTime = (iso: string) => timeOnly.format(new Date(iso));

/** "Sunday, November 15, 2026" */
export const longDay = (iso: string) => fullDay.format(new Date(iso));

/** "Nov 15, 2026" */
export const shortDay = (iso: string) => dayMonthYear.format(new Date(iso));

/** For lists: "9:42 AM" today, "Nov 12" before. */
export function shortWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return manilaDay(iso) === dayKey.format(now) ? timeOnly.format(date) : dayAndMonth.format(date);
}
