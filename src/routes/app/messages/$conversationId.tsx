import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Send } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { useAppUser } from "@/components/app/app-user";
import { BackLink, EmptyState, LoadingBlock, SampleDataNotice, Tag } from "@/components/app/ui";
import { useConversation } from "@/lib/data/queries";
import {
  NotConnectedError,
  isPartner,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
} from "@/lib/data/repository";
import {
  PARTNER_KIND_LABEL,
  type ChatMessageRecord,
  type ConversationThread,
  type Loaded,
} from "@/lib/data/types";
import { clockTime, longDay, manilaDay } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/messages/$conversationId")({
  component: ConversationPage,
});

const MAX_LENGTH = 4000;

/** One conversation: the messages, oldest first, and a box to send a new one. */
function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { user, role } = useAppUser();
  const queryClient = useQueryClient();
  const query = useConversation(conversationId, user.id, role);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const messageCount = query.data?.data?.messages.length ?? 0;

  // New messages from the other person arrive through Realtime and are added to the cache.
  useEffect(() => {
    const stop = subscribeToMessages(conversationId, (message) => {
      queryClient.setQueryData<Loaded<ConversationThread | null>>(
        ["conversation", conversationId],
        (current) => {
          if (!current?.data || current.data.messages.some((m) => m.id === message.id)) {
            return current;
          }
          return {
            ...current,
            data: { ...current.data, messages: [...current.data.messages, message] },
          };
        },
      );
    });
    return stop;
  }, [conversationId, queryClient]);

  // Opening the conversation (or receiving a message while it is open) marks it as read.
  useEffect(() => {
    if (!messageCount) return;
    void markConversationRead(conversationId).then(() =>
      queryClient.invalidateQueries({ queryKey: ["conversations"] }),
    );
  }, [conversationId, messageCount, queryClient]);

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messageCount]);

  if (query.isPending) return <LoadingBlock label="Loading the conversation…" />;
  if (query.isError || !query.data.data) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to="/app/messages">All messages</BackLink>
        <EmptyState title="We could not open this conversation.">
          It may not exist, or it is not one of yours.
        </EmptyState>
      </div>
    );
  }

  const { conversation, messages } = query.data.data;
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setProblem(null);
    try {
      await sendMessage(conversationId, body);
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) {
      setProblem(
        error instanceof NotConnectedError
          ? "Chat is not connected yet, so this message was not sent."
          : "The message was not sent. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/app/messages">All messages</BackLink>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-tk-brand-soft text-lg font-semibold text-tk-brand"
          >
            {conversation.otherName.replace(/^(Atty\.|Dr\.)\s*/, "").charAt(0)}
          </span>
          <div>
            <h1 className="text-[24px]/[30px] font-bold tracking-tight">
              {conversation.otherName}
            </h1>
            <p className="flex items-center gap-2 text-sm text-tk-muted">
              {conversation.otherKind ? (
                <>
                  <Tag>{PARTNER_KIND_LABEL[conversation.otherKind]}</Tag>
                  <Link
                    to="/bookkeepers/$partnerId"
                    params={{ partnerId: conversation.otherUserId }}
                    className="font-semibold text-tk-brand hover:underline"
                  >
                    View profile
                  </Link>
                </>
              ) : isPartner(role) ? (
                "Your client"
              ) : null}
            </p>
          </div>
        </div>
      </header>
      <SampleDataNotice source={query.data.source} what="an example conversation" />

      <div className="flex flex-col overflow-hidden rounded-[18px] border border-tk-line bg-tk-surface">
        <ol
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${conversation.otherName}`}
          className="flex h-[min(58vh,560px)] flex-col gap-2 overflow-y-auto px-4 py-5 sm:px-6"
        >
          {messages.length === 0 ? (
            <li className="m-auto max-w-[40ch] text-center text-tk-muted">
              Say hello. Explain what you need help with; you can share documents by giving access
              to your account.
            </li>
          ) : (
            messages.map((message, index) => (
              <Fragment key={message.id}>
                {index === 0 ||
                manilaDay(messages[index - 1]?.createdAt ?? "") !== manilaDay(message.createdAt) ? (
                  <li className="my-2 self-center rounded-full bg-tk-surface-2 px-3 py-1 text-[13px] text-tk-muted">
                    {longDay(message.createdAt)}
                  </li>
                ) : null}
                <MessageBubble
                  message={message}
                  mine={message.senderUserId === user.id}
                  otherName={conversation.otherName}
                />
              </Fragment>
            ))
          )}
        </ol>

        <form
          className="flex flex-col gap-2 border-t border-tk-line p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor="message-draft" className="sr-only">
            Message to {conversation.otherName}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="message-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter starts a new line.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={MAX_LENGTH}
              placeholder="Write a message"
              className="min-h-12 flex-1 resize-y rounded-[12px] border border-tk-line bg-tk-surface px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-tk-brand"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="inline-flex min-h-12 items-center gap-2 rounded-[12px] bg-tk-brand px-4 font-semibold text-white disabled:opacity-50"
            >
              <Send aria-hidden className="size-4" />
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-tk-muted">
            <span className="flex items-center gap-1.5">
              <Lock aria-hidden className="size-3.5" />
              Messages cannot be edited or deleted once sent.
            </span>
            {draft.length > MAX_LENGTH - 400 ? (
              <span>
                {draft.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
              </span>
            ) : null}
          </p>
          {problem ? (
            <p role="alert" className="text-sm text-tk-danger">
              {problem}
            </p>
          ) : null}
        </form>
      </div>
      <p className="text-[13px] text-tk-muted">
        Agree on fees directly with each other. Takatax does not handle payments between taxpayers
        and professionals.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  otherName,
}: {
  message: ChatMessageRecord;
  mine: boolean;
  otherName: string;
}) {
  return (
    <li
      className={cn(
        "flex max-w-[85%] flex-col gap-0.5 sm:max-w-[70%]",
        mine ? "self-end items-end" : "self-start items-start",
      )}
    >
      <p
        className={cn(
          "rounded-[16px] px-3.5 py-2.5 text-[15px]/[22px] whitespace-pre-wrap break-words",
          mine
            ? "rounded-br-[6px] bg-tk-brand text-white"
            : "rounded-bl-[6px] bg-tk-surface-2 text-tk-ink",
        )}
      >
        <span className="sr-only">{mine ? "You" : otherName}: </span>
        {message.body}
      </p>
      <time dateTime={message.createdAt} className="px-1 text-[12px] text-tk-muted">
        {clockTime(message.createdAt)}
      </time>
    </li>
  );
}
