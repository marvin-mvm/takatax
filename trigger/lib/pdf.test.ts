import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { pageGroups } from "../../supabase/functions/_shared/parser/pages.ts";
import { extractPages, loadPdf } from "./pdf";

describe("extractPages", () => {
  it("splits a 12-page PDF into 5, 5 and 2 pages", async () => {
    const original = await PDFDocument.create();
    for (let i = 0; i < 12; i++) original.addPage([300, 400]);
    const source = await loadPdf(await original.save());
    const counts = [];
    for (const group of pageGroups(source.getPageCount())) {
      const part = await PDFDocument.load(await extractPages(source, group));
      counts.push(part.getPageCount());
    }
    expect(counts).toEqual([5, 5, 2]);
  });
});
