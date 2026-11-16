import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { LoadingBlock, SampleDataNotice } from "@/components/app/ui";
import { PartnerCard, PublicPage } from "@/components/community/parts";
import { SiteShell } from "@/components/site/SiteShell";
import { usePartners } from "@/lib/data/queries";
import { PARTNER_KIND_LABEL, type PartnerKind } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const title = "Find a verified bookkeeper, CPA or tax lawyer | Takatax";
const description =
  "Verified bookkeepers, CPAs and tax lawyers in the Philippines, rated 1 to 5 stars by their own clients.";

export const Route = createFileRoute("/bookkeepers/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: DirectoryPage,
});

type KindFilter = "all" | PartnerKind;

function DirectoryPage() {
  const query = usePartners();
  const [kind, setKind] = useState<KindFilter>("all");
  const [city, setCity] = useState("");

  const partners = useMemo(() => {
    const term = city.trim().toLowerCase();
    return (query.data?.data ?? []).filter(
      (p) => (kind === "all" || p.kind === kind) && (!term || p.city.toLowerCase().includes(term)),
    );
  }, [query.data, kind, city]);

  return (
    <SiteShell>
      <PublicPage
        title="Find help you can trust"
        intro="Bookkeepers, CPAs and tax lawyers whose credentials we checked, rated 1 to 5 stars by their own clients. You agree on fees with them directly: Takatax takes no cut and handles no payments between you."
      >
        <div className="flex flex-col gap-5">
          {query.data ? (
            <SampleDataNotice source={query.data.source} what="example profiles" />
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-2">
              {(["all", "bookkeeper", "cpa", "tax_lawyer"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "min-h-10 rounded-full border px-4 text-sm font-medium",
                    kind === k
                      ? "border-tk-brand bg-tk-brand-soft text-tk-brand"
                      : "border-tk-line bg-tk-surface text-tk-muted hover:text-tk-ink",
                  )}
                >
                  {k === "all" ? "Everyone" : `${PARTNER_KIND_LABEL[k]}s`}
                </button>
              ))}
            </div>
            <label className="ml-auto w-full sm:w-64">
              <span className="sr-only">City</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Filter by city"
                className="min-h-11 w-full rounded-[10px] border border-tk-line bg-tk-surface px-3"
              />
            </label>
          </div>
          {query.isPending ? (
            <LoadingBlock label="Loading profiles…" />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {partners.map((partner) => (
                <li key={partner.id}>
                  <PartnerCard partner={partner} />
                </li>
              ))}
            </ul>
          )}
          <p className="rounded-[18px] border border-tk-line bg-tk-surface p-5 text-tk-muted">
            <strong className="font-semibold text-tk-ink">
              Are you a bookkeeper, CPA or tax lawyer?
            </strong>{" "}
            Join to get 25% off every client run, with no platform fee.{" "}
            <Link to="/signup" className="font-semibold text-tk-brand hover:underline">
              Create a partner account
            </Link>
          </p>
        </div>
      </PublicPage>
    </SiteShell>
  );
}
