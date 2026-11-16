import { describe, expect, it } from "vitest";

import { clockTime, manilaDay, shortWhen } from "./time";

describe("time in Manila", () => {
  it("puts a late-evening UTC time on the next Manila day", () => {
    // 17:30 UTC is 1:30 AM the next day in Manila (UTC+8).
    expect(manilaDay("2026-11-14T17:30:00Z")).toBe("2026-11-15");
    expect(manilaDay("2026-11-14T15:59:00Z")).toBe("2026-11-14");
  });

  it("shows a time for today and a date for earlier days", () => {
    const now = new Date("2026-11-15T04:00:00Z"); // noon in Manila
    expect(shortWhen("2026-11-15T01:42:00Z", now)).toBe(clockTime("2026-11-15T01:42:00Z"));
    expect(shortWhen("2026-11-12T01:42:00Z", now)).toMatch(/Nov\s*12/);
  });
});
