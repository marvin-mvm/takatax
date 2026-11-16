/**
 * A table of uploaded documents with their reading status, each linking to its detail page, and
 * the two delete columns: "Delete File", and "Parsed Records" (the records Premium keeps after a
 * file is deleted). The rules and the wording are in `@/lib/documents/delete`; every delete asks
 * first, in the themed pop-up from `./confirm`.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import type { StoredDocument } from "@/lib/data/types";
import {
  DELETE_RECORDS_HINT,
  type DeletePlan,
  type DeleteViewer,
  PARSED_RECORDS_HINT,
  RECORDS_LOCKED_HINT,
  canDeleteFile,
  canDeleteRecords,
  deleteFileQuestion,
  deleteRecordsQuestion,
} from "@/lib/documents/delete";
import { fileSize } from "@/lib/money";
import { deleteDocument } from "@/lib/services/documents";

import { Hint } from "./Hint";
import { ReadingProgress } from "./ReadingProgress";
import { useConfirm } from "./confirm";
import { StatusPill } from "./ui";

/**
 * "Please check" as a link to where the check is done: the COR is checked on My COR (or on the
 * client's page for a professional); any other document on its own page, at what was read.
 */
export function CheckLink({
  doc,
  clientAccountId,
}: {
  doc: Pick<StoredDocument, "id" | "kind" | "status">;
  clientAccountId?: string | undefined;
}) {
  const pill = (
    <span className="inline-flex items-center gap-1 rounded-full underline-offset-2 hover:underline">
      <StatusPill status={doc.status} />
      <span aria-hidden className="text-tk-warn">
        →
      </span>
    </span>
  );
  const label = doc.kind === "cor" ? "Check your COR" : "Check this document";
  if (doc.kind === "cor") {
    return clientAccountId ? (
      <Link to="/app/clients/$accountId" params={{ accountId: clientAccountId }} aria-label={label}>
        {pill}
      </Link>
    ) : (
      <Link to="/app/cor" aria-label={label}>
        {pill}
      </Link>
    );
  }
  return (
    <Link
      to="/app/documents/$documentId"
      params={{ documentId: doc.id }}
      search={clientAccountId ? { account: clientAccountId } : {}}
      hash="check"
      aria-label={label}
    >
      {pill}
    </Link>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const smallButton =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-tk-line bg-tk-surface px-3 text-sm font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function DocumentTable({
  documents,
  clientAccountId,
  limit = 200,
  plan = "standard",
}: {
  documents: StoredDocument[];
  /** Set when a partner views a client's documents, so the detail page opens that account. */
  clientAccountId?: string;
  limit?: number;
  /**
   * The account's tier. "premium" keeps the records of a deleted file. A professional on a
   * client's page gets the client's tier.
   */
  plan?: DeletePlan;
}) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const viewer: DeleteViewer = clientAccountId ? "partner" : "owner";
  // The account's tier decides, for its owner and for a professional alike.
  const rules: DeletePlan = plan;
  /** The document being deleted, so its buttons lock until the server answers. */
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async (doc: StoredDocument, what: "file" | "records") => {
    if (busy) return;
    const question =
      what === "file"
        ? deleteFileQuestion(rules, viewer, doc.fileName)
        : deleteRecordsQuestion(doc.fileName);
    if (!(await confirm(question))) return;
    setProblem(null);
    if (!UUID.test(doc.id) || !doc.accountId) {
      setProblem("These are sample documents, so there is nothing to delete yet.");
      return;
    }
    setBusy(doc.id);
    const result = await deleteDocument(doc.accountId, doc.id, what);
    if (result.ok) {
      // The documents, the tracker and the tax figures all come from the workspace.
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    } else {
      setProblem(
        result.reason === "not_connected"
          ? "Deleting is not connected yet, so nothing was deleted."
          : result.code === "being_read"
            ? "This document is being read. Delete it when reading is done."
            : result.code === "premium_only"
              ? "Deleting kept records is a Premium feature of this account."
              : `Nothing was deleted. ${result.message}`,
      );
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {dialog}
      {problem ? (
        <p role="alert" className="rounded-[12px] bg-tk-warn-soft px-4 py-3 text-sm text-tk-warn">
          {problem}
        </p>
      ) : null}
      <div className="relative overflow-x-auto rounded-[16px] border border-tk-line bg-tk-surface">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm/5">
          <thead>
            <tr className="border-b border-tk-line bg-tk-bg text-[13px] text-tk-muted">
              <th className="px-4 py-2 font-medium">Document</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Uploaded</th>
              <th className="px-3 py-2 font-medium">Size</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Delete File</th>
              <th className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  Parsed Records
                  <Hint label="About Parsed Records" text={PARSED_RECORDS_HINT} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {documents.slice(0, limit).map((doc) => {
              const working = busy === doc.id;
              const recordsOpen = canDeleteRecords(doc, viewer, rules);
              // Premium, file still there: explain the two steps. Everyone else: Premium only
              // (the "(?)" on the column's name says so on screen).
              const recordsHint =
                rules === "premium" || recordsOpen ? DELETE_RECORDS_HINT : RECORDS_LOCKED_HINT;
              return (
                <tr
                  key={doc.id}
                  className="border-b border-tk-line last:border-b-0 hover:bg-tk-bg/60"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to="/app/documents/$documentId"
                      params={{ documentId: doc.id }}
                      search={clientAccountId ? { account: clientAccountId } : {}}
                      className="inline-flex items-center gap-2 font-medium text-tk-brand hover:underline"
                    >
                      <FileText aria-hidden className="size-4" />
                      {doc.fileName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-tk-muted">{DOCUMENT_KIND_LABEL[doc.kind]}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-tk-muted">
                    {formatIsoDate(doc.uploadedAt.slice(0, 10))}
                  </td>
                  <td className="px-3 py-2.5 text-tk-muted">{fileSize(doc.bytes)}</td>
                  <td className="px-3 py-2.5">
                    {doc.status === "reading" ? (
                      <ReadingProgress
                        compact
                        status={doc.status}
                        pages={doc.pageCount}
                        pagesRead={doc.pagesRead}
                        fileName={doc.fileName}
                      />
                    ) : doc.status === "needs_review" ? (
                      <CheckLink doc={doc} clientAccountId={clientAccountId} />
                    ) : (
                      <StatusPill status={doc.status} />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {doc.fileDeleted ? (
                      <span className="text-tk-muted">File deleted</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void remove(doc, "file")}
                        disabled={busy !== null || !canDeleteFile(doc)}
                        aria-busy={working}
                        aria-label={`Delete the file ${doc.fileName}`}
                        title={
                          doc.status === "reading"
                            ? "This document is being read. Delete it when reading is done."
                            : undefined
                        }
                        className={`${smallButton} text-tk-danger hover:border-tk-danger`}
                      >
                        {working ? (
                          <Loader2 aria-hidden className="size-4 animate-spin" />
                        ) : (
                          <Trash2 aria-hidden className="size-4" />
                        )}
                        {working ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void remove(doc, "records")}
                        disabled={busy !== null || !recordsOpen}
                        aria-busy={working && recordsOpen}
                        aria-label={`Delete the parsed records of ${doc.fileName}`}
                        aria-describedby={`records-hint-${doc.id}`}
                        className={`${smallButton} ${recordsOpen ? "text-tk-danger hover:border-tk-danger" : "text-tk-muted"}`}
                      >
                        Delete record
                      </button>
                      {rules === "premium" && !recordsOpen ? (
                        <Hint
                          icon="info"
                          label={`Why the records of ${doc.fileName} cannot be deleted yet`}
                          text={recordsHint}
                        />
                      ) : null}
                      <span id={`records-hint-${doc.id}`} className="sr-only">
                        {recordsHint}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
