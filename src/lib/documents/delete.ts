/**
 * Deleting documents: who may delete what, and what each confirmation says. The same rules are
 * enforced by the `delete-document` function, whatever the screen shows.
 *
 * - Standard (and any professional working on a client's account): deleting a file also deletes
 *   the records read from it, so their amounts leave the tracker and every tax figure.
 * - Premium (the account's owner): deleting a file keeps its records. The owner can delete those
 *   records afterwards, as a separate step, once the file is gone.
 */

import type { StoredDocument } from "@/lib/data/types";

export type DeletePlan = "standard" | "premium";
/** The account's owner, or a professional looking at a client's documents. */
export type DeleteViewer = "owner" | "partner";

type Deletable = Pick<StoredDocument, "status" | "fileDeleted">;

/** Premium only counts for the owner, and only while the Premium month is running. */
export function deletePlan(
  premiumUntil: string | null | undefined,
  viewer: DeleteViewer,
  now: number = Date.now(),
): DeletePlan {
  if (viewer !== "owner" || !premiumUntil) return "standard";
  return Date.parse(premiumUntil) > now ? "premium" : "standard";
}

/** A file can be deleted once, and not while it is being read. */
export function canDeleteFile(doc: Deletable): boolean {
  return !doc.fileDeleted && doc.status !== "reading";
}

/** Kept records can be deleted by the owner, and only after the file is gone. */
export function canDeleteRecords(doc: Deletable, viewer: DeleteViewer): boolean {
  return viewer === "owner" && doc.fileDeleted;
}

/** The question asked before a file is deleted. */
export function deleteFileQuestion(
  plan: DeletePlan,
  viewer: DeleteViewer,
  fileName: string,
): string {
  if (plan === "premium") {
    return [
      `Delete the file "${fileName}"?`,
      "Only the file is removed. Its parsed records stay, so your Tracker does not change.",
      "If you upload and read this document again, it counts toward your monthly limit.",
    ].join("\n\n");
  }
  const lines = [
    `Delete "${fileName}"?`,
    "This removes the file and the records parsed from it. Their amounts leave the Tracker and the tax figures too.",
    viewer === "owner"
      ? "If you upload and read this document again, it counts toward your run or monthly limit."
      : "If this document is uploaded and read again, it counts toward a new run.",
  ];
  if (viewer === "owner") lines.push("Upgrade to Premium to keep the records of deleted files.");
  return lines.join("\n\n");
}

/** The question asked before kept records are deleted. */
export function deleteRecordsQuestion(fileName: string): string {
  return [
    `Delete the parsed records of "${fileName}"?`,
    "They are removed from your Tracker and your tax figures. This cannot be undone.",
  ].join("\n\n");
}

/** Beside "Delete record" on Premium, while the file is still there. */
export const DELETE_RECORDS_HINT =
  "Deletes the parsed record and removes it from your Tracker. Delete the file first, in the Delete File column.";
/** On the greyed-out "Delete record" for everyone else. */
export const RECORDS_LOCKED_HINT =
  "Premium only: it keeps the parsed records when a file is deleted, and lets you delete them here.";
