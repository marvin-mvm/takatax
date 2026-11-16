/**
 * Counts the pages of a PDF in the browser, before anything is uploaded, so the person sees how
 * many pages they are about to pay for. pdf-lib is loaded only when a PDF is added.
 */

import { MAX_PDF_PAGES } from "@shared/uploads/rules.ts";

/** The file's bytes. Falls back to FileReader where Blob.arrayBuffer is missing (older Safari). */
function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsArrayBuffer(file);
  });
}

export type PdfCount = { ok: true; pages: number } | { ok: false; problem: "pdf" | "pages" };

export async function countPdfPages(file: Blob): Promise<PdfCount> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    // Password-protected PDFs still list their pages; ignoreEncryption lets us count them.
    const pdf = await PDFDocument.load(await readBytes(file), {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const pages = pdf.getPageCount();
    if (pages < 1) return { ok: false, problem: "pdf" };
    if (pages > MAX_PDF_PAGES) return { ok: false, problem: "pages" };
    return { ok: true, pages };
  } catch {
    return { ok: false, problem: "pdf" };
  }
}
