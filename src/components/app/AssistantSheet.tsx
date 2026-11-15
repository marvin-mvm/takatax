/**
 * "Ask about your records": a chat that answers questions about the user's own figures. The
 * answers come from the `assistant-chat` edge function (OpenRouter); until it is connected,
 * the panel says so and shows the question it would have sent.
 */

import { MessageCircle, Send, Sparkles } from "lucide-react";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { type AssistantScope, type ChatMessage, askAssistant } from "@/lib/services/assistant";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "How much did I spend on supplies this quarter?",
  "Which month had my highest sales?",
  "How much tax should I set aside for my next return?",
  "Which receipts still need checking?",
];

const NOT_CONNECTED_REPLY =
  "The assistant is not connected yet, so I cannot read your records. Once Takatax adds its AI key, I will answer questions like this one from your own figures.";

export function AssistantSheet({
  scope,
  disabled = false,
}: {
  scope: AssistantScope;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    const result = await askAssistant(next, scope);
    setMessages([
      ...next,
      {
        role: "assistant",
        content: result.ok
          ? result.data.reply
          : result.reason === "not_connected"
            ? NOT_CONNECTED_REPLY
            : "Something went wrong. Please try again.",
      },
    ]);
    setBusy(false);
  };

  return (
    <Sheet>
      <SheetTrigger
        disabled={disabled}
        className="fixed right-4 bottom-4 z-20 inline-flex min-h-12 items-center gap-2 rounded-full bg-tk-ink px-5 font-semibold text-white shadow-[0_8px_24px_rgb(0_0_0/0.2)] transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand disabled:opacity-60 sm:right-6 sm:bottom-6"
      >
        <Sparkles aria-hidden className="size-5 text-tk-accent" />
        Ask about your records
      </SheetTrigger>
      <SheetContent className="tk-theme flex w-full flex-col gap-0 bg-tk-surface p-0 font-tk-sans text-tk-ink sm:max-w-[440px]">
        <SheetHeader className="border-b border-tk-line p-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-tk-ink">
            <MessageCircle aria-hidden className="size-5 text-tk-brand" />
            Ask about your records
          </SheetTitle>
          <SheetDescription className="text-tk-muted">
            Answers come from your own figures for the period on screen. It explains your numbers;
            it is not tax advice.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-tk-muted">Try asking</p>
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-[12px] border border-tk-line px-3 py-2.5 text-left text-[15px] hover:border-tk-brand hover:bg-tk-brand-soft"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            messages.map((message, index) => (
              <p
                key={index}
                className={cn(
                  "max-w-[85%] rounded-[14px] px-3.5 py-2.5 text-[15px]/[22px] whitespace-pre-wrap",
                  message.role === "user"
                    ? "self-end bg-tk-brand text-white"
                    : "self-start bg-tk-surface-2 text-tk-ink",
                )}
              >
                {message.content}
              </p>
            ))
          )}
          {busy ? <p className="self-start text-sm text-tk-muted">Thinking…</p> : null}
        </div>

        <form
          className="flex gap-2 border-t border-tk-line p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <label htmlFor="assistant-question" className="sr-only">
            Your question
          </label>
          <input
            id="assistant-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your sales, spending or tax"
            maxLength={500}
            className="min-h-11 flex-1 rounded-[10px] border border-tk-line bg-tk-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-tk-brand"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Send"
            className="flex size-11 items-center justify-center rounded-[10px] bg-tk-brand text-white disabled:opacity-50"
          >
            <Send aria-hidden className="size-4" />
          </button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
