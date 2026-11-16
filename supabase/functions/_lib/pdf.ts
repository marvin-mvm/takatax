// Splitting a PDF into small PDFs of a few pages each, for the Supabase reader (read-step).
// Same library and version as the Trigger.dev job (trigger/lib/pdf.ts).
import { PDFDocument } from "npm:pdf-lib@1.17.1";

export type Pdf = PDFDocument;

export function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
}

/** A new PDF holding only pages `from` to `to` (numbered from 1). */
export async function extractPages(
  source: PDFDocument,
  group: { from: number; to: number },
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const indices = Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from - 1 + i);
  for (const page of await out.copyPages(source, indices)) out.addPage(page);
  return out.save();
}
