/** A table of uploaded documents with their reading status, each linking to its detail page. */

import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import type { StoredDocument } from "@/lib/data/types";
import { fileSize } from "@/lib/money";

import { ReadingProgress } from "./ReadingProgress";
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

export function DocumentTable({
  documents,
  clientAccountId,
  limit = 200,
}: {
  documents: StoredDocument[];
  /** Set when a partner views a client's documents, so the detail page opens that account. */
  clientAccountId?: string;
  limit?: number;
}) {
  return (
    <div className="relative overflow-x-auto rounded-[16px] border border-tk-line bg-tk-surface">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm/5">
        <thead>
          <tr className="border-b border-tk-line bg-tk-bg text-[13px] text-tk-muted">
            <th className="px-4 py-2 font-medium">Document</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Uploaded</th>
            <th className="px-3 py-2 font-medium">Size</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {documents.slice(0, limit).map((doc) => (
            <tr key={doc.id} className="border-b border-tk-line last:border-b-0 hover:bg-tk-bg/60">
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
              <td className="px-4 py-2.5">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
