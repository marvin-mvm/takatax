/**
 * Deleting an uploaded document, through the `delete-document` edge function (the file is in
 * private storage, so only the server can remove it).
 */

import { callFunction, type FunctionResult } from "./functions";

export interface DeleteResult {
  /** "deleted": the document and its records are gone. "file_deleted": the records were kept. */
  result: "deleted" | "file_deleted";
  recordsKept: boolean;
}

/**
 * `what` is "file" for the Delete File column and "records" for the records Premium kept after
 * their file was deleted.
 */
export function deleteDocument(
  accountId: string,
  documentId: string,
  what: "file" | "records",
): Promise<FunctionResult<DeleteResult>> {
  return callFunction("delete-document", { accountId, documentId, what });
}
