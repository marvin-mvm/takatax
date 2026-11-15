import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { redactPersonalInfo } from "@shared/community/redact.ts";
import { CommunityRules, PublicPage } from "@/components/community/parts";
import { FormError } from "@/components/site/form";
import { SiteShell } from "@/components/site/SiteShell";
import { buttonPrimary } from "@/components/site/styles";
import { useAuth } from "@/lib/auth/use-auth";
import { createPost } from "@/lib/data/repository";

export const Route = createFileRoute("/community/new")({
  head: () => ({
    meta: [{ title: "Ask a question | Takatax Community" }, { name: "robots", content: "noindex" }],
  }),
  component: NewPostPage,
});

const TOPICS = [
  "Income tax",
  "Percentage tax",
  "VAT",
  "Form 2307",
  "Withholding",
  "Deductions",
  "Registration",
  "BIR letters",
  "General",
];
const FOUND_TEXT = {
  tin: "a TIN",
  phone: "a phone number",
  email: "an email",
  amount: "an amount",
} as const;

function NewPostPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [topic, setTopic] = useState("General");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const found = useMemo(
    () => [...new Set([...redactPersonalInfo(title).found, ...redactPersonalInfo(body).found])],
    [title, body],
  );

  if (auth.status !== "signedIn") {
    return (
      <SiteShell>
        <PublicPage
          title="Ask a question"
          intro="Log in to post. Your name is never shown to anyone."
        >
          <div className="flex flex-wrap gap-3">
            <Link to="/login" className={buttonPrimary}>
              Log in
            </Link>
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center rounded-[10px] px-4 font-semibold text-tk-brand hover:bg-tk-brand-soft"
            >
              Create a free account
            </Link>
          </div>
        </PublicPage>
      </SiteShell>
    );
  }

  const submit = async () => {
    setError(null);
    if (title.trim().length < 5) return setError("Write a short title of at least 5 characters.");
    if (body.trim().length < 10) return setError("Add a few words about your question.");
    setSaving(true);
    try {
      const post = await createPost({
        title: title.trim(),
        body: body.trim(),
        topic,
        visibility: isPrivate ? "members" : "public",
      });
      void navigate({
        to: "/community/$postId",
        params: { postId: post.id },
        search: post.localOnly ? { draft: true } : {},
      });
    } catch {
      setError("We could not post your question. Please try again.");
      setSaving(false);
    }
  };

  return (
    <SiteShell>
      <PublicPage
        title="Ask a question"
        intro="You post anonymously. Verified bookkeepers, CPAs and tax lawyers answer."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            className="flex flex-col gap-4 rounded-[18px] border border-tk-line bg-tk-surface p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {error ? <FormError>{error}</FormError> : null}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Your question</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                placeholder="For example: Do I file 2551Q if I chose the 8% option?"
                className="min-h-11 rounded-[10px] border border-tk-line px-3 focus-visible:outline-2 focus-visible:outline-tk-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Details</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={5000}
                placeholder="What happened, what you already filed, and what you want to know. Leave out your name and TIN."
                className="rounded-[10px] border border-tk-line px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-tk-brand"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Topic</span>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="min-h-11 rounded-[10px] border border-tk-line bg-tk-surface px-3"
              >
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-tk-line p-3">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-1 size-4 accent-[var(--tk-brand)]"
              />
              <span>
                <span className="block font-medium">Make this post private</span>
                <span className="block text-sm text-tk-muted">
                  Only logged-in members can see it, and Google will not show it. Without this, your
                  question is public.
                </span>
              </span>
            </label>
            {found.length ? (
              <p className="flex items-start gap-2 rounded-[12px] bg-tk-brand-soft px-3 py-2.5 text-sm text-tk-ink">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-tk-brand" />
                We will blur {found.map((k) => FOUND_TEXT[k]).join(", ")} before posting.
              </p>
            ) : null}
            <button type="submit" disabled={saving} className={`${buttonPrimary} self-start`}>
              {saving ? "Posting…" : "Post anonymously"}
            </button>
          </form>
          <CommunityRules />
        </div>
      </PublicPage>
    </SiteShell>
  );
}
