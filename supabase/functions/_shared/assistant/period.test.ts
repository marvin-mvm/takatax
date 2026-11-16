import { describe, expect, it } from "vitest";

import { assistantPeriod } from "./period.ts";

describe("assistantPeriod", () => {
  it("ends on the month's real last day, never on a day 31 that does not exist", () => {
    expect(assistantPeriod({ year: 2026, fromMonth: 1, toMonth: 11 })).toEqual({
      from: "2026-01-01",
      to: "2026-11-30",
    });
    expect(assistantPeriod({ year: 2026, fromMonth: 2, toMonth: 2 })?.to).toBe("2026-02-28");
    expect(assistantPeriod({ year: 2028, fromMonth: 1, toMonth: 2 })?.to).toBe("2028-02-29");
    expect(assistantPeriod({ year: 2026, fromMonth: 4, toMonth: 6 })?.to).toBe("2026-06-30");
    expect(assistantPeriod({ year: 2026, fromMonth: 1, toMonth: 12 })?.to).toBe("2026-12-31");
  });

  it("gives a real date for every month of the year", () => {
    for (let month = 1; month <= 12; month++) {
      const period = assistantPeriod({ year: 2026, fromMonth: month, toMonth: month });
      expect(period?.from).toBe(`2026-${String(month).padStart(2, "0")}-01`);
      const end = new Date(`${period?.to}T00:00:00Z`);
      expect(end.toISOString().slice(0, 10)).toBe(period?.to);
      expect(end.getUTCMonth() + 1).toBe(month);
    }
  });

  it("is null when the year or the months make no sense", () => {
    expect(assistantPeriod({ year: 2026, fromMonth: 6, toMonth: 3 })).toBeNull();
    expect(assistantPeriod({ year: 2026, fromMonth: 0, toMonth: 3 })).toBeNull();
    expect(assistantPeriod({ year: 2026, fromMonth: 1, toMonth: 13 })).toBeNull();
    expect(assistantPeriod({ year: 2026, fromMonth: 1.5, toMonth: 3 })).toBeNull();
    expect(assistantPeriod({ year: "2026", fromMonth: 1, toMonth: 3 })).toBeNull();
    expect(assistantPeriod({ year: 1899, fromMonth: 1, toMonth: 3 })).toBeNull();
    expect(assistantPeriod({ year: undefined, fromMonth: 1, toMonth: 3 })).toBeNull();
  });
});
