import { Link, createFileRoute } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { useMemo, useState } from "react";

import { LoadingBlock, SampleDataNotice } from "@/components/app/ui";
import { CommunityRules, PostCard, PublicPage } from "@/components/community/parts";
import { SiteShell } from "@/components/site/SiteShell";
import { buttonPrimary } from "@/components/site/styles";
import { useAuth } from "@/lib/auth/use-auth";
import { usePosts } from "@/lib/data/queries";
import { cn } from "@/lib/utils";

const title = "Tax questions, answered by verified bookkeepers | Takatax Community";
const description =
  "Ask Philippine tax questions anonymously. Verified bookkeepers, CPAs and tax lawyers answer, with their name and rating.";

export const Route = createFileRoute("/community/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: CommunityPage,
});

function CommunityPage() {
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  const query = usePosts(signedIn);
  const [topic, setTopic] = useState("All");

  const topics = useMemo(
    () => ["All", ...new Set((query.data?.data ?? []).map((p) => p.topic))],
    [query.data],
  );
  const posts = (query.data?.data ?? []).filter((p) => topic === "All" || p.topic === topic);

  return (
    <SiteShell>
      <PublicPage
        title="Ask anonymously. Verified pros answer."
        intro="A free place for Filipino taxpayers to ask about BIR forms, deadlines and deductions. Bookkeepers, CPAs and tax lawyers answer under their own name and rating."
        action={
          <Link to="/community/new" className={buttonPrimary}>
            <PenLine aria-hidden className="size-5" /> Ask a question
          </Link>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            {query.data ? (
              <SampleDataNotice source={query.data.source} what="example questions" />
            ) : null}
            <div role="radiogroup" aria-label="Topic" className="flex flex-wrap gap-2">
              {topics.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={topic === t}
                  onClick={() => setTopic(t)}
                  className={cn(
                    "min-h-10 rounded-full border px-4 text-sm font-medium",
                    topic === t
                      ? "border-tk-brand bg-tk-brand-soft text-tk-brand"
                      : "border-tk-line bg-tk-surface text-tk-muted hover:text-tk-ink",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {query.isPending ? (
              <LoadingBlock label="Loading questions…" />
            ) : (
              <ul className="flex flex-col gap-3">
                {posts.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} />
                  </li>
                ))}
              </ul>
            )}
            {!signedIn ? (
              <p className="text-sm text-tk-muted">
                Some questions are for members only.{" "}
                <Link to="/login" className="font-semibold text-tk-brand hover:underline">
                  Log in
                </Link>{" "}
                to see them.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-4">
            <CommunityRules />
            <Link
              to="/bookkeepers"
              className="rounded-[18px] border border-tk-line bg-tk-surface p-5 font-semibold text-tk-brand hover:border-tk-brand"
            >
              Find a verified bookkeeper →
            </Link>
          </div>
        </div>
      </PublicPage>
    </SiteShell>
  );
}
