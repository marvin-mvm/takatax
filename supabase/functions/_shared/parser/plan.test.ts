import { describe, expect, it } from "vitest";

import { extractionRequest, parseJsonReply, planReading } from "./plan.ts";

describe("planReading", () => {
  it("reads a photo in one call", () => {
    const plan = planReading({ mime_type: "image/jpeg", bytes: 500_000, page_count: 1 });
    expect(plan.chunks).toEqual([{ from: 0, to: 0, label: "this photo", pages: 1 }]);
    expect(plan.flags).toEqual([]);
  });

  it("splits a 12-page PDF into 5, 5 and 2 pages", () => {
    const plan = planReading(
      { mime_type: "application/pdf", bytes: 1_000_000, page_count: 12 },
      12,
    );
    expect(plan.chunks.map((c) => [c.from, c.to, c.pages])).toEqual([
      [1, 5, 5],
      [6, 10, 5],
      [11, 12, 2],
    ]);
    expect(plan.chunks[0]?.label).toBe("pages 1 to 5 of this PDF");
    expect(plan.chunks[2]?.label).toBe("pages 11 to 12 of this PDF");
  });

  it("reads only the pages paid for, and flags the rest", () => {
    const plan = planReading({ mime_type: "application/pdf", bytes: 600_000, page_count: 6 }, 9);
    expect(plan.chunks.reduce((sum, c) => sum + c.pages, 0)).toBe(6);
    expect(plan.flags).toEqual(["pages_not_paid"]);
  });

  it("names a single page on its own", () => {
    const plan = planReading({ mime_type: "application/pdf", bytes: 100_000, page_count: 1 }, 1);
    expect(plan.chunks).toEqual([{ from: 1, to: 1, label: "page 1 of this PDF", pages: 1 }]);
  });

  it("sends fewer pages per call when pages are heavy scans", () => {
    const plan = planReading(
      { mime_type: "application/pdf", bytes: 40 * 1024 * 1024, page_count: 10 },
      10,
    );
    expect(plan.chunks.every((c) => c.pages <= 2)).toBe(true);
  });
});

describe("extractionRequest", () => {
  it("names the part being read", () => {
    expect(extractionRequest("this photo")).toContain("Read every document in this photo.");
  });
});

describe("parseJsonReply", () => {
  it("reads plain and fenced JSON", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonReply('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonReply('```\n{"a":3}\n```')).toEqual({ a: 3 });
  });
});
