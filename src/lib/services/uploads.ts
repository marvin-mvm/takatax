/**
 * Uploading documents: the browser asks the `create-upload-urls` edge function for one signed
 * link per file, then sends each file straight to Cloudflare R2 with that link. Files never pass
 * through our server, and the browser never sees an R2 key.
 *
 * MISSING: deploy `create-upload-urls` and set its R2 secrets (see docs/MISSING_PIECES.md).
 * Until then `requestUploadSlots` answers `not_connected` and nothing leaves the browser.
 */

import type { DocumentKind } from "@shared/parser/schema.ts";

import { callFunction, type FunctionResult } from "./functions";

export interface UploadRequestFile {
  /** The browser's id for the file, echoed back so slots can be matched to files. */
  clientId: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  kind: DocumentKind;
}

export interface UploadSlot {
  clientId: string;
  documentId: string;
  /** Signed PUT link to R2, valid for a few minutes. */
  uploadUrl: string;
}

export function requestUploadSlots(
  accountId: string,
  files: UploadRequestFile[],
): Promise<FunctionResult<{ slots: UploadSlot[] }>> {
  return callFunction("create-upload-urls", { accountId, files });
}

/** Sends one prepared file to R2. */
export async function putToStorage(
  slot: UploadSlot,
  file: Blob,
  mimeType: string,
): Promise<boolean> {
  const response = await fetch(slot.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: file,
  });
  return response.ok;
}
