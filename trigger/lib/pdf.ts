/** Splitting a PDF into small PDFs of a few pages each, for the reader. */

import { PDFDocument } from "pdf-lib";

import type { PageGroup } from "../../supabase/functions/_shared/parser/pages.ts";

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

/** A new PDF holding only the pages in `group` (numbered from 1). */
export async function extractPages(source: PDFDocument, group: PageGroup): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const indices = Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from - 1 + i);
  for (const page of await out.copyPages(source, indices)) out.addPage(page);
  return out.save();
}
