/**
 * The three-step reader: a fast model reads every document; doubtful ones are re-read by a
 * second model from another company; if the two disagree, the top model settles it; anything
 * still unsure goes to the user's review screen.
 *
 * The model calls are passed in (`readers`), so this logic is testable without any API.
 */

import { checkDocument, type CheckFlag, sameTaxFields } from "./checks.ts";
import type { ExtractedDocument } from "./schema.ts";

export type ReaderStep = "fast" | "recheck" | "settle";

/** Reads one file and returns the documents found in it. */
export type ReadFile = () => Promise<ExtractedDocument[]>;

export interface Readers {
  fast: ReadFile;
  recheck: ReadFile;
  settle: ReadFile;
}

export interface ReadResult {
  documents: ExtractedDocument[];
  /** The models used, in order, for example ["fast", "recheck"]. */
  path: ReaderStep[];
  /** "accepted" when the reading can be used; "needs_review" when the user must check it. */
  status: "accepted" | "needs_review";
  flags: CheckFlag[];
}

const flagsFor = (docs: ExtractedDocument[], period?: { start: string; end: string }) => [
  ...new Set(docs.flatMap((doc) => checkDocument(doc, period))),
];

/** True when two readings found the same documents with the same tax figures. */
function agree(a: ExtractedDocument[], b: ExtractedDocument[]): boolean {
  return (
    a.length === b.length && a.every((doc, i) => b[i] !== undefined && sameTaxFields(doc, b[i]))
  );
}

export async function readWithEscalation(
  readers: Readers,
  period?: { start: string; end: string },
): Promise<ReadResult> {
  const first = await readers.fast();
  const firstFlags = flagsFor(first, period);
  if (firstFlags.length === 0) {
    return { documents: first, path: ["fast"], status: "accepted", flags: [] };
  }
  // A document outside the period or not a document at all will not improve with a re-read.
  if (firstFlags.every((flag) => flag === "outside_period" || flag === "not_a_document")) {
    return { documents: first, path: ["fast"], status: "needs_review", flags: firstFlags };
  }

  const second = await readers.recheck();
  if (agree(first, second)) {
    const flags = flagsFor(second, period).filter((flag) => flag !== "low_confidence");
    return {
      documents: second,
      path: ["fast", "recheck"],
      status: flags.length === 0 ? "accepted" : "needs_review",
      flags,
    };
  }

  const third = await readers.settle();
  const flags = flagsFor(third, period);
  return {
    documents: third,
    path: ["fast", "recheck", "settle"],
    status: flags.length === 0 ? "accepted" : "needs_review",
    flags,
  };
}
