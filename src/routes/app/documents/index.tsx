import { Link, createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { DocumentTable } from "@/components/app/DocumentTable";
import { useAppUser } from "@/components/app/app-user";
import { EmptyState, LoadingBlock, PageHeader, SampleDataNotice } from "@/components/app/ui";
import { buttonPrimary } from "@/components/site/styles";
import { useMyWorkspace, usePlan } from "@/lib/data/queries";
import type { DocumentStatus } from "@/lib/data/types";
import { deletePlan } from "@/lib/documents/delete";
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
  const plan = usePlan(user.id);
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
        subtitle="Everything you uploaded. Open one to see what was read from it and the records it created, or delete it here."
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
        <DocumentTable documents={documents} plan={deletePlan(plan.data?.data.premiumUntil)} />
      )}
    </div>
  );
}
