/**
 * The records assistant: answers questions about the user's own figures. The edge function
 * `assistant-chat` loads the user's records itself (it never trusts figures sent by the browser)
 * and asks an OpenRouter model to answer in plain words.
 *
 * MISSING: deploy `assistant-chat` and set OPENROUTER_API_KEY (see docs/MISSING_PIECES.md).
 */

import { callFunction, type FunctionResult } from "./functions";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantScope {
  accountId: string;
  year: number;
  fromMonth: number;
  toMonth: number;
  taxType: string;
}

export function askAssistant(
  messages: ChatMessage[],
  scope: AssistantScope,
): Promise<FunctionResult<{ reply: string }>> {
  return callFunction("assistant-chat", { messages, scope });
}
