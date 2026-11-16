import { describe, expect, it } from "vitest";

import { MAX_FILE_BYTES, batchMessage, checkFile, quoteRun as quote } from "./rules.ts";

type QuoteOptions = Parameters<typeof quote>[1];
/** Prices with payments live (the full pricing). */
const quoteRun = (pages: number, options: QuoteOptions = {}) =>
  quote(pages, { paymentsLive: true, ...options });
/** Prices at launch, while payments are not live yet. */
const quoteAtLaunch = (pages: number, options: QuoteOptions = {}) =>
  quote(pages, { ...options, paymentsLive: false });

describe("checkFile", () => {
  it("accepts photos and PDFs up to 200 MB", () => {
    expect(checkFile({ name: "receipt.jpg", type: "image/jpeg", size: 2_000_000 })).toBeNull();
    expect(checkFile({ name: "2307.pdf", type: "application/pdf", size: 150_000_000 })).toBeNull();
    expect(checkFile({ name: "IMG_0001.HEIC", type: "", size: 3_000_000 })).toBeNull();
  });

  it("names the problem with anything else", () => {
    expect(checkFile({ name: "notes.docx", type: "application/msword", size: 10 })).toBe("type");
    expect(checkFile({ name: "big.pdf", type: "application/pdf", size: MAX_FILE_BYTES + 1 })).toBe(
      "size",
    );
    expect(checkFile({ name: "zero.png", type: "image/png", size: 0 })).toBe("empty");
  });
});

describe("quoteRun (pages)", () => {
  it("charges ₱199 up to 250 pages, then ₱2 a page", () => {
    expect(quoteRun(250)).toMatchObject({ plan: "standard", total: 199, extra: 0, limit: 250 });
    expect(quoteRun(300)).toMatchObject({
      total: 299,
      extra: 50,
      extraPrice: 100,
      summary: "₱199 + 50 × ₱2",
    });
  });

  it("gives partners 25% off the run, not the extra pages", () => {
    expect(quoteRun(100, { partner: true })).toMatchObject({ plan: "partner", total: 149 });
    expect(quoteRun(260, { partner: true }).total).toBe(149 + 20);
  });

  it("covers the first 10 pages once with the free trial", () => {
    expect(quoteRun(8, { trialAvailable: true })).toMatchObject({ plan: "trial", total: 0 });
    expect(quoteRun(11, { trialAvailable: true })).toMatchObject({ plan: "standard", total: 199 });
  });

  it("includes Premium's pages left, then ₱2 a page", () => {
    expect(quoteRun(600, { premiumRemaining: 1_000 })).toMatchObject({
      plan: "premium",
      total: 0,
      summary: "Included in Premium",
    });
    expect(quoteRun(1_100, { premiumRemaining: 1_000 })).toMatchObject({
      extra: 100,
      total: 200,
      included: 1_000,
    });
    expect(quoteRun(50, { premiumRemaining: 20 })).toMatchObject({ extra: 30, total: 60 });
  });
});

describe("batchMessage", () => {
  it("counts photos and PDF pages together", () => {
    const counts = { images: 10, allJpeg: true, pdfs: 2, pdfPages: 40 };
    expect(batchMessage(counts, quoteRun(50))).toEqual([
      "You uploaded 10 JPG and 2 PDF files with 50 total combined pages.",
    ]);
  });

  it("adds no warning at exactly the limit", () => {
    const counts = { images: 100, allJpeg: true, pdfs: 3, pdfPages: 150 };
    expect(batchMessage(counts, quoteRun(250))).toEqual([
      "You uploaded 100 JPG and 3 PDF files with 250 total combined pages.",
    ]);
  });

  it("explains the ₱2 a page over a Standard run's limit", () => {
    const counts = { images: 100, allJpeg: true, pdfs: 5, pdfPages: 200 };
    expect(batchMessage(counts, quoteRun(300))).toEqual([
      "You uploaded 100 JPG and 5 PDF files with 300 total combined pages.",
      "It exceeded the 250 limit for a Standard run, so ₱2 will be applied for each of the 50 extra pages (₱100).",
    ]);
  });

  it("uses Premium's pages left as the limit", () => {
    const counts = { images: 0, allJpeg: true, pdfs: 1, pdfPages: 1_200 };
    expect(batchMessage(counts, quoteRun(1_200, { premiumRemaining: 1_000 }))[1]).toBe(
      "It exceeded the 1,000 pages left in your Premium month, so ₱2 will be applied for each of the 200 extra pages (₱400).",
    );
  });

  it("says images when the photos are not all JPEG, and handles one of each", () => {
    expect(batchMessage({ images: 1, allJpeg: false, pdfs: 1, pdfPages: 1 }, quoteRun(2))[0]).toBe(
      "You uploaded 1 image and 1 PDF file with 2 total combined pages.",
    );
    expect(
      batchMessage(
        { images: 3, allJpeg: true, pdfs: 0, pdfPages: 0 },
        quoteRun(3, { trialAvailable: true }),
      ),
    ).toEqual(["You uploaded 3 JPG with 3 total combined pages.", "Your free trial covers them."]);
  });
});

describe("launch pricing (payments not live yet)", () => {
  it("makes a Standard run of up to 250 pages free, for taxpayers and partners", () => {
    expect(quoteAtLaunch(250)).toMatchObject({ plan: "free", total: 0, blocked: false });
    expect(quoteAtLaunch(40, { partner: true })).toMatchObject({ total: 0, blocked: false });
  });

  it("blocks pages over 250 as coming soon, whatever else is set", () => {
    expect(quoteAtLaunch(300)).toMatchObject({ extra: 50, total: 0, blocked: true });
    expect(quoteAtLaunch(1_200, { premiumRemaining: 1_000 }).blocked).toBe(true);
  });

  it("asks people to remove the extra pages for now", () => {
    const counts = { images: 100, allJpeg: true, pdfs: 5, pdfPages: 200 };
    expect(batchMessage(counts, quoteAtLaunch(300))).toEqual([
      "You uploaded 100 JPG and 5 PDF files with 300 total combined pages.",
      "It exceeded the 250 limit for a Standard run. Extra pages (₱2 each) are coming soon, so for now please remove 50 pages to keep this run to 250.",
    ]);
    expect(
      batchMessage({ ...counts, images: 10, pdfs: 2, pdfPages: 40 }, quoteAtLaunch(50)),
    ).toEqual(["You uploaded 10 JPG and 2 PDF files with 50 total combined pages."]);
  });
});
