import { Link, createFileRoute } from "@tanstack/react-router";
import { FileText, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import { useAppUser } from "@/components/app/app-user";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  SampleDataNotice,
  StatusPill,
} from "@/components/app/ui";
import { buttonPrimary } from "@/components/site/styles";
import { useMyWorkspace } from "@/lib/data/queries";
import type { DocumentStatus } from "@/lib/data/types";
import { fileSize } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/documents/")({
  component: DocumentsPage,
});

type Filter = "all" | "needs_review" | "waiting" | "accepted";
const FILTERS: { value: Filter; label: string; matches: (status: DocumentStatus) => boolean }[] = [
  { value: "all", label: "All", matches: () => true },
  { value: "needs_review", label: "Please check", matches: (s) => s === "needs_review" },
  {
    value: "waiting",
    label: "Waiting",
    matches: (s) => s.startsWith("waiting") || s === "reading",
  },
  { value: "accepted", label: "Read", matches: (s) => s === "accepted" },
];

/** Every uploaded document, newest first, with its reading status. */
function DocumentsPage() {
  const { user } = useAppUser();
  const query = useMyWorkspace(user.id);
  const [filter, setFilter] = useState<Filter>("all");

  const documents = useMemo(() => {
    const matches = FILTERS.find((f) => f.value === filter)?.matches ?? (() => true);
    return (query.data?.data.documents ?? []).filter((d) => matches(d.status));
  }, [query.data, filter]);

  if (query.isPending) return <LoadingBlock />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your documents.</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        subtitle="Everything you uploaded. Open one to see what was read from it and the records it created."
        action={
          <Link to="/app/upload" className={buttonPrimary}>
            <Upload aria-hidden className="size-5" /> Upload
          </Link>
        }
      />
      <SampleDataNotice source={query.data.source} />
      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "min-h-10 rounded-full border px-4 text-sm font-medium",
              filter === f.value
                ? "border-tk-brand bg-tk-brand-soft text-tk-brand"
                : "border-tk-line bg-tk-surface text-tk-muted hover:text-tk-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {documents.length === 0 ? (
        <EmptyState title="No documents here yet." />
      ) : (
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
              {documents.slice(0, 200).map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-tk-line last:border-b-0 hover:bg-tk-bg/60"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to="/app/documents/$documentId"
                      params={{ documentId: doc.id }}
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
      )}
    </div>
  );
}
