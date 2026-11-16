import { Link, createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { useAppUser } from "@/components/app/app-user";
import { EmptyState, LoadingBlock, PageHeader, SampleDataNotice, Tag } from "@/components/app/ui";
import { buttonPrimary } from "@/components/site/styles";
import { useConversations } from "@/lib/data/queries";
import { isPartner } from "@/lib/data/repository";
import { PARTNER_KIND_LABEL } from "@/lib/data/types";
import { shortWhen } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/messages/")({
  component: MessagesPage,
});

/** Every conversation between this taxpayer and their professionals (or this partner and clients). */
function MessagesPage() {
  const { user, role } = useAppUser();
  const query = useConversations(user.id, role);
  const partner = isPartner(role);

  if (query.isPending) return <LoadingBlock label="Loading your messages…" />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your messages.</p>;

  const conversations = query.data.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages"
        subtitle={
          partner
            ? "Talk with your clients. Messages cannot be edited or deleted once sent."
            : "Talk with your bookkeeper, CPA or tax lawyer. Messages cannot be edited or deleted once sent."
        }
      />
      <SampleDataNotice source={query.data.source} what="example conversations" />
      {conversations.length === 0 ? (
        <EmptyState
          title="No messages yet."
          action={
            partner ? undefined : (
              <Link to="/bookkeepers" className={buttonPrimary}>
                Find a bookkeeper to message
              </Link>
            )
          }
        >
          {partner
            ? "Open a client from your client list and press Message, or wait for a taxpayer to write to you."
            : "Open a verified professional's profile and press Message."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[18px] border border-tk-line bg-tk-surface">
          {conversations.map((c) => (
            <li key={c.id} className="border-b border-tk-line last:border-b-0">
              <Link
                to="/app/messages/$conversationId"
                params={{ conversationId: c.id }}
                className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-tk-brand-soft/50 sm:px-5"
              >
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft font-semibold text-tk-brand"
                >
                  {c.otherName.replace(/^(Atty\.|Dr\.)\s*/, "").charAt(0) || (
                    <MessageSquare className="size-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate", c.unread ? "font-bold" : "font-semibold")}>
                      {c.otherName}
                    </span>
                    {c.lastMessageAt ? (
                      <span className="shrink-0 text-sm text-tk-muted">
                        {shortWhen(c.lastMessageAt)}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    {c.otherKind ? <Tag>{PARTNER_KIND_LABEL[c.otherKind]}</Tag> : null}
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        c.unread ? "font-medium text-tk-ink" : "text-tk-muted",
                      )}
                    >
                      {c.lastMessage
                        ? `${c.lastMessageFromMe ? "You: " : ""}${c.lastMessage}`
                        : "No messages yet"}
                    </span>
                  </span>
                </span>
                {c.unread ? (
                  <span className="mt-2 size-2.5 shrink-0 rounded-full bg-tk-brand">
                    <span className="sr-only">Unread</span>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
