import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { countPdfPages } from "./pdf-pages";

async function pdfWithPages(count: number): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i++) pdf.addPage([300, 400]);
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

describe("countPdfPages", () => {
  it("counts the pages of a PDF", async () => {
    expect(await countPdfPages(await pdfWithPages(1))).toEqual({ ok: true, pages: 1 });
    expect(await countPdfPages(await pdfWithPages(7))).toEqual({ ok: true, pages: 7 });
  });

  it("says when a file is not a readable PDF", async () => {
    const notPdf = new Blob(["hello, this is not a pdf"], { type: "application/pdf" });
    expect(await countPdfPages(notPdf)).toEqual({ ok: false, problem: "pdf" });
  });
});
