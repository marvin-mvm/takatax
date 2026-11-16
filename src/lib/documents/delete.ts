/**
 * Deleting documents: who may delete what, and what each confirmation says (shown by the
 * themed pop-up in `@/components/app/confirm`). The same rules are enforced by the
 * `delete-document` function, whatever the screen shows.
 *
 * The tier is the account's. A professional working on a client's account gets the client's
 * tier: Standard features on a Standard account, Premium features on a Premium one.
 *
 * - Standard: deleting a file also deletes the records read from it, so their amounts leave the
 *   tracker and every tax figure.
 * - Premium: deleting a file keeps its records. They can be deleted afterwards, as a separate
 *   step, once the file is gone.
 */

import { tierOf } from "@shared/uploads/usage.ts";
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
  return tierOf(premiumUntil, now);
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

/**
 * What a delete pop-up says: a question, the file it is about, and what will happen as a few
 * short lines (shown as a list), with the name of the button that goes ahead.
 */
export interface DeleteQuestion {
  title: string;
  /** The file's name. */
  subject: string;
  points: string[];
  confirm: string;
  kind: "delete";
}

/** The question asked before a file is deleted. */
export function deleteFileQuestion(
  plan: DeletePlan,
  viewer: DeleteViewer,
  fileName: string,
): DeleteQuestion {
  const question = { title: "Delete this file?", subject: fileName, confirm: "Delete file" };
  if (plan === "premium") {
    return {
      ...question,
      kind: "delete",
      points: [
        "Only the file is deleted.",
        "Its parsed records stay. The Tracker does not change.",
        "Reading it again counts toward the monthly limit.",
      ],
    };
  }
  const points = [
    "The file and its parsed records are deleted.",
    "Their amounts leave the Tracker and tax figures.",
    viewer === "owner"
      ? "Reading it again uses your run or monthly limit."
      : "Reading it again counts toward a new run.",
  ];
  // Premium is the owner's to buy, so a professional is not asked to upgrade.
  if (viewer === "owner") points.push("Premium keeps the records of deleted files.");
  return { ...question, kind: "delete", points };
}

/** The question asked before kept records are deleted. */
export function deleteRecordsQuestion(fileName: string): DeleteQuestion {
  return {
    title: "Delete these parsed records?",
    subject: fileName,
    kind: "delete",
    points: ["They leave the Tracker and the tax figures.", "This cannot be undone."],
    confirm: "Delete records",
  };
}

/** On the "(?)" beside the "Parsed Records" column's name. */
export const PARSED_RECORDS_HINT =
  "Premium feature: parsed records are kept when you delete a file. Deleting them afterwards is optional.";
/** Beside "Delete record" on Premium, while the file is still there. */
export const DELETE_RECORDS_HINT =
  "Deletes the parsed record and removes it from the Tracker. Delete the file first, in the Delete File column.";
/** On the greyed-out "Delete record" on Standard, for screen readers. */
export const RECORDS_LOCKED_HINT =
  "Premium only: it keeps the parsed records when a file is deleted, and lets you delete them here.";
