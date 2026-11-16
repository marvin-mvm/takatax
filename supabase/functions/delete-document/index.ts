// POST { accountId, documentId, what: "file" | "records" }
//   -> { result: "deleted" | "file_deleted", recordsKept: boolean }
//
// Deletes an uploaded document, for the account's owner or a professional with access.
//
// what = "file" (the "Delete File" column):
//   - Standard, and any professional working on a client's account: the file is removed from
//     storage, and the document and the records read from it are deleted. Their amounts leave
//     the tracker and every tax figure.
//   - Premium, for the owner: only the file is removed. The document's row and its records stay
//     (documents.file_deleted_at is set), so the tracker does not change.
// what = "records" (the "Parsed Records" column): the owner deletes the records that Premium
//   kept. Refused until the file is gone, so two separate steps are always needed.
//
// A document that is being read cannot be deleted. A professional's deletion goes in the
// client's activity log (delete_document() in the database writes it).
//
// The file is removed from R2 first and the database second, so a failure in between leaves a
// row whose delete can simply be tried again. Answers 503 { code: "not_configured" } until the
// R2 secrets are set.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { deleteObject } from "../_lib/r2.ts";

serve(async (request) => {
  const { accountId, documentId, what } = (await request.json()) as {
    accountId?: string;
    documentId?: string;
    what?: string;
  };
  if (!accountId || !documentId || (what !== "file" && what !== "records")) {
    throw new HttpError(400, "bad_request", "Send an account, a document and what to delete");
  }
  const { userId } = await authorize(request, accountId);
  const admin = adminClient();

  const { data: account, error: accountError } = await admin
    .from("accounts")
    .select("id, owner_user_id, premium_until")
    .eq("id", accountId)
    .single();
  if (accountError) throw accountError;
  const owner = account.owner_user_id === userId;

  const { data: document, error: documentError } = await admin
    .from("documents")
    .select("id, storage_key, status, file_deleted_at")
    .eq("id", documentId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) throw new HttpError(404, "not_found", "This document is not in this account");
  if (document.status === "reading") {
    throw new HttpError(
      409,
      "being_read",
      "This document is being read. Try again when it is done.",
    );
  }

  let keepRecords = false;
  if (what === "records") {
    if (!owner) {
      throw new HttpError(403, "forbidden", "Only the account's owner can delete kept records");
    }
    if (!document.file_deleted_at) {
      throw new HttpError(409, "file_first", "Delete the file first, then its records");
    }
  } else {
    if (document.file_deleted_at) {
      throw new HttpError(409, "already_deleted", "This file was already deleted");
    }
    // Premium keeps the records, for the owner only: a professional always deletes like Standard.
    keepRecords =
      owner && Boolean(account.premium_until) && Date.parse(account.premium_until) > Date.now();
    if (document.storage_key) await deleteObject(document.storage_key);
  }

  const { data: result, error } = await admin.rpc("delete_document", {
    document: documentId,
    actor: userId,
    keep_records: keepRecords,
  });
  if (error) throw error;
  if (result === "not_found") {
    throw new HttpError(404, "not_found", "This document is not in this account");
  }
  return json({ result, recordsKept: keepRecords });
});
