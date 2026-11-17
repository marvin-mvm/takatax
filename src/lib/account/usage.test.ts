import { describe, expect, it } from "vitest";

import { PRICING } from "@shared/uploads/rules.ts";
import { MB } from "@shared/uploads/usage.ts";
import type { AccountUsage } from "@/lib/data/types";

import { usageView } from "./usage";

const usage = (changes: Partial<AccountUsage> = {}): AccountUsage => ({
  accountId: "11111111-1111-4111-8111-111111111111",
  tier: "standard",
  premiumUntil: null,
  standard: { added: 0, used: 0 },
  trialAvailable: false,
  premiumPagesUsed: 0,
  storageBytes: 0,
  files: 0,
  ...changes,
});

describe("the AI doc parsing meter", () => {
  it("counts every page a Standard account sent for reading, across its uploads", () => {
    const { pages, tierLabel } = usageView(usage({ standard: { added: 80, used: 11 } }), {
      paymentsLive: false,
    });
    expect(tierLabel).toBe("Standard");
    expect(pages.title).toBe("AI doc parsing");
    expect(pages.figure).toBe("11 / 80 pages");
    expect(pages.spoken).toBe("11 of 80 pages");
    expect(pages.meter).toMatchObject({ used: 11, limit: PRICING.runPages, left: 69 });
    expect(pages.note).toBe(
      "69 pages left. A photo is 1 page; a PDF counts every page. More pages (₱3.50 each) are coming soon.",
    );
    expect(pages.tone).toBe("brand");
  });

  it("gives a new account its 80 free pages at launch", () => {
    const { pages } = usageView(usage(), { paymentsLive: false });
    expect(pages.figure).toBe("0 / 80 pages");
    expect(pages.note).toBe(
      "Your first 80 pages are free during launch. A photo is 1 page; a PDF counts every page.",
    );
  });

  it("warns near the limit and turns red when the pages are used", () => {
    const near = usageView(usage({ standard: { added: 80, used: 75 } }), { paymentsLive: false });
    expect(near.pages.figure).toBe("75 / 80 pages");
    expect(near.pages.tone).toBe("warn");

    const full = usageView(usage({ standard: { added: 80, used: 80 } }), { paymentsLive: false });
    expect(full.pages.figure).toBe("80 / 80 pages");
    expect(full.pages.tone).toBe("danger");
    expect(full.pages.note).toBe(
      "You have used your 80 free pages. More pages (₱3.50 each) are coming soon.",
    );
  });

  it("counts against everything the account's runs added once payments are live", () => {
    const { pages } = usageView(usage({ standard: { added: 170, used: 95 } }), {
      paymentsLive: true,
    });
    expect(pages.figure).toBe("95 / 170 pages");
    expect(pages.note).toBe(
      "75 pages left. A photo is 1 page; a PDF counts every page. A new run of 80 pages is ₱149.",
    );
    const out = usageView(usage({ standard: { added: 80, used: 80 } }), { paymentsLive: true });
    expect(out.pages.note).toBe("No pages left. A new run of 80 pages is ₱149.");
    const trial = usageView(usage({ trialAvailable: true }), { paymentsLive: true });
    expect(trial.pages.figure).toBe("0 / 10 pages");
    expect(trial.pages.note).toBe(
      "10 pages to start with. A photo is 1 page; a PDF counts every page.",
    );
  });

  it("counts a Premium account's month out of 300 pages", () => {
    const { pages, tierLabel } = usageView(
      usage({ tier: "premium", premiumUntil: "2026-12-14T04:00:00Z", premiumPagesUsed: 120 }),
    );
    expect(tierLabel).toBe("Premium");
    expect(pages.figure).toBe("120 / 300 pages");
    expect(pages.note).toBe("180 pages left this Premium month. Premium runs until Dec 14, 2026.");
    expect(pages.tone).toBe("brand");
  });

  it("warns a Premium account near its month's pages, and prices what went over", () => {
    const near = usageView(usage({ tier: "premium", premiumPagesUsed: 299 }));
    expect(near.pages.tone).toBe("warn");
    expect(near.pages.note).toBe("1 page left this Premium month.");

    const over = usageView(usage({ tier: "premium", premiumPagesUsed: 312 }));
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
      "1 file stored. Storage is full: new uploads are refused until files are deleted. Premium (coming soon) comes with 15 GB.",
    );
    expect(
      usageView(usage({ storageBytes: 320 * MB, files: 1 }), { paymentsLive: true }).storage.note,
    ).toBe(
      "1 file stored. Storage is full: new uploads are refused until files are deleted. Premium comes with 15 GB.",
    );
  });

  it("gives a Premium account 15 GB", () => {
    const { storage } = usageView(usage({ tier: "premium", storageBytes: 1_500 * MB, files: 400 }));
    expect(storage.figure).toBe("1.5 GB / 15 GB");
    expect(storage.note).toBe("400 files stored. 13.5 GB free.");
  });
});
