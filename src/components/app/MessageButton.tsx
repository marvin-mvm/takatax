/**
 * "Message": opens the conversation with a partner (for a taxpayer) or a client (for a
 * partner), creating it the first time. The database decides who may message whom.
 */

import { useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { NotConnectedError, startConversation } from "@/lib/data/repository";
import { cn } from "@/lib/utils";

export function MessageButton({
  otherUserId,
  label = "Message",
  primary = false,
  className,
}: {
  otherUserId: string;
  label?: string;
  primary?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const conversationId = await startConversation(otherUserId);
      await navigate({ to: "/app/messages/$conversationId", params: { conversationId } });
    } catch (error) {
      setProblem(
        error instanceof NotConnectedError
          ? "Chat is not connected yet."
          : error instanceof Error && /verified|clients only/i.test(error.message)
            ? error.message
            : "We could not open the chat. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy || !otherUserId}
        className={primary ? buttonPrimary : buttonOutline}
      >
        <MessageSquare aria-hidden className="size-5" />
        {busy ? "Opening…" : label}
      </button>
      {problem ? (
        <span role="alert" className="text-sm text-tk-danger">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
