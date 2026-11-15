// POST { accountId, files: [{ clientId, fileName, mimeType, bytes, kind }] }
// -> { slots: [{ clientId, documentId, uploadUrl }] }
//
// Creates one `documents` row per file and a signed R2 upload link for each. The browser then
// PUTs the file to R2 directly. Answers 503 { code: "not_configured" } until R2 is set up.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, serve } from "../_lib/http.ts";
import { assertStorageConfigured, signedUploadUrl } from "../_lib/r2.ts";
import { checkFile, MAX_FILES_PER_UPLOAD } from "../_shared/uploads/rules.ts";

interface RequestFile {
  clientId: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  kind: string;
}

const KINDS = new Set(["sales_invoice", "expense_receipt", "form_2307", "cor", "unknown"]);

serve(async (request) => {
  const { accountId, files } = (await request.json()) as {
    accountId: string;
    files: RequestFile[];
  };
  if (!accountId || !Array.isArray(files) || files.length === 0) {
    throw new HttpError(400, "bad_request", "Send an account and at least one file");
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    throw new HttpError(
      400,
      "too_many_files",
      `Upload at most ${MAX_FILES_PER_UPLOAD} files at a time`,
    );
  }
  for (const file of files) {
    const problem = checkFile({ name: file.fileName, type: file.mimeType, size: file.bytes });
    if (problem) throw new HttpError(400, `file_${problem}`, `${file.fileName}: ${problem}`);
  }

  const { userId } = await authorize(request, accountId);
  assertStorageConfigured();

  const admin = adminClient();
  const year = new Date().getUTCFullYear();
  const slots = [];
  for (const file of files) {
    const safeName = file.fileName.replace(/[^\w.-]+/g, "_").slice(-80);
    const storageKey = `${accountId}/${year}/${crypto.randomUUID()}-${safeName}`;
    const { data, error } = await admin
      .from("documents")
      .insert({
        account_id: accountId,
        kind: KINDS.has(file.kind) ? file.kind : "unknown",
        file_name: file.fileName,
        mime_type: file.mimeType,
        bytes: file.bytes,
        storage_key: storageKey,
        status: "waiting_for_storage",
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    slots.push({
      clientId: file.clientId,
      documentId: data.id,
      uploadUrl: await signedUploadUrl(storageKey),
    });
  }
  // After the PUTs, the browser calls `confirm-upload`, which checks each file is in R2 and moves
  // its document from waiting_for_storage to waiting_for_reader.
  return json({ slots });
});
