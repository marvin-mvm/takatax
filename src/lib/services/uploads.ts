/**
 * Uploading documents: the browser asks the `create-upload-urls` edge function for one signed
 * link per file, then sends each file straight to Cloudflare R2 with that link. Files never pass
 * through our server, and the browser never sees an R2 key.
 *
 * MISSING: deploy `create-upload-urls` and set its R2 secrets (see docs/MISSING_PIECES.md).
 * Until then `requestUploadSlots` answers `not_connected` and nothing leaves the browser.
 */

import type { DocumentKind } from "@shared/parser/schema.ts";
import type { DocumentStatus } from "@/lib/data/types";

import { callFunction, type FunctionResult } from "./functions";

export interface UploadRequestFile {
  /** The browser's id for the file, echoed back so slots can be matched to files. */
  clientId: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  kind: DocumentKind;
  /** Pages counted in the browser: 1 for a photo, every page of a PDF. */
  pages: number;
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

/**
 * Tells the server the files are in storage: the `confirm-upload` function checks each one in
 * R2 and moves it to "waiting to be read". Returns the documents that arrived.
 */
export function confirmUploads(
  accountId: string,
  documentIds: string[],
): Promise<FunctionResult<{ arrived: string[] }>> {
  return callFunction("confirm-upload", { accountId, documentIds });
}

/** A short-lived link to view one uploaded file (owner or partner with access). */
export function getDocumentLink(
  accountId: string,
  documentId: string,
): Promise<FunctionResult<{ url: string; mimeType: string }>> {
  return callFunction("document-link", { accountId, documentId });
}

/** One document of a run, for its own progress bar. */
export interface RunDocumentProgress {
  id: string;
  fileName: string;
  status: DocumentStatus;
  pages: number;
  pagesRead: number;
}

/** A run's reading progress, for the progress bars while the reader works. */
export interface RunProgress {
  status: "awaiting_payment" | "paid" | "reading" | "review" | "complete";
  pages: number;
  pagesRead: number;
  read: number;
  needsReview: number;
  /** Each document, oldest first (the order the readers read them in). */
  documents: RunDocumentProgress[];
}
