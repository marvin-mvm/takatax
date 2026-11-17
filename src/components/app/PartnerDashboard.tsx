/** Home for bookkeepers, CPAs and tax lawyers: their clients, what is due, what needs checking. */

import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BadgePercent, Check, HandCoins, MailOpen, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

import { daysBetween, formatIsoDate } from "@shared/domain/dates.ts";
import { TAX_TYPES, maskTin } from "@shared/domain/tax-profile.ts";
import { PAYMENTS_LIVE } from "@shared/uploads/rules.ts";
import { PRICE } from "@/lib/pricing-copy";
import { useMyInvitations, usePartnerClients } from "@/lib/data/queries";
import { invitationProblem, respondToInvite, todayInManila } from "@/lib/data/repository";
import { PARTNER_KIND_LABEL, type PartnerInvitation, type PartnerKind } from "@/lib/data/types";
import { longDay } from "@/lib/time";
import { peso } from "@/lib/money";
import { displayName } from "@/lib/auth/use-auth";

import { MessageButton } from "./MessageButton";
import { useAppUser } from "./app-user";
import { useConfirm } from "./confirm";
import { Card, EmptyState, LoadingBlock, PageHeader, SampleDataNotice, Tag } from "./ui";

export function PartnerDashboard() {
  const { user, role } = useAppUser();
  const query = usePartnerClients(user.id);
  const [search, setSearch] = useState("");
  const today = todayInManila();

  const clients = useMemo(() => {
    const list = query.data?.data ?? [];
    const term = search.trim().toLowerCase();
    return term
      ? list.filter((c) => `${c.displayName} ${c.ownerName}`.toLowerCase().includes(term))
      : list;
  }, [query.data, search]);

  if (query.isPending) return <LoadingBlock label="Loading your clients…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your clients.</p>;

  const all = query.data.data;
  const dueSoon = all.filter(
    (c) => c.nextFiling && daysBetween(today, c.nextFiling.dueDate) <= 30,
  ).length;
  const toCheck = all.reduce((sum, c) => sum + c.documentsToCheck, 0);
  const kindLabel = PARTNER_KIND_LABEL[role as PartnerKind];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Your clients, ${displayName(user)}.`}
        subtitle={`${kindLabel} workspace. Open a client's profile to see their tracker, tax types, documents and what they need to pay, or message them.`}
      />
      <SampleDataNotice source={query.data.source} what="example clients" />
      <Invitations userId={user.id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card as="div" className="p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm text-tk-muted">
            <Users aria-hidden className="size-4" /> Clients
          </p>
          <p className="mt-1 font-tk-mono text-2xl font-medium">{all.length}</p>
        </Card>
        <Card as="div" className="p-4 sm:p-5">
          <p className="text-sm text-tk-muted">Returns due in 30 days</p>
          <p className="mt-1 font-tk-mono text-2xl font-medium">{dueSoon}</p>
        </Card>
        <Card as="div" className="p-4 sm:p-5">
          <p className="text-sm text-tk-muted">Documents to check</p>
          <p className="mt-1 font-tk-mono text-2xl font-medium">{toCheck}</p>
        </Card>
      </div>

      <section aria-labelledby="clients-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="clients-title" className="text-xl font-semibold">
            Clients
          </h2>
          <label className="w-full sm:w-72">
            <span className="sr-only">Search clients</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by business or owner"
              className="min-h-11 w-full rounded-[10px] border border-tk-line bg-tk-surface px-3 focus-visible:outline-2 focus-visible:outline-tk-brand"
            />
          </label>
        </div>
        {clients.length === 0 ? (
          <EmptyState title={all.length ? "No client matches that search." : "No clients yet."}>
            Taxpayers invite you from your public profile. Accept an invitation above to see their
            receipts, sales and COR; they can remove you at any time.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {clients.map((client) => (
              <li
                key={client.accountId}
                className="grid gap-4 rounded-[18px] border border-tk-line bg-tk-surface p-5 transition-colors hover:border-tk-brand md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"
              >
                <div>
                  <Link
                    to="/app/clients/$accountId"
                    params={{ accountId: client.accountId }}
                    className="font-semibold hover:text-tk-brand hover:underline"
                  >
                    {client.displayName}
                  </Link>
                  <p className="text-sm text-tk-muted">
                    {client.ownerName} · TIN {maskTin(client.tin)}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {client.taxTypes.map((type) => (
                      <Tag key={type}>{TAX_TYPES[type].label}</Tag>
                    ))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-tk-muted">Next return</p>
                  {client.nextFiling ? (
                    <>
                      <p className="font-medium">{client.nextFiling.form}</p>
                      <p className="text-sm text-tk-muted">
                        due {formatIsoDate(client.nextFiling.dueDate)}
                      </p>
                    </>
                  ) : (
                    <p className="text-tk-muted">No COR yet</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-tk-muted">Expected to pay</p>
                  <p className="font-tk-mono text-lg font-medium tabular-nums">
                    {client.nextFiling ? peso(client.nextFiling.estimate.payable) : "—"}
                  </p>
                  {client.documentsToCheck > 0 ? (
                    <Tag tone="warn">{client.documentsToCheck} to check</Tag>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
                  <Link
                    to="/app/clients/$accountId"
                    params={{ accountId: client.accountId }}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[10px] bg-tk-brand px-4 font-semibold text-white hover:bg-tk-brand/90"
                  >
                    Open profile <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  <MessageButton otherUserId={client.ownerUserId} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <Card as="div" className="flex gap-3">
          <BadgePercent aria-hidden className="mt-0.5 size-5 shrink-0 text-tk-brand" />
          <p className="text-tk-muted">
            {PAYMENTS_LIVE ? (
              <>
                <strong className="font-semibold text-tk-ink">
                  {PRICE.partnerDiscount} off every client run.
                </strong>{" "}
                You pay {PRICE.partnerRun} instead of {PRICE.run} for up to {PRICE.runPages} pages.
              </>
            ) : (
              <>
                <strong className="font-semibold text-tk-ink">Free during launch.</strong> Each
                client's first {PRICE.runPages} pages are read free; your {PRICE.partnerDiscount}{" "}
                partner price applies once payments start.
              </>
            )}
          </p>
        </Card>
        <Card as="div" className="flex gap-3">
          <HandCoins aria-hidden className="mt-0.5 size-5 shrink-0 text-tk-brand" />
          <p className="text-tk-muted">
            <strong className="font-semibold text-tk-ink">No platform fee.</strong> You bill your
            clients directly; Takatax never handles payments between you.
          </p>
        </Card>
      </div>
    </div>
  );
}

/**
 * Taxpayers who invited the professional into their account. Until the professional accepts,
 * they see only the name; accepting opens the client's records and COR (never their plan or
 * payments). Every step shows in the client's activity log.
 */
function Invitations({ userId }: { userId: string }) {
  const query = useMyInvitations(userId);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const invitations = query.data?.data ?? [];
  if (invitations.length === 0 && !notice) return null;

  const answer = async (invitation: PartnerInvitation, accept: boolean) => {
    const who = invitation.businessName || invitation.taxpayerName || "this taxpayer";
    if (
      !accept &&
      !(await confirm({
        title: "Decline this invitation?",
        subject: `From ${who}`,
        confirm: "Decline",
        cancel: "Not now",
      }))
    )
      return;
    setBusy(invitation.accountId);
    setNotice(null);
    try {
      await respondToInvite(invitation.accountId, accept);
      setNotice(
        accept
          ? `You can now open ${who}'s records. They are in your client list.`
          : `You declined the invitation from ${who}.`,
      );
    } catch (error) {
      setNotice(invitationProblem(error));
    } finally {
      setBusy(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invitations", userId] }),
        queryClient.invalidateQueries({ queryKey: ["partner-clients", userId] }),
      ]);
    }
  };

  return (
    <section aria-labelledby="invitations-title" className="flex flex-col gap-3">
      {dialog}
      <h2 id="invitations-title" className="flex items-center gap-2 text-xl font-semibold">
        <MailOpen aria-hidden className="size-5 text-tk-brand" /> Invitations{" "}
        <span className="font-tk-mono text-tk-muted">({invitations.length})</span>
      </h2>
      {notice ? (
        <p role="status" className="rounded-[12px] bg-tk-surface-2 px-4 py-3">
          {notice}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <li key={invitation.accountId}>
            <Card as="div" className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {invitation.businessName || invitation.taxpayerName || "A taxpayer"}
                </p>
                <p className="text-sm text-tk-muted">
                  {invitation.businessName && invitation.taxpayerName
                    ? `${invitation.taxpayerName} · `
                    : ""}
                  Invited you {longDay(invitation.invitedAt)}
                </p>
                <p className="mt-1 text-sm text-tk-muted text-pretty">
                  Accept to see their receipts, sales, Forms 2307 and COR. They see what you open
                  and change in their activity log.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <MessageButton otherUserId={invitation.taxpayerUserId} />
                <button
                  type="button"
                  onClick={() => void answer(invitation, false)}
                  disabled={busy === invitation.accountId}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border border-tk-line px-4 font-semibold hover:border-tk-danger hover:text-tk-danger disabled:opacity-60"
                >
                  <X aria-hidden className="size-5" /> Decline
                </button>
                <button
                  type="button"
                  onClick={() => void answer(invitation, true)}
                  disabled={busy === invitation.accountId}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-tk-brand px-4 font-semibold text-white hover:bg-tk-brand/90 disabled:opacity-60"
                >
                  <Check aria-hidden className="size-5" />
                  {busy === invitation.accountId ? "Saving…" : "Accept"}
                </button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
