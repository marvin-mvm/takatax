/**
 * Deleting documents: who may delete what, and what each confirmation says. The same rules are
 * enforced by the `delete-document` function, whatever the screen shows.
 *
 * The tier is the account's. A professional working on a client's account gets the client's
 * tier: Standard features on a Standard account, Premium features on a Premium one.
 *
 * - Standard: deleting a file also deletes the records read from it, so their amounts leave the
 *   tracker and every tax figure.
 * - Premium: deleting a file keeps its records. They can be deleted afterwards, as a separate
 *   step, once the file is gone.
 */

import type { StoredDocument } from "@/lib/data/types";

export type DeletePlan = "standard" | "premium";
/** The account's owner, or a professional looking at a client's documents. */
export type DeleteViewer = "owner" | "partner";

type Deletable = Pick<StoredDocument, "status" | "fileDeleted">;

/** The owner's tier, from when their Premium month ends: Premium only while it is running. */
export function deletePlan(
  premiumUntil: string | null | undefined,
  now: number = Date.now(),
): DeletePlan {
  if (!premiumUntil) return "standard";
  return Date.parse(premiumUntil) > now ? "premium" : "standard";
}

/** A file can be deleted once, and not while it is being read. */
export function canDeleteFile(doc: Deletable): boolean {
  return !doc.fileDeleted && doc.status !== "reading";
}

/**
 * Kept records can be deleted only after the file is gone. For a professional this is a Premium
 * feature of the client's account; the owner can always clear records they kept.
 */
export function canDeleteRecords(doc: Deletable, viewer: DeleteViewer, plan: DeletePlan): boolean {
  return doc.fileDeleted && (viewer === "owner" || plan === "premium");
}

/** The question asked before a file is deleted. */
export function deleteFileQuestion(
  plan: DeletePlan,
  viewer: DeleteViewer,
  fileName: string,
): string {
  const again =
    viewer === "owner"
      ? "If you upload and read this document again, it counts toward"
      : "If this document is uploaded and read again, it counts toward";
  if (plan === "premium") {
    return [
      `Delete the file "${fileName}"?`,
      "Only the file is removed. Its parsed records stay, so the Tracker does not change.",
      `${again} the monthly limit.`,
    ].join("\n\n");
  }
  const lines = [
    `Delete "${fileName}"?`,
    "This removes the file and the records parsed from it. Their amounts leave the Tracker and the tax figures too.",
    `${again} ${viewer === "owner" ? "your run or monthly limit" : "a new run"}.`,
  ];
  if (viewer === "owner") lines.push("Upgrade to Premium to keep the records of deleted files.");
  return lines.join("\n\n");
}

/** The question asked before kept records are deleted. */
export function deleteRecordsQuestion(fileName: string): string {
  return [
    `Delete the parsed records of "${fileName}"?`,
    "They are removed from the Tracker and the tax figures. This cannot be undone.",
  ].join("\n\n");
}

/** Beside "Delete record" on Premium, while the file is still there. */
export const DELETE_RECORDS_HINT =
  "Deletes the parsed record and removes it from the Tracker. Delete the file first, in the Delete File column.";
/** On the greyed-out "Delete record" on Standard. */
export const RECORDS_LOCKED_HINT =
  "Premium only: it keeps the parsed records when a file is deleted, and lets you delete them here.";
