import { describe, expect, it } from "vitest";

import type { ReadResult } from "./pipeline.ts";
import { combineReadings, pageGroups, pagesPerCall } from "./pages.ts";

const result = (overrides: Partial<ReadResult>): ReadResult => ({
  documents: [],
  path: ["fast"],
  status: "accepted",
  flags: [],
  ...overrides,
});

describe("pageGroups", () => {
  it("covers every page in groups of five", () => {
    expect(pageGroups(12)).toEqual([
      { from: 1, to: 5 },
      { from: 6, to: 10 },
      { from: 11, to: 12 },
    ]);
    expect(pageGroups(1)).toEqual([{ from: 1, to: 1 }]);
    expect(pageGroups(0)).toEqual([]);
  });

  it("uses smaller groups when asked", () => {
    expect(pageGroups(3, 1)).toHaveLength(3);
  });
});

describe("pagesPerCall", () => {
  it("sends five light pages per call, and heavy scanned pages one at a time", () => {
    expect(pagesPerCall(500_000, 10)).toBe(5);
    expect(pagesPerCall(200 * 1024 * 1024, 20)).toBe(1);
    expect(pagesPerCall(30 * 1024 * 1024, 10)).toBe(3);
  });
});

describe("combineReadings", () => {
  it("joins the documents of all groups and keeps the furthest step", () => {
    const combined = combineReadings([
      result({ path: ["fast"] }),
      result({ path: ["fast", "recheck"] }),
    ]);
    expect(combined.status).toBe("accepted");
    expect(combined.path).toEqual(["fast", "recheck"]);
  });

  it("needs review if any group does, with every flag once", () => {
    const combined = combineReadings(
      [
        result({ status: "needs_review", flags: ["vat_mismatch"] }),
        result({ status: "needs_review", flags: ["vat_mismatch", "missing_date"] }),
      ],
      ["pages_not_paid"],
    );
    expect(combined.status).toBe("needs_review");
    expect(combined.flags).toEqual(["vat_mismatch", "missing_date", "pages_not_paid"]);
  });
});
