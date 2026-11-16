// POST { accountId, documentId } -> { url, mimeType }
//
// A short-lived (10 minute) link to view one uploaded file, for the owner or a partner with
// access. The file stays private in R2; nobody else can open the link's object later.
//
// Answers 503 { code: "not_configured" } until the R2 secrets are set.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { signedDownloadUrl } from "../_lib/r2.ts";

serve(async (request) => {
  const { accountId, documentId } = (await request.json()) as {
    accountId: string;
    documentId: string;
  };
  if (!accountId || !documentId) {
    throw new HttpError(400, "bad_request", "Send an account and a document");
  }
  await authorize(request, accountId);
  const { data: document, error } = await adminClient()
    .from("documents")
    .select("storage_key, mime_type, status")
    .eq("id", documentId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!document?.storage_key || document.status === "waiting_for_storage") {
    throw new HttpError(404, "not_found", "This file is not in storage");
  }
  return json({ url: await signedDownloadUrl(document.storage_key), mimeType: document.mime_type });
});
