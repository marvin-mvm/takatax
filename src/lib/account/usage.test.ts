import { describe, expect, it } from "vitest";

import { PRICING } from "@shared/uploads/rules.ts";
import { MB } from "@shared/uploads/usage.ts";
import type { AccountUsage } from "@/lib/data/types";

import { usageView } from "./usage";

const usage = (changes: Partial<AccountUsage> = {}): AccountUsage => ({
  accountId: "11111111-1111-4111-8111-111111111111",
  tier: "standard",
  premiumUntil: null,
  pagesUsed: 0,
  pagesReadInAll: 0,
  storageBytes: 0,
  files: 0,
  ...changes,
});

describe("the AI doc parsing meter", () => {
  it("shows a Standard account its latest run out of a run's pages", () => {
    const { pages, tierLabel } = usageView(usage({ pagesUsed: 75, pagesReadInAll: 212 }), {
      paymentsLive: false,
    });
    expect(tierLabel).toBe("Standard");
    expect(pages.title).toBe("AI doc parsing");
    expect(pages.figure).toBe("75 / 80 pages");
    expect(pages.spoken).toBe("75 of 80 pages");
    expect(pages.meter).toMatchObject({ used: 75, limit: PRICING.runPages, left: 5 });
    expect(pages.note).toBe(
      "Your latest run. Each upload starts a new run of up to 80 pages, free during launch. 212 pages read so far.",
    );
  });

  it("never warns about a full Standard run: the next upload is a new run", () => {
    expect(usageView(usage({ pagesUsed: 80, pagesReadInAll: 80 })).pages.tone).toBe("brand");
  });

  it("says a new account has read nothing yet", () => {
    const { pages } = usageView(usage(), { paymentsLive: false });
    expect(pages.figure).toBe("0 / 80 pages");
    expect(pages.note).toBe(
      "Nothing read yet. Each upload starts a new run of up to 80 pages, free during launch.",
    );
  });

  it("states the price of a run once payments are live", () => {
    const { pages } = usageView(usage({ pagesUsed: 12, pagesReadInAll: 1 }), {
      paymentsLive: true,
    });
    expect(pages.note).toBe(
      "Your latest run. Each upload starts a new run: ₱149 for up to 80 pages, then ₱3.50 a page. 1 page read so far.",
    );
  });

  it("counts a Premium account's month out of 300 pages", () => {
    const { pages, tierLabel } = usageView(
      usage({ tier: "premium", premiumUntil: "2026-12-14T04:00:00Z", pagesUsed: 120 }),
    );
    expect(tierLabel).toBe("Premium");
    expect(pages.figure).toBe("120 / 300 pages");
    expect(pages.note).toBe("180 pages left this Premium month. Premium runs until Dec 14, 2026.");
    expect(pages.tone).toBe("brand");
  });

  it("warns a Premium account near its month's pages, and prices what went over", () => {
    const near = usageView(usage({ tier: "premium", premiumUntil: null, pagesUsed: 299 }));
    expect(near.pages.tone).toBe("warn");
    expect(near.pages.note).toBe("1 page left this Premium month.");

    const over = usageView(usage({ tier: "premium", premiumUntil: null, pagesUsed: 312 }));
    expect(over.pages.figure).toBe("312 / 300 pages");
    expect(over.pages.meter.percent).toBe(100);
    expect(over.pages.note).toBe("12 pages over this month's 300, at ₱2.65 each.");
  });
});

describe("the doc storage meter", () => {
  it("shows what is stored out of the Standard tier's 300 MB", () => {
    const { storage } = usageView(usage({ storageBytes: 240 * MB, files: 61 }));
    expect(storage.title).toBe("Doc storage");
    expect(storage.figure).toBe("240 MB / 300 MB");
    expect(storage.spoken).toBe("240 MB of 300 MB");
    expect(storage.note).toBe("61 files stored. Almost full: 60 MB free.");
    expect(storage.tone).toBe("warn");
  });

  it("is calm with room to spare", () => {
    const { storage } = usageView(usage({ storageBytes: 8_158_030, files: 3 }));
    expect(storage.figure).toBe("8.2 MB / 300 MB");
    expect(storage.note).toBe("3 files stored. 291.8 MB free.");
    expect(storage.tone).toBe("brand");
  });

  it("starts empty", () => {
    const { storage } = usageView(usage());
    expect(storage.figure).toBe("0 MB / 300 MB");
    expect(storage.note).toBe("No files stored yet. 300 MB free.");
    expect(storage.meter.percent).toBe(0);
  });

  it("says when it is full, and what Premium comes with", () => {
    const launch = usageView(usage({ storageBytes: 320 * MB, files: 1 }), {
      paymentsLive: false,
    });
    expect(launch.storage.figure).toBe("320 MB / 300 MB");
    expect(launch.storage.tone).toBe("danger");
    expect(launch.storage.note).toBe(
      "1 file stored. Storage is full. Premium (coming soon) comes with 15 GB.",
    );
    expect(
      usageView(usage({ storageBytes: 320 * MB, files: 1 }), { paymentsLive: true }).storage.note,
    ).toBe("1 file stored. Storage is full. Premium comes with 15 GB.");
  });

  it("gives a Premium account 15 GB", () => {
    const { storage } = usageView(usage({ tier: "premium", storageBytes: 1_500 * MB, files: 400 }));
    expect(storage.figure).toBe("1.5 GB / 15 GB");
    expect(storage.note).toBe("400 files stored. 13.5 GB free.");
  });
});
