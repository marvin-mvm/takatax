import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";

import { MessageButton } from "@/components/app/MessageButton";
import { Stars } from "@/components/app/ui";
import { CommunityRules, VisibilityBadge } from "@/components/community/parts";
import { SiteShell } from "@/components/site/SiteShell";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useAuth } from "@/lib/auth/use-auth";
import { useIsMyPost, usePost } from "@/lib/data/queries";
import {
  NotConnectedError,
  createAnswer,
  deleteMyPost,
  getPost,
  isPartner,
  markAnswerHelpful,
  roleOf,
} from "@/lib/data/repository";
import { PARTNER_KIND_LABEL } from "@/lib/data/types";

export const Route = createFileRoute("/community/$postId")({
  // `draft` marks a post kept in this browser only, because the community is not connected yet.
  validateSearch: (search: Record<string, unknown>): { draft?: boolean } =>
    search["draft"] ? { draft: true } : {},
  // Loaded on the server for search engines. Members-only posts come back empty here, so they
  // are never in the server HTML and get a noindex tag.
  // If the server cannot reach the database, render without it; the page loads it in the browser.
  loader: async ({ params }) => {
    try {
      return (await getPost(params.postId, false)).data;
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | Takatax Community` },
          { name: "description", content: loaderData.body.slice(0, 155) },
          { property: "og:title", content: loaderData.title },
        ]
      : [{ title: "Community question | Takatax" }, { name: "robots", content: "noindex" }],
  }),
  component: PostPage,
});

function PostPage() {
  const { postId } = Route.useParams();
  const { draft } = Route.useSearch();
  const serverPost = Route.useLoaderData();
  const auth = useAuth();
  const signedIn = auth.status === "signedIn";
  const query = usePost(postId, signedIn);
  const post = query.data?.data ?? serverPost;
  const canAnswer = auth.status === "signedIn" && isPartner(roleOf(auth.user));
  const isTaxpayer = auth.status === "signedIn" && !isPartner(roleOf(auth.user));
  // Only the asker gets "This helped" and "Delete"; nobody else learns who asked.
  const mine = useIsMyPost(postId, signedIn).data === true;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["post", postId] });
  const [answer, setAnswer] = useState("");
  const [answerMessage, setAnswerMessage] = useState<string | null>(null);

  if (!post) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[760px] px-4 py-16 text-center sm:px-6">
          <h1 className="text-2xl font-bold">
            {signedIn ? "Question not found" : "Members-only question"}
          </h1>
          <p className="mt-2 text-tk-muted">
            {signedIn
              ? "It may have been deleted."
              : "Log in to read questions that members chose to keep private."}
          </p>
          <Link to={signedIn ? "/community" : "/login"} className={`${buttonPrimary} mt-6`}>
            {signedIn ? "Back to the community" : "Log in"}
          </Link>
        </div>
      </SiteShell>
    );
  }

  const sendAnswer = async () => {
    try {
      await createAnswer(post.id, answer);
      setAnswerMessage("Thank you. Your answer is posted.");
      setAnswer("");
      void refresh();
    } catch (error) {
      setAnswerMessage(
        error instanceof NotConnectedError
          ? "Answers are not connected yet, so this was not saved."
          : "We could not post your answer.",
      );
    }
  };

  const toggleHelpful = async (answerId: string, helped: boolean) => {
    try {
      await markAnswerHelpful(answerId, helped);
      await refresh();
    } catch {
      // Nothing to show: the button simply stays as it was.
    }
  };

  const removePost = async () => {
    if (!window.confirm("Delete your question? Answers to it will no longer be shown.")) return;
    try {
      await deleteMyPost(post.id);
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      await navigate({ to: "/community" });
    } catch {
      setAnswerMessage("We could not delete the question. Please try again.");
    }
  };

  return (
    <SiteShell>
      <article className="mx-auto grid max-w-[1120px] gap-6 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Link to="/community" className="text-sm font-semibold text-tk-brand hover:underline">
            ← All questions
          </Link>
          {draft || post.localOnly ? (
            <p role="note" className="rounded-[12px] bg-tk-warn-soft px-4 py-3 text-sm">
              <strong className="font-semibold">Not saved yet.</strong> The community database is
              not connected, so this question is only kept in this browser for now.
            </p>
          ) : null}
          <header className="rounded-[18px] border border-tk-line bg-tk-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm text-tk-muted">
              <span className="font-medium text-tk-ink">{post.topic}</span>
              <span aria-hidden>·</span>
              <span>Asked by an anonymous taxpayer</span>
              <span aria-hidden>·</span>
              <time dateTime={post.createdAt}>{post.createdAt.slice(0, 10)}</time>
              <VisibilityBadge visibility={post.visibility} />
            </div>
            <h1 className="mt-3 text-[28px]/[34px] font-bold tracking-tight text-balance">
              {post.title}
            </h1>
            <p className="mt-3 text-lg/7 whitespace-pre-wrap text-pretty">{post.body}</p>
            {mine ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-tk-line pt-4 text-sm text-tk-muted">
                <span>You asked this. Only you can see this note.</span>
                <button
                  type="button"
                  onClick={() => void removePost()}
                  className={`${buttonOutline} min-h-9 px-3 text-sm hover:border-tk-danger hover:text-tk-danger`}
                >
                  <Trash2 aria-hidden className="size-4" /> Delete my question
                </button>
              </div>
            ) : null}
          </header>

          <section aria-labelledby="answers-title" className="flex flex-col gap-3">
            <h2 id="answers-title" className="text-xl font-semibold">
              {post.answers.length
                ? `${post.answers.length} answer${post.answers.length === 1 ? "" : "s"}`
                : "No answers yet"}
            </h2>
            {post.answers.map((a) => (
              <div key={a.id} className="rounded-[18px] border border-tk-line bg-tk-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      to="/bookkeepers/$partnerId"
                      params={{ partnerId: a.partnerId }}
                      className="font-semibold text-tk-brand hover:underline"
                    >
                      {a.partnerName}
                    </Link>
                    <p className="text-sm text-tk-muted">
                      Verified {PARTNER_KIND_LABEL[a.partnerKind].toLowerCase()}
                    </p>
                  </div>
                  <Stars rating={a.partnerRating} />
                </div>
                <p className="mt-3 whitespace-pre-wrap text-pretty">{a.body}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-tk-muted">
                  <span>From {a.partnerName}. Not reviewed by Takatax.</span>
                  {mine ? (
                    <button
                      type="button"
                      aria-pressed={a.helpful}
                      onClick={() => void toggleHelpful(a.id, !a.helpful)}
                      className={`${buttonOutline} min-h-9 px-3 text-sm ${a.helpful ? "border-tk-brand text-tk-brand" : ""}`}
                    >
                      <ThumbsUp aria-hidden className="size-4" />
                      {a.helpful ? "This helped" : "Mark as helpful"}
                    </button>
                  ) : a.helpful ? (
                    <span className="inline-flex items-center gap-1 font-medium text-tk-brand">
                      <ThumbsUp aria-hidden className="size-4" /> This helped the asker
                    </span>
                  ) : null}
                </div>
                {isTaxpayer ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-tk-line pt-3">
                    <MessageButton
                      otherUserId={a.partnerId}
                      label={`Message ${a.partnerName.split(",")[0]}`}
                    />
                    <span className="text-[13px] text-tk-muted">
                      A private chat shows them your name, not which question you asked.
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </section>

          {canAnswer ? (
            <form
              className="flex flex-col gap-3 rounded-[18px] border border-tk-line bg-tk-surface p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void sendAnswer();
              }}
            >
              <label htmlFor="answer" className="font-semibold">
                Your answer
              </label>
              <textarea
                id="answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                minLength={10}
                maxLength={5000}
                className="rounded-[10px] border border-tk-line px-3 py-2.5"
                placeholder="Answer the question itself. “Message me” answers are removed."
              />
              {answerMessage ? (
                <p role="status" className="rounded-[10px] bg-tk-surface-2 px-3 py-2.5 text-sm">
                  {answerMessage}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={answer.trim().length < 10}
                className={`${buttonPrimary} self-start`}
              >
                Post answer
              </button>
            </form>
          ) : (
            <p className="text-sm text-tk-muted">
              Only verified bookkeepers, CPAs and tax lawyers can answer.
            </p>
          )}
        </div>
        <CommunityRules />
      </article>
    </SiteShell>
  );
}
