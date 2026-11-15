/** A table of uploaded documents with their reading status, each linking to its detail page. */

import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import type { StoredDocument } from "@/lib/data/types";
import { fileSize } from "@/lib/money";

import { StatusPill } from "./ui";

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
                <StatusPill status={doc.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
