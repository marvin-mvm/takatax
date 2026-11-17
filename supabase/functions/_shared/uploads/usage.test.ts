import { describe, expect, it } from "vitest";

import { PRICING } from "./rules.ts";
import {
  GB,
  MB,
  meter,
  pageLimit,
  premiumWindowStart,
  sizeText,
  storageLimit,
  storageRoom,
  tierOf,
} from "./usage.ts";

const NOW = Date.parse("2026-11-17T00:00:00Z");
const DAY = 86_400_000;

describe("tierOf", () => {
  it("is Premium only while the Premium month is running", () => {
    expect(tierOf("2026-12-01T00:00:00Z", NOW)).toBe("premium");
    expect(tierOf("2026-11-01T00:00:00Z", NOW)).toBe("standard");
    expect(tierOf(null, NOW)).toBe("standard");
    expect(tierOf(undefined, NOW)).toBe("standard");
  });
});

describe("premiumWindowStart", () => {
  it("starts on the day Premium began, in its first 30 days", () => {
    expect(premiumWindowStart("2026-11-10T00:00:00Z", "2026-12-10T00:00:00Z", NOW)).toBe(
      Date.parse("2026-11-10T00:00:00Z"),
    );
  });

  it("is the last 30 days once Premium has run for longer", () => {
    expect(premiumWindowStart("2026-09-01T00:00:00Z", "2026-12-30T00:00:00Z", NOW)).toBe(
      NOW - 30 * DAY,
    );
  });

  it("falls back to the end date when the start was never saved", () => {
    expect(premiumWindowStart(null, "2026-11-20T00:00:00Z", NOW)).toBe(
      Date.parse("2026-11-20T00:00:00Z"),
    );
  });
});

describe("the limits of each tier", () => {
  it("takes the pages from the price list", () => {
    expect(pageLimit("standard")).toBe(PRICING.runPages);
    expect(pageLimit("premium")).toBe(PRICING.premiumPages);
  });

  it("takes the storage from the price list, in bytes", () => {
    expect(storageLimit("standard")).toBe(PRICING.freeStorageMb * MB);
    expect(storageLimit("premium")).toBe(PRICING.premiumStorageGb * GB);
    expect(sizeText(storageLimit("standard"))).toBe("300 MB");
    expect(sizeText(storageLimit("premium"))).toBe("15 GB");
  });
});

describe("storageRoom", () => {
  it("lets an upload in while it fits in the tier's storage", () => {
    expect(storageRoom("standard", 240 * MB, 60 * MB)).toEqual({
      ok: true,
      limit: 300 * MB,
      free: 60 * MB,
    });
    expect(storageRoom("standard", 0, 300 * MB).ok).toBe(true);
  });

  it("refuses what does not fit, by a single byte too", () => {
    expect(storageRoom("standard", 240 * MB, 60 * MB + 1).ok).toBe(false);
    expect(storageRoom("standard", 320 * MB, 1)).toMatchObject({ ok: false, free: 0 });
  });

  it("gives a Premium account its 15 GB", () => {
    expect(storageRoom("premium", 320 * MB, 5 * GB).ok).toBe(true);
    expect(storageRoom("premium", 14 * GB, 2 * GB).ok).toBe(false);
  });
});

describe("meter", () => {
  it("says what is used and what is left", () => {
    expect(meter(75, 80)).toEqual({
      used: 75,
      limit: 80,
      left: 5,
      over: 0,
      percent: 94,
      level: "near",
    });
  });

  it("is calm below 80% of the limit and full at the limit", () => {
    expect(meter(0, 80).level).toBe("ok");
    expect(meter(63, 80).level).toBe("ok");
    expect(meter(64, 80).level).toBe("near");
    expect(meter(80, 80).level).toBe("full");
  });

  it("counts what went over, with the bar full", () => {
    expect(meter(312, 300)).toMatchObject({ left: 0, over: 12, percent: 100, level: "full" });
  });

  it("never goes below zero", () => {
    expect(meter(-5, 80)).toMatchObject({ used: 0, left: 80, percent: 0, level: "ok" });
    expect(meter(Number.NaN, 80).used).toBe(0);
  });

  it("has nothing to give without a limit", () => {
    expect(meter(0, 0)).toMatchObject({ percent: 0, level: "ok" });
    expect(meter(3, 0)).toMatchObject({ over: 3, percent: 100, level: "full" });
  });
});

describe("sizeText", () => {
  it("prints a size in the unit that fits", () => {
    expect(sizeText(0)).toBe("0 MB");
    expect(sizeText(400)).toBe("1 KB");
    expect(sizeText(85_000)).toBe("85 KB");
    expect(sizeText(8_240_000)).toBe("8.2 MB");
    expect(sizeText(240_000_000)).toBe("240 MB");
    expect(sizeText(1_500_000_000)).toBe("1.5 GB");
    expect(sizeText(15 * GB)).toBe("15 GB");
  });

  it("moves up a unit instead of printing 1,000 MB", () => {
    expect(sizeText(999_960_000)).toBe("1 GB");
    expect(sizeText(999_940_000)).toBe("999.9 MB");
  });
});
