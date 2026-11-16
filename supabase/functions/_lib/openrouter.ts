// One place for calls to OpenRouter's chat completions API. Every call is logged to `ai_spend`
// (tokens and cost) when a spend context is given, for the daily spending cap in spend.ts.
//
// MISSING: set OPENROUTER_API_KEY as an edge function secret.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { OPENROUTER_CHAT_URL } from "../_shared/parser/models.ts";

import { requireEnv } from "./http.ts";

/** Where to log a call's cost: the service-role client and what the call was for. */
export interface SpendContext {
  admin: SupabaseClient;
  functionName: string;
  accountId?: string | null;
  documentId?: string | null;
  step?: string | null;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export async function chat(options: {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema the reply must follow (structured output). */
  schema?: { name: string; schema: unknown };
  maxTokens?: number;
  spend?: SpendContext;
  /** Give up after this long (the Supabase reader must finish each step in time). */
  timeoutMs?: number;
}): Promise<string> {
  const { OPENROUTER_API_KEY } = requireEnv("OPENROUTER_API_KEY");
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Takatax",
    },
    ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 4_000,
      // Ask OpenRouter to report the call's cost (usage accounting).
      // MISSING: confirm on openrouter.ai/docs that `usage.cost` is returned in US dollars.
      usage: { include: true },
      ...(options.schema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { ...options.schema, strict: true },
            },
          }
        : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const body = await response.json();
  if (options.spend) {
    const usage = body?.usage ?? {};
    const { error } = await options.spend.admin.from("ai_spend").insert({
      function_name: options.spend.functionName,
      account_id: options.spend.accountId ?? null,
      document_id: options.spend.documentId ?? null,
      step: options.spend.step ?? null,
      model: options.model,
      prompt_tokens: Number(usage.prompt_tokens ?? 0),
      completion_tokens: Number(usage.completion_tokens ?? 0),
      cost_usd: Number(usage.cost ?? 0),
    });
    if (error) console.error("ai_spend insert failed", error);
  }
  return body?.choices?.[0]?.message?.content ?? "";
}

/** A document as a message part: images as data URLs, PDFs as files. */
export function documentPart(bytes: Uint8Array, mimeType: string, fileName: string): ContentPart {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
  return mimeType === "application/pdf"
    ? { type: "file", file: { filename: fileName, file_data: dataUrl } }
    : { type: "image_url", image_url: { url: dataUrl } };
}
