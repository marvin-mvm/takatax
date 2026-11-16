import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Hourglass, KeyRound, MessageSquare, UserPlus, UserX, X } from "lucide-react";
import { useState } from "react";

import { MessageButton } from "@/components/app/MessageButton";
import { Stars } from "@/components/app/ui";
import { SiteShell } from "@/components/site/SiteShell";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useAuth } from "@/lib/auth/use-auth";
import { useMyAccess, usePartner } from "@/lib/data/queries";
import {
  cancelPartnerInvite,
  getPartner,
  invitationProblem,
  invitePartner,
  isPartner,
  revokePartnerAccess,
  roleOf,
  submitReview,
} from "@/lib/data/repository";
import { PARTNER_KIND_LABEL } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bookkeepers/$partnerId")({
  // If the server cannot reach the database, render without it; the page loads it in the browser.
  loader: async ({ params }) => {
    try {
      return (await getPartner(params.partnerId)).data;
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: `${loaderData.name}, ${PARTNER_KIND_LABEL[loaderData.kind]} in ${loaderData.city} | Takatax`,
          },
          { name: "description", content: loaderData.bio.slice(0, 155) },
        ]
      : [{ title: "Profile | Takatax" }, { name: "robots", content: "noindex" }],
  }),
  component: PartnerPage,
});

function PartnerPage() {
  const { partnerId } = Route.useParams();
  const serverPartner = Route.useLoaderData();
  const query = usePartner(partnerId);
  const partner = query.data?.data ?? serverPartner;
  const auth = useAuth();
  const isTaxpayer = auth.status === "signedIn" && !isPartner(roleOf(auth.user));
  const isOwnProfile = auth.status === "signedIn" && auth.user.id === partnerId;
  const signedInId = auth.status === "signedIn" ? auth.user.id : "";
  const access = useMyAccess(signedInId, isTaxpayer);
  const queryClient = useQueryClient();
  const grant = access.data?.data.find((g) => g.partnerId === partnerId);
  const status = grant?.status;
  const [message, setMessage] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");

  if (!partner) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-[760px] px-4 py-16 text-center sm:px-6">
          <h1 className="text-2xl font-bold">
            {isOwnProfile ? "Your profile is not public yet" : "Profile not found"}
          </h1>
          <p className="mt-2 text-tk-muted">
            {isOwnProfile
              ? "It goes public once we have checked your BIR accreditation or PRC licence."
              : "This profile may not be verified yet."}
          </p>
          <Link to="/bookkeepers" className={`${buttonPrimary} mt-6`}>
            All bookkeepers
          </Link>
        </div>
      </SiteShell>
    );
  }

  const run = async (action: () => Promise<void>, done: string) => {
    try {
      await action();
      setMessage(done);
    } catch (error) {
      setMessage(invitationProblem(error));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["access"] });
      void queryClient.invalidateQueries({ queryKey: ["access-events"] });
    }
  };
  const counts = [5, 4, 3, 2, 1].map((n) => ({
    n,
    count: partner.reviews.filter((r) => Math.round(r.rating) === n).length,
  }));

  return (
    <SiteShell>
      <div className="mx-auto grid max-w-[1120px] gap-6 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Link to="/bookkeepers" className="text-sm font-semibold text-tk-brand hover:underline">
            ← All bookkeepers
          </Link>
          <header className="flex flex-col gap-4 rounded-[18px] border border-tk-line bg-tk-surface p-5 sm:flex-row sm:items-center sm:p-6">
            <span
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft text-2xl font-bold text-tk-brand"
            >
              {partner.name.replace(/^(Atty\.|Dr\.)\s*/, "").charAt(0)}
            </span>
            <div>
              <h1 className="text-[28px]/[34px] font-bold tracking-tight">{partner.name}</h1>
              <p className="text-tk-muted">
                {PARTNER_KIND_LABEL[partner.kind]} · {partner.city} · {partner.yearsInPractice}{" "}
                years in practice
              </p>
              <div className="mt-2">
                <Stars rating={partner.rating} count={partner.reviewCount} />
              </div>
            </div>
          </header>

          <section className="rounded-[18px] border border-tk-line bg-tk-surface p-5 sm:p-6">
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 text-pretty">{partner.bio}</p>
            <p className="mt-4 flex flex-wrap gap-1.5">
              {partner.specialties.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-tk-surface-2 px-2.5 py-0.5 text-[13px] text-tk-muted"
                >
                  {s}
                </span>
              ))}
            </p>
          </section>

          <section
            aria-labelledby="reviews-title"
            className="rounded-[18px] border border-tk-line bg-tk-surface p-5 sm:p-6"
          >
            <h2 id="reviews-title" className="text-lg font-semibold">
              Reviews from clients
            </h2>
            <div className="mt-3 grid gap-6 sm:grid-cols-[200px_1fr]">
              <div>
                <p className="font-tk-mono text-4xl font-medium">{partner.rating.toFixed(1)}</p>
                <Stars rating={partner.rating} count={partner.reviewCount} />
                <ul className="mt-3 flex flex-col gap-1" aria-label="Ratings shown on this page">
                  {counts.map(({ n, count }) => (
                    <li key={n} className="flex items-center gap-2 text-sm text-tk-muted">
                      <span className="w-3">{n}</span>
                      <span className="h-1.5 flex-1 rounded-full bg-tk-surface-2">
                        <span
                          className="block h-full rounded-full bg-tk-accent"
                          style={{
                            width: `${partner.reviews.length ? (count / partner.reviews.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <span className="w-4 text-right">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="flex flex-col gap-4">
                {partner.reviews.map((r) => (
                  <li key={r.id} className="border-b border-tk-line pb-4 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <Stars rating={r.rating} />
                      <span className="text-sm text-tk-muted">{r.createdAt}</span>
                    </div>
                    <p className="mt-1.5 text-pretty">{r.body}</p>
                    <p className="mt-1 text-sm text-tk-muted">Verified client</p>
                  </li>
                ))}
                {partner.reviews.length === 0 ? (
                  <li className="text-tk-muted">No reviews yet.</li>
                ) : null}
              </ul>
            </div>
            {isTaxpayer ? (
              <form
                className="mt-6 flex flex-col gap-3 border-t border-tk-line pt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    () => submitReview(partner.id, rating, review),
                    "Thank you for your review.",
                  );
                }}
              >
                <p className="font-semibold">
                  Worked with {partner.name.split(",")[0]}? Leave a review.
                </p>
                <div role="radiogroup" aria-label="Rating" className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      onClick={() => setRating(n)}
                      className={cn(
                        "min-h-10 min-w-10 rounded-[10px] border font-semibold",
                        rating === n
                          ? "border-tk-brand bg-tk-brand-soft text-tk-brand"
                          : "border-tk-line",
                      )}
                    >
                      {n}★
                    </button>
                  ))}
                </div>
                <textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="What did they help you with?"
                  className="rounded-[10px] border border-tk-line px-3 py-2.5"
                />
                <button type="submit" className={`${buttonOutline} self-start`}>
                  Post review
                </button>
                <p className="text-sm text-tk-muted">
                  Only clients who had them in their account (an accepted invitation) can review
                  them.
                </p>
              </form>
            ) : null}
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[18px] border border-tk-line bg-tk-surface p-5">
            <p className="flex items-center gap-2 font-semibold text-tk-brand">
              <BadgeCheck aria-hidden className="size-5" /> Verified by Takatax
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-tk-muted">
              <li>
                BIR tax agent accreditation:{" "}
                {partner.verified.birAccreditation ? "checked" : "not given"}
              </li>
              <li>PRC licence: {partner.verified.prcLicense ? "checked" : "not given"}</li>
              {partner.verified.checkedOn ? (
                <li>Last checked {partner.verified.checkedOn}</li>
              ) : null}
            </ul>
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] border border-tk-line bg-tk-surface p-5">
            {isTaxpayer ? (
              <>
                <MessageButton
                  otherUserId={partner.id}
                  label={`Message ${partner.name.split(",")[0]}`}
                  primary
                  className="[&>button]:w-full"
                />
                {status === "active" ? (
                  <div className="flex flex-col gap-2 rounded-[12px] bg-tk-brand-soft p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-tk-brand">
                      <KeyRound aria-hidden className="size-4" /> Can see your account
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => revokePartnerAccess(partner.id),
                          `${partner.name} can no longer see your account.`,
                        )
                      }
                      className={`${buttonOutline} hover:border-tk-danger hover:text-tk-danger`}
                    >
                      <UserX aria-hidden className="size-5" /> Remove access
                    </button>
                  </div>
                ) : status === "pending" ? (
                  <div className="flex flex-col gap-2 rounded-[12px] bg-tk-warn-soft p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-tk-warn">
                      <Hourglass aria-hidden className="size-4" /> Invitation sent. Waiting for
                      their answer.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () => cancelPartnerInvite(partner.id),
                          `Your invitation to ${partner.name} is cancelled.`,
                        )
                      }
                      className={buttonOutline}
                    >
                      <X aria-hidden className="size-5" /> Cancel invitation
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => invitePartner(partner.id),
                        `Invitation sent. ${partner.name} can see your account only after they accept. You can cancel it under Access.`,
                      )
                    }
                    className={buttonOutline}
                  >
                    <UserPlus aria-hidden className="size-5" /> Invite to my account
                  </button>
                )}
              </>
            ) : auth.status !== "signedIn" ? (
              <Link to="/signup" className={buttonPrimary}>
                Sign up to message them
              </Link>
            ) : null}
            <Link to="/community" className={buttonOutline}>
              <MessageSquare aria-hidden className="size-5" /> Read their answers in the community
            </Link>
            {message ? (
              <p role="status" className="rounded-[10px] bg-tk-surface-2 px-3 py-2.5 text-sm">
                {message}
              </p>
            ) : null}
            <p className="text-[13px]/[18px] text-tk-muted">
              You agree on fees with them directly. Takatax does not handle payments between you and
              takes no cut.
            </p>
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}
