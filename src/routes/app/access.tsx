import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, KeyRound, PencilLine, ShieldCheck, UserPlus, UserX, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { MessageButton } from "@/components/app/MessageButton";
import { useAppUser } from "@/components/app/app-user";
import { type ConfirmContent, useConfirm } from "@/components/app/confirm";
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
import {
  ACCESS_STATUS_LABEL,
  ACTION_GROUP,
  describeGroup,
  groupAccessEvents,
} from "@/lib/data/access-log";
import { useAccessEvents, useMyAccess } from "@/lib/data/queries";
import { cancelPartnerInvite, invitationProblem, revokePartnerAccess } from "@/lib/data/repository";
import { PARTNER_KIND_LABEL, type AccessEvent, type AccessGrant } from "@/lib/data/types";
import { clockTime, longDay, manilaDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/access")({
  component: AccessPage,
});

/**
 * Who can see my account. The taxpayer invites a professional, who accepts or declines; the
 * taxpayer can cancel an invitation or remove access at any time. The activity log below lists
 * every invitation step and what each professional opened or changed. Professionals never see
 * this page or the payments; their features follow the taxpayer's plan.
 */
function AccessPage() {
  const { user } = useAppUser();
  const query = useMyAccess(user.id);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  if (query.isPending) return <LoadingBlock label="Loading who can see your account…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load this page.</p>;

  const grants = query.data.data;
  const pending = grants.filter((g) => g.status === "pending");
  const active = grants.filter((g) => g.status === "active");
  const past = grants.filter((g) => g.status !== "pending" && g.status !== "active");

  const act = async (
    grant: AccessGrant,
    question: ConfirmContent,
    action: (partnerId: string) => Promise<void>,
    done: string,
  ) => {
    if (!(await confirm(question))) return;
    setBusy(grant.partnerId);
    setNotice(null);
    try {
      await action(grant.partnerId);
      setNotice(done);
    } catch (error) {
      setNotice(invitationProblem(error));
    } finally {
      setBusy(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["access", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["access-events", user.id] }),
      ]);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {dialog}
      <PageHeader
        title="Who can see my account"
        subtitle="Invite a bookkeeper, CPA or tax lawyer. Once they accept, they can see your receipts, sales, Forms 2307 and COR, and work with the features of your plan. They never see your payments or this page."
        action={
          <Link to="/bookkeepers" className={buttonPrimary}>
            <UserPlus aria-hidden className="size-5" /> Invite a professional
          </Link>
        }
      />
      <SampleDataNotice source={query.data.source} what="example access" />
      {notice ? (
        <p role="status" className="rounded-[12px] bg-tk-surface-2 px-4 py-3">
          {notice}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <section aria-labelledby="pending-title" className="flex flex-col gap-3">
          <h2 id="pending-title" className="text-xl font-semibold">
            Waiting for an answer{" "}
            <span className="font-tk-mono text-tk-muted">({pending.length})</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {pending.map((grant) => (
              <li key={grant.partnerId}>
                <PartnerCard grant={grant} line={`Invited ${longDay(grant.invitedAt)}`}>
                  <MessageButton otherUserId={grant.partnerId} />
                  <button
                    type="button"
                    onClick={() =>
                      void act(
                        grant,
                        {
                          title: "Cancel this invitation?",
                          subject: grant.partnerName,
                          confirm: "Cancel invitation",
                          cancel: "Keep it",
                        },
                        cancelPartnerInvite,
                        `Your invitation to ${grant.partnerName} is cancelled.`,
                      )
                    }
                    disabled={busy === grant.partnerId}
                    className={buttonOutline}
                  >
                    <X aria-hidden className="size-5" />
                    {busy === grant.partnerId ? "Cancelling…" : "Cancel invitation"}
                  </button>
                </PartnerCard>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="active-title" className="flex flex-col gap-3">
        <h2 id="active-title" className="text-xl font-semibold">
          Can see your account now{" "}
          <span className="font-tk-mono text-tk-muted">({active.length})</span>
        </h2>
        {active.length === 0 ? (
          <EmptyState title="Only you can see your account.">
            To let a bookkeeper, CPA or tax lawyer help you, open their profile and press “Invite to
            my account”. They can see your account only after they accept, and you can remove them
            here at any time.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((grant) => (
              <li key={grant.partnerId}>
                <PartnerCard
                  grant={grant}
                  line={`Access since ${longDay(grant.grantedAt ?? grant.invitedAt)}`}
                >
                  <MessageButton otherUserId={grant.partnerId} />
                  <button
                    type="button"
                    onClick={() =>
                      void act(
                        grant,
                        {
                          title: "Remove their access?",
                          subject: grant.partnerName,
                          points: ["They can no longer see your account.", "Your messages stay."],
                          confirm: "Remove access",
                        },
                        revokePartnerAccess,
                        `${grant.partnerName} can no longer see your account. Your messages stay.`,
                      )
                    }
                    disabled={busy === grant.partnerId}
                    className={`${buttonOutline} hover:border-tk-danger hover:text-tk-danger`}
                  >
                    <UserX aria-hidden className="size-5" />
                    {busy === grant.partnerId ? "Removing…" : "Remove access"}
                  </button>
                </PartnerCard>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card as="div" className="flex gap-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-tk-brand" />
        <div className="flex flex-col gap-2 text-tk-muted text-pretty">
          <p>
            <strong className="font-semibold text-tk-ink">What a professional can do.</strong> Open
            your receipts, sales invoices, Forms 2307 and COR, your tracker and return figures;
            correct a figure the AI read wrongly; upload documents for you; and delete a document.
          </p>
          <p>
            <strong className="font-semibold text-tk-ink">What they cannot.</strong> See your plan,
            payments or this page, or invite anyone else. Everything they open, change or delete
            appears in the activity log below, and no one can edit the log.
          </p>
        </div>
      </Card>

      <ActivityLog userId={user.id} grants={grants} />

      {past.length > 0 ? (
        <section aria-labelledby="past-title" className="flex flex-col gap-3">
          <h2 id="past-title" className="text-xl font-semibold">
            Past invitations and access
          </h2>
          <ul className="flex flex-col overflow-hidden rounded-[18px] border border-tk-line bg-tk-surface">
            {past.map((grant) => (
              <li
                key={grant.partnerId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-tk-line px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {grant.partnerName}{" "}
                    <span className="text-tk-muted">· {PARTNER_KIND_LABEL[grant.partnerKind]}</span>
                  </p>
                  <p className="text-sm text-tk-muted">
                    {ACCESS_STATUS_LABEL[grant.status]}
                    {grant.grantedAt
                      ? ` · had access from ${longDay(grant.grantedAt)} to ${longDay(grant.endedAt ?? grant.grantedAt)}`
                      : ` · invited ${longDay(grant.invitedAt)}`}
                  </p>
                </div>
                <Link
                  to="/bookkeepers/$partnerId"
                  params={{ partnerId: grant.partnerId }}
                  className="font-semibold text-tk-brand hover:underline"
                >
                  View profile or invite again
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function PartnerCard({
  grant,
  line,
  children,
}: {
  grant: AccessGrant;
  line: string;
  children: ReactNode;
}) {
  return (
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
            <Tag tone={grant.status === "pending" ? "warn" : "brand"}>
              {PARTNER_KIND_LABEL[grant.partnerKind]}
            </Tag>
            {grant.city ? <span>{grant.city}</span> : null}
            <Stars rating={grant.rating} count={grant.reviewCount} />
          </p>
          <p className="mt-1 text-sm text-tk-muted">
            {ACCESS_STATUS_LABEL[grant.status]} · {line}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </Card>
  );
}

const GROUP_ICON = { access: KeyRound, viewed: Eye, changed: PencilLine } as const;
const GROUP_LABEL = { access: "Access", viewed: "Opened", changed: "Changed" } as const;
type Filter = "all" | "viewed" | "changed" | "access";

/** Every invitation step and what professionals opened or changed, newest first. */
function ActivityLog({ userId, grants }: { userId: string; grants: AccessGrant[] }) {
  const query = useAccessEvents(userId);
  const [partner, setPartner] = useState("all");
  const [kind, setKind] = useState<Filter>("all");

  const events = useMemo(() => query.data?.data ?? [], [query.data]);
  const people = useMemo(() => {
    const names = new Map<string, string>();
    for (const g of grants) names.set(g.partnerId, g.partnerName);
    for (const e of events)
      if (e.partnerId && !names.has(e.partnerId)) names.set(e.partnerId, e.partnerName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [grants, events]);

  const days = useMemo(() => {
    const shown = events.filter(
      (e: AccessEvent) =>
        (partner === "all" || e.partnerId === partner) &&
        (kind === "all" || ACTION_GROUP[e.action] === kind),
    );
    const byDay = new Map<string, ReturnType<typeof groupAccessEvents>>();
    for (const group of groupAccessEvents(shown)) {
      const day = manilaDay(group.first.createdAt);
      byDay.set(day, [...(byDay.get(day) ?? []), group]);
    }
    return [...byDay.entries()];
  }, [events, partner, kind]);

  return (
    <section aria-labelledby="log-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="log-title" className="text-xl font-semibold">
            Activity log
          </h2>
          <p className="text-sm text-tk-muted">
            What professionals opened and changed in your account. Only you can see this.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Professional</span>
            <select
              value={partner}
              onChange={(event) => setPartner(event.target.value)}
              className="h-11 w-full rounded-[12px] border border-tk-line bg-tk-surface px-3 sm:w-56"
            >
              <option value="all">All professionals</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name || "A professional"}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Kind of activity</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as Filter)}
              className="h-11 w-full rounded-[12px] border border-tk-line bg-tk-surface px-3 sm:w-44"
            >
              <option value="all">Everything</option>
              <option value="changed">Changes</option>
              <option value="viewed">What they opened</option>
              <option value="access">Invitations and access</option>
            </select>
          </label>
        </div>
      </div>

      {query.isPending ? (
        <LoadingBlock label="Loading the activity log…" />
      ) : query.isError ? (
        <p className="text-tk-danger">We could not load the activity log.</p>
      ) : days.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-tk-line px-4 py-6 text-center text-tk-muted">
          {events.length === 0 ? "Nothing yet." : "Nothing matches these filters."}
        </p>
      ) : (
        <ol className="flex flex-col gap-5">
          {days.map(([day, groups]) => (
            <li key={day} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-tk-muted">
                {longDay(groups[0]?.first.createdAt ?? day)}
              </h3>
              <ol className="flex flex-col overflow-hidden rounded-[16px] border border-tk-line bg-tk-surface">
                {groups.map((group) => {
                  const { title, lines } = describeGroup(group);
                  const tone = ACTION_GROUP[group.first.action];
                  const Icon = GROUP_ICON[tone];
                  return (
                    <li
                      key={group.key}
                      className="flex gap-3 border-b border-tk-line px-4 py-3 last:border-b-0"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          tone === "changed"
                            ? "bg-tk-warn-soft text-tk-warn"
                            : "bg-tk-brand-soft text-tk-brand",
                        )}
                      >
                        <Icon aria-hidden className="size-4" />
                        <span className="sr-only">{GROUP_LABEL[tone]}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-pretty">{title}</p>
                        {lines.map((line) => (
                          <p key={line} className="text-sm break-words text-tk-muted">
                            {line}
                          </p>
                        ))}
                      </div>
                      <time
                        dateTime={group.first.createdAt}
                        className="shrink-0 font-tk-mono text-sm text-tk-muted"
                      >
                        {clockTime(group.first.createdAt)}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
