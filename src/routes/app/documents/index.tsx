import { Link, createFileRoute } from "@tanstack/react-router";
import { Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { DocumentTable } from "@/components/app/DocumentTable";
import { UsageMeters } from "@/components/app/UsageMeters";
import { useAppUser } from "@/components/app/app-user";
import { EmptyState, LoadingBlock, PageHeader, SampleDataNotice } from "@/components/app/ui";
import { buttonPrimary } from "@/components/site/styles";
import { useMyWorkspace, usePlan } from "@/lib/data/queries";
import type { DocumentStatus } from "@/lib/data/types";
import { deletePlan } from "@/lib/documents/delete";
import { allTags, hasTag, matchesSearch } from "@/lib/documents/tags";
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

const chip = (on: boolean) =>
  cn(
    "min-h-10 rounded-full border px-4 text-sm font-medium",
    on
      ? "border-tk-brand bg-tk-brand-soft text-tk-brand"
      : "border-tk-line bg-tk-surface text-tk-muted hover:text-tk-ink",
  );

/**
 * Every uploaded document, newest first, with its reading status, under the two usage meters
 * (pages read and storage). The list can be searched (file name, who the document is from, its
 * number, its tags) and narrowed by status and by tag (a dropdown, "Choose tag"); files are
 * tagged from the table.
 */
function DocumentsPage() {
  const { user } = useAppUser();
  const query = useMyWorkspace(user.id);
  const plan = usePlan(user.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const all = query.data?.data.documents;
  const tags = useMemo(() => allTags(all ?? []), [all]);
  // A tag that was taken off every file is no longer a filter.
  const activeTag = tag && tags.includes(tag) ? tag : null;
  const documents = useMemo(() => {
    const matches = FILTERS.find((f) => f.value === filter)?.matches ?? (() => true);
    return (all ?? []).filter(
      (d) => matches(d.status) && (!activeTag || hasTag(d, activeTag)) && matchesSearch(d, search),
    );
  }, [all, filter, activeTag, search]);

  if (query.isPending) return <LoadingBlock />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your documents.</p>;

  const narrowed = filter !== "all" || activeTag !== null || search.trim() !== "";
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
      <UsageMeters userId={user.id} settingsLink />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-tk-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search documents"
            placeholder="Search by file name, supplier, invoice number or tag"
            className="min-h-11 w-full rounded-[12px] border border-tk-line bg-tk-surface pr-3 pl-11 text-base focus-visible:outline-2 focus-visible:outline-tk-brand"
          />
        </div>
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={chip(filter === f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {tags.length > 0 ? (
          // A dropdown, not one chip per tag: an account can have many tags.
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="tag-filter" className="text-sm font-medium text-tk-muted">
              Tags
            </label>
            <select
              id="tag-filter"
              value={activeTag ?? ""}
              onChange={(event) => setTag(event.target.value || null)}
              className={cn(
                "min-h-10 max-w-full min-w-[180px] rounded-[10px] border bg-tk-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-tk-brand",
                activeTag ? "border-tk-brand text-tk-ink" : "border-tk-line text-tk-muted",
              )}
            >
              <option value="">Choose tag</option>
              {tags.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {activeTag ? (
              <button
                type="button"
                onClick={() => setTag(null)}
                className="min-h-10 rounded-[10px] px-2 text-sm font-medium text-tk-brand hover:underline"
              >
                Clear tag
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-tk-muted">
            Tick files in the list to put a tag on them, for example "Exp Q1 2026", and find them
            again in one click.
          </p>
        )}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title={narrowed ? "No documents match." : "No documents here yet."}
          {...(narrowed
            ? {
                action: (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setSearch("");
                      setTag(null);
                    }}
                    className={chip(false)}
                  >
                    Show all documents
                  </button>
                ),
              }
            : {})}
        />
      ) : (
        <>
          {narrowed ? (
            <p role="status" className="text-sm text-tk-muted">
              {documents.length} of {(all ?? []).length} documents
            </p>
          ) : null}
          <DocumentTable
            documents={documents}
            plan={deletePlan(plan.data?.data.premiumUntil)}
            knownTags={tags}
          />
        </>
      )}
    </div>
  );
}
