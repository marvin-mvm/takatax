import { describe, expect, it } from "vitest";

import { tierSummary } from "./tier";

const taxpayer = {
  role: "taxpayer",
  tier: "standard",
  premiumUntil: null,
  trialUsed: false,
} as const;

describe("tierSummary", () => {
  it("tells a taxpayer at launch that Standard runs are free", () => {
    expect(tierSummary({ ...taxpayer, paymentsLive: false })).toEqual({
      name: "Standard",
      tag: "Free during launch",
      points: [
        "Your first 80 pages are read free, counted across all your uploads.",
        "More pages (₱3.50 each) and Premium are coming soon.",
        "300 MB of document storage.",
      ],
    });
  });

  it("states the run price and the free trial once payments are live", () => {
    expect(tierSummary({ ...taxpayer, paymentsLive: true })).toEqual({
      name: "Standard",
      tag: "Pay per run",
      points: [
        "₱149 a run of 80 pages, then ₱3.50 a page. Pages you do not use stay for your next upload.",
        "Free trial: your first 10 pages are read free.",
        "300 MB of document storage.",
      ],
    });
    expect(tierSummary({ ...taxpayer, trialUsed: true, paymentsLive: true }).points[1]).toBe(
      "Free trial used: your first 10 pages were read free.",
    );
  });

  it("says until when Premium is active and what it includes", () => {
    expect(
      tierSummary({ ...taxpayer, tier: "premium", premiumUntil: "2026-12-14T04:00:00Z" }),
    ).toEqual({
      name: "Premium",
      tag: "Active until Dec 14, 2026",
      points: [
        "300 pages read a month, then ₱2.65 a page.",
        "15 GB of document storage.",
        "Deleting a file keeps its parsed records.",
        "It does not renew by itself.",
      ],
    });
  });

  it("gives a professional the partner price and their clients' tiers", () => {
    const launch = tierSummary({ ...taxpayer, role: "cpa", paymentsLive: false });
    expect(launch.name).toBe("Standard");
    expect(launch.tag).toBe("Free during launch");
    expect(launch.points).toEqual([
      "Each client's first 80 pages are read free during launch.",
      "On a client's account you get that client's tier, Standard or Premium.",
      "Pages and storage are counted on each client's account.",
    ]);

    const live = tierSummary({ ...taxpayer, role: "bookkeeper", paymentsLive: true });
    expect(live.tag).toBe("Partner price");
    expect(live.points[0]).toBe("₱112 a client run of 80 pages (25% off ₱149), then ₱3.50 a page.");
  });
});
