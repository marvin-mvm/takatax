import { describe, expect, it } from "vitest";

import {
  MAX_FILE_BYTES,
  PARTNER_RUN_PRICE,
  PRICING,
  batchMessage,
  checkFile,
  pesoText,
  quoteRun as quote,
} from "./rules.ts";

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

describe("the price list", () => {
  it("is ₱149 for 80 pages, then ₱3.50 a page; Premium is ₱649 for 300, then ₱2.65", () => {
    expect(PRICING).toMatchObject({
      runPrice: 149,
      runPages: 80,
      extraPage: 3.5,
      premiumMonthly: 649,
      premiumPages: 300,
      premiumExtraPage: 2.65,
    });
  });

  it("writes pesos with centavos only when there are any", () => {
    expect(pesoText(149)).toBe("₱149");
    expect(pesoText(3.5)).toBe("₱3.50");
    expect(pesoText(2.65)).toBe("₱2.65");
    expect(pesoText(1234.5)).toBe("₱1,234.50");
    expect(pesoText(2.65 * 7)).toBe("₱18.55");
  });
});

describe("quoteRun (pages)", () => {
  it("charges ₱149 up to 80 pages, then ₱3.50 a page", () => {
    expect(quoteRun(80)).toMatchObject({ plan: "standard", total: 149, extra: 0, limit: 80 });
    expect(quoteRun(100)).toMatchObject({
      total: 219,
      extra: 20,
      extraRate: 3.5,
      extraPrice: 70,
      summary: "₱149 + 20 × ₱3.50",
    });
    expect(quoteRun(81)).toMatchObject({ total: 152.5, extraPrice: 3.5 });
  });

  it("gives partners 25% off the run, not the extra pages", () => {
    expect(PARTNER_RUN_PRICE).toBe(112);
    expect(quoteRun(60, { partner: true })).toMatchObject({ plan: "partner", total: 112 });
    expect(quoteRun(90, { partner: true }).total).toBe(112 + 35);
  });

  it("covers the first 10 pages once with the free trial", () => {
    expect(quoteRun(8, { trialAvailable: true })).toMatchObject({ plan: "trial", total: 0 });
    expect(quoteRun(11, { trialAvailable: true })).toMatchObject({ plan: "standard", total: 149 });
  });

  it("includes Premium's pages left, then ₱2.65 a page", () => {
    expect(quoteRun(200, { premiumRemaining: 300 })).toMatchObject({
      plan: "premium",
      total: 0,
      summary: "Included in Premium",
    });
    expect(quoteRun(400, { premiumRemaining: 300 })).toMatchObject({
      extra: 100,
      extraRate: 2.65,
      total: 265,
      included: 300,
      summary: "Premium + 100 × ₱2.65",
    });
    // Seven pages at ₱2.65 is ₱18.55 to the centavo, not 18.549999…
    expect(quoteRun(27, { premiumRemaining: 20 })).toMatchObject({ extra: 7, total: 18.55 });
  });

  it("always gives a total that is a whole number of centavos", () => {
    for (const pages of [81, 83, 97, 123, 250, 1_000]) {
      for (const options of [{}, { partner: true }, { premiumRemaining: 5 }]) {
        const centavos = quoteRun(pages, options).total * 100;
        expect(Math.abs(centavos - Math.round(centavos))).toBeLessThan(1e-6);
      }
    }
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
    const counts = { images: 30, allJpeg: true, pdfs: 3, pdfPages: 50 };
    expect(batchMessage(counts, quoteRun(80))).toEqual([
      "You uploaded 30 JPG and 3 PDF files with 80 total combined pages.",
    ]);
  });

  it("explains the ₱3.50 a page over a Standard run's limit", () => {
    const counts = { images: 40, allJpeg: true, pdfs: 5, pdfPages: 60 };
    expect(batchMessage(counts, quoteRun(100))).toEqual([
      "You uploaded 40 JPG and 5 PDF files with 100 total combined pages.",
      "It exceeded the 80 limit for a Standard run, so ₱3.50 will be applied for each of the 20 extra pages (₱70).",
    ]);
  });

  it("uses Premium's pages left as the limit, at Premium's price per page", () => {
    const counts = { images: 0, allJpeg: true, pdfs: 1, pdfPages: 350 };
    expect(batchMessage(counts, quoteRun(350, { premiumRemaining: 300 }))[1]).toBe(
      "It exceeded the 300 pages left in your Premium month, so ₱2.65 will be applied for each of the 50 extra pages (₱132.50).",
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
  it("makes a Standard run of up to 80 pages free, for taxpayers and partners", () => {
    expect(quoteAtLaunch(80)).toMatchObject({ plan: "free", total: 0, blocked: false });
    expect(quoteAtLaunch(40, { partner: true })).toMatchObject({ total: 0, blocked: false });
  });

  it("blocks pages over 80 as coming soon, whatever else is set", () => {
    expect(quoteAtLaunch(100)).toMatchObject({ extra: 20, total: 0, blocked: true });
    expect(quoteAtLaunch(400, { premiumRemaining: 300 }).blocked).toBe(true);
  });

  it("asks people to remove the extra pages for now", () => {
    const counts = { images: 40, allJpeg: true, pdfs: 5, pdfPages: 60 };
    expect(batchMessage(counts, quoteAtLaunch(100))).toEqual([
      "You uploaded 40 JPG and 5 PDF files with 100 total combined pages.",
      "It exceeded the 80 limit for a Standard run. Extra pages (₱3.50 each) are coming soon, so for now please remove 20 pages to keep this run to 80.",
    ]);
    expect(
      batchMessage({ ...counts, images: 10, pdfs: 2, pdfPages: 40 }, quoteAtLaunch(50)),
    ).toEqual(["You uploaded 10 JPG and 2 PDF files with 50 total combined pages."]);
  });
});
