/**
 * Splitting long PDFs for the reader, and putting the readings back together.
 *
 * The model reads every page itself (no OCR), a few pages per call: long PDFs never have to fit
 * in one request, a failed call is retried on its own, and calls run side by side.
 */

import type { CheckFlag } from "./checks.ts";
import type { ReadResult, ReaderStep } from "./pipeline.ts";

/** Pages of a PDF sent in one call, at most. */
export const PDF_PAGES_PER_CALL = 5;
/** Aim for at most this many bytes of PDF per call; heavy scanned pages go fewer per call. */
export const TARGET_BYTES_PER_CALL = 10 * 1024 * 1024;

/** A range of pages, numbered from 1, both ends included. */
export interface PageGroup {
  from: number;
  to: number;
}

/** How many pages to send per call for a PDF of this size: 5, or fewer if pages are heavy. */
export function pagesPerCall(fileBytes: number, pageCount: number): number {
  if (pageCount <= 0) return PDF_PAGES_PER_CALL;
  const bytesPerPage = Math.max(fileBytes, 1) / pageCount;
  return Math.min(
    Math.max(Math.floor(TARGET_BYTES_PER_CALL / bytesPerPage), 1),
    PDF_PAGES_PER_CALL,
  );
}

/** Consecutive groups of `size` pages covering pages 1 to `pageCount`. */
export function pageGroups(pageCount: number, size = PDF_PAGES_PER_CALL): PageGroup[] {
  const step = Math.max(Math.floor(size), 1);
  const groups: PageGroup[] = [];
  for (let from = 1; from <= Math.floor(pageCount); from += step) {
    groups.push({ from, to: Math.min(from + step - 1, Math.floor(pageCount)) });
  }
  return groups;
}

const STEP_ORDER: ReaderStep[] = ["fast", "recheck", "settle"];

/**
 * One result for a whole document from the results of its page groups: every document found,
 * the furthest reader step used, all flags, and "needs_review" if any group needs it.
 *
 * A file in which nothing at all was found also needs review: a person must look at it, so it
 * is never marked as read with nothing to show for it.
 */
export function combineReadings(results: ReadResult[], extraFlags: CheckFlag[] = []): ReadResult {
  const nothingFound: CheckFlag[] = results.some((r) => r.documents.length > 0)
    ? []
    : ["not_a_document"];
  const flags = [...new Set([...results.flatMap((r) => r.flags), ...extraFlags, ...nothingFound])];
  const deepest = results.reduce(
    (longest, r) => (r.path.length > longest.length ? r.path : longest),
    [] as ReaderStep[],
  );
  return {
    documents: results.flatMap((r) => r.documents),
    path: STEP_ORDER.filter((step) => deepest.includes(step)),
    status:
      flags.length > 0 || results.some((r) => r.status === "needs_review")
        ? "needs_review"
        : "accepted",
    flags,
  };
}
