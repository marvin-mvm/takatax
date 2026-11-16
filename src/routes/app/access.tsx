import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, UserX } from "lucide-react";
import { useState } from "react";

import { MessageButton } from "@/components/app/MessageButton";
import { useAppUser } from "@/components/app/app-user";
import {
  Card,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SampleDataNotice,
  Stars,
  Tag,
} from "@/components/app/ui";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useMyAccess } from "@/lib/data/queries";
import { NotConnectedError, revokePartnerAccess } from "@/lib/data/repository";
import { PARTNER_KIND_LABEL, type AccessGrant } from "@/lib/data/types";
import { longDay } from "@/lib/time";

export const Route = createFileRoute("/app/access")({
  component: AccessPage,
});

/**
 * Who can see my account: every bookkeeper, CPA or tax lawyer with access now, what they can do,
 * and the ones who had access before. Removing access works at once.
 */
function AccessPage() {
  const { user } = useAppUser();
  const query = useMyAccess(user.id);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  if (query.isPending) return <LoadingBlock label="Loading who can see your account…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load this page.</p>;

  const grants = query.data.data;
  const active = grants.filter((g) => !g.revokedAt);
  const past = grants.filter((g) => g.revokedAt);

  const remove = async (grant: AccessGrant) => {
    if (!window.confirm(`Remove ${grant.partnerName}'s access to your account?`)) return;
    setRemoving(grant.partnerId);
    setNotice(null);
    try {
      await revokePartnerAccess(grant.partnerId);
      setNotice(`${grant.partnerName} can no longer see your account. Your messages stay.`);
      await queryClient.invalidateQueries({ queryKey: ["access", user.id] });
    } catch (error) {
      setNotice(
        error instanceof NotConnectedError
          ? "Access is not connected yet. Nothing was changed."
          : "We could not remove access. Please try again.",
      );
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Who can see my account"
        subtitle="Professionals you gave access to can see your documents, tracker and returns, and correct figures. They cannot delete anything or see your payments."
        action={
          <Link to="/bookkeepers" className={buttonPrimary}>
            <KeyRound aria-hidden className="size-5" /> Give someone access
          </Link>
        }
      />
      <SampleDataNotice source={query.data.source} what="example access" />
      {notice ? (
        <p role="status" className="rounded-[12px] bg-tk-surface-2 px-4 py-3">
          {notice}
        </p>
      ) : null}

      <section aria-labelledby="active-title" className="flex flex-col gap-3">
        <h2 id="active-title" className="text-xl font-semibold">
          Can see your account now{" "}
          <span className="font-tk-mono text-tk-muted">({active.length})</span>
        </h2>
        {active.length === 0 ? (
          <EmptyState title="Only you can see your account.">
            To let a bookkeeper, CPA or tax lawyer help you, open their profile and press “Give
            access to my account”. You can remove them here at any time.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((grant) => (
              <li key={grant.partnerId}>
                <Card as="div" className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      aria-hidden
                      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft text-lg font-semibold text-tk-brand"
                    >
                      {grant.partnerName.replace(/^(Atty\.|Dr\.)\s*/, "").charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        to="/bookkeepers/$partnerId"
                        params={{ partnerId: grant.partnerId }}
                        className="font-semibold hover:text-tk-brand hover:underline"
                      >
                        {grant.partnerName}
                      </Link>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-tk-muted">
                        <Tag tone="brand">{PARTNER_KIND_LABEL[grant.partnerKind]}</Tag>
                        {grant.city ? <span>{grant.city}</span> : null}
                        <Stars rating={grant.rating} count={grant.reviewCount} />
                      </p>
                      <p className="mt-1 text-sm text-tk-muted">
                        Access since {longDay(grant.grantedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <MessageButton otherUserId={grant.partnerId} />
                    <button
                      type="button"
                      onClick={() => void remove(grant)}
                      disabled={removing === grant.partnerId}
                      className={`${buttonOutline} hover:border-tk-danger hover:text-tk-danger`}
                    >
                      <UserX aria-hidden className="size-5" />
                      {removing === grant.partnerId ? "Removing…" : "Remove access"}
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card as="div" className="flex gap-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-tk-brand" />
        <div className="text-tk-muted text-pretty">
          <p>
            <strong className="font-semibold text-tk-ink">What access means.</strong> A professional
            with access can open your documents, tracker, My COR and return figures, correct a
            figure the AI read wrongly, and upload documents for you. Every professional here was
            verified by Takatax. Removing access works at once; your messages with them stay.
          </p>
        </div>
      </Card>

      {past.length > 0 ? (
        <section aria-labelledby="past-title" className="flex flex-col gap-3">
          <h2 id="past-title" className="text-xl font-semibold">
            Had access before
          </h2>
          <ul className="flex flex-col overflow-hidden rounded-[18px] border border-tk-line bg-tk-surface">
            {past.map((grant) => (
              <li
                key={grant.partnerId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-tk-line px-5 py-4 last:border-b-0"
              >
                <div>
                  <p className="font-medium">
                    {grant.partnerName}{" "}
                    <span className="text-tk-muted">· {PARTNER_KIND_LABEL[grant.partnerKind]}</span>
                  </p>
                  <p className="text-sm text-tk-muted">
                    From {longDay(grant.grantedAt)} to {longDay(grant.revokedAt ?? grant.grantedAt)}
                  </p>
                </div>
                <Link
                  to="/bookkeepers/$partnerId"
                  params={{ partnerId: grant.partnerId }}
                  className="font-semibold text-tk-brand hover:underline"
                >
                  View profile
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
