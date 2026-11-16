// POST { accountId, documentIds } -> { arrived: [documentId] }
//
// After the browser PUTs files to R2, checks that each one is really in the bucket and moves
// its document from "waiting_for_storage" to "waiting_for_reader". Documents already waiting are
// counted as arrived, so calling this twice is safe.
//
// Answers 503 { code: "not_configured" } until the R2 secrets are set.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { assertStorageConfigured, objectExists } from "../_lib/r2.ts";

serve(async (request) => {
  const { accountId, documentIds } = (await request.json()) as {
    accountId: string;
    documentIds: string[];
  };
  if (!accountId || !Array.isArray(documentIds) || documentIds.length === 0) {
    throw new HttpError(400, "bad_request", "Send an account and the uploaded documents");
  }
  await authorize(request, accountId);
  assertStorageConfigured();

  const admin = adminClient();
  const { data: documents, error } = await admin
    .from("documents")
    .select("id, storage_key, status")
    .eq("account_id", accountId)
    .in("id", documentIds);
  if (error) throw error;

  const arrived: string[] = [];
  for (const document of documents ?? []) {
    if (document.status === "waiting_for_reader") {
      arrived.push(document.id);
      continue;
    }
    if (document.status !== "waiting_for_storage" || !document.storage_key) continue;
    if (await objectExists(document.storage_key)) {
      const { error: updateError } = await admin
        .from("documents")
        .update({ status: "waiting_for_reader", updated_at: new Date().toISOString() })
        .eq("id", document.id);
      if (updateError) throw updateError;
      arrived.push(document.id);
    }
  }
  return json({ arrived });
});
