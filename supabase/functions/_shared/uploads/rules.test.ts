import { describe, expect, it } from "vitest";

import { checkFile, quoteRun } from "./rules.ts";

describe("checkFile", () => {
  it("accepts photos and PDFs up to 10 MB", () => {
    expect(checkFile({ name: "receipt.jpg", type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(checkFile({ name: "2307.pdf", type: "application/pdf", size: 400_000 })).toBeNull();
    expect(checkFile({ name: "IMG_0001.HEIC", type: "", size: 3_000_000 })).toBeNull();
  });

  it("explains why a file is refused", () => {
    expect(checkFile({ name: "notes.docx", type: "application/msword", size: 10 })).toBe("type");
    expect(checkFile({ name: "big.jpg", type: "image/jpeg", size: 11 * 1024 * 1024 })).toBe("size");
    expect(checkFile({ name: "zero.png", type: "image/png", size: 0 })).toBe("empty");
  });
});

describe("quoteRun", () => {
  it("charges ₱199 up to 250 documents and ₱2 for each extra", () => {
    expect(quoteRun(212)).toMatchObject({ total: 199, extra: 0 });
    expect(quoteRun(262)).toMatchObject({ total: 223, extra: 12, summary: "₱199 + 12 × ₱2" });
  });

  it("gives partners 25% off the run", () => {
    expect(quoteRun(100, { partner: true }).total).toBe(149);
  });

  it("covers the free trial and Premium months", () => {
    expect(quoteRun(8, { trialAvailable: true })).toMatchObject({
      total: 0,
      summary: "Free trial",
    });
    expect(quoteRun(11, { trialAvailable: true }).total).toBe(199);
    expect(quoteRun(600, { premiumRemaining: 1_000 }).total).toBe(0);
  });
});
