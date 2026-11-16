/**
 * What the reader sends to the model for one document, shared by both readers: the Trigger.dev
 * job (trigger/read-run.ts) and the Supabase reader (supabase/functions/read-step), so the two
 * split documents and word their requests the same way.
 */

import type { CheckFlag } from "./checks.ts";
import { pageGroups, pagesPerCall } from "./pages.ts";

/** The document fields the plan needs (a row of `documents`). */
export interface PlannedDocument {
  mime_type: string;
  bytes: number;
  /** Pages counted (and paid for) at upload. */
  page_count: number;
}

/**
 * One model call's worth of a document: a photo, or a range of PDF pages (numbered from 1).
 * For a photo, `from` and `to` are 0.
 */
export interface ReadChunk {
  from: number;
  to: number;
  label: string;
  pages: number;
}

export interface ReadPlan {
  chunks: ReadChunk[];
  /** Flags for the whole document, for example pages found beyond the ones paid for. */
  flags: CheckFlag[];
}

export const isPdf = (document: Pick<PlannedDocument, "mime_type">): boolean =>
  document.mime_type === "application/pdf";

/**
 * The calls needed to read a document. `actualPdfPages` is the page count found in the PDF
 * itself (ignored for photos). Only the pages paid for are read.
 */
export function planReading(document: PlannedDocument, actualPdfPages = 0): ReadPlan {
  if (!isPdf(document)) {
    return { chunks: [{ from: 0, to: 0, label: "this photo", pages: 1 }], flags: [] };
  }
  const paid = Math.min(actualPdfPages, document.page_count);
  const flags: CheckFlag[] = actualPdfPages > document.page_count ? ["pages_not_paid"] : [];
  const chunks = pageGroups(paid, pagesPerCall(document.bytes, actualPdfPages)).map(
    ({ from, to }) => ({
      from,
      to,
      label: from === to ? `page ${from} of this PDF` : `pages ${from} to ${to} of this PDF`,
      pages: to - from + 1,
    }),
  );
  return { chunks, flags };
}

/** The instruction sent with each chunk. */
export const extractionRequest = (label: string): string =>
  `Read every document in ${label}. Say for each one whether it is a sale, an expense or a Form 2307.`;

/** The instruction sent with a COR. */
export const REGISTRATION_REQUEST = "Read this COR. Reply with JSON only.";

/** A COR is one or two pages: only these are read. */
export const COR_PAGES = 2;

/** A model reply that should be JSON, with or without a ```json fence around it. */
export function parseJsonReply(reply: string): unknown {
  return JSON.parse(
    reply
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, ""),
  );
}
