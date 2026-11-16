/**
 * OpenRouter calls from the reader job. PDFs go to the model natively (the `file-parser`
 * plugin with the `native` engine): the model itself reads each page, with no OCR step, so it
 * understands what the document is (a sale, an expense, a 2307). Every call's tokens and cost
 * go to the `ai_spend` table for the daily spending cap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { OPENROUTER_CHAT_URL } from "../../supabase/functions/_shared/parser/models.ts";
import { env } from "./env";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface SpendContext {
  admin: SupabaseClient;
  accountId: string | null;
  documentId: string | null;
  step: string;
}

/** A photo or a PDF as a message part: images as data URLs, PDFs as files. */
export function documentPart(bytes: Uint8Array, mimeType: string, fileName: string): ContentPart {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  return mimeType === "application/pdf"
    ? { type: "file", file: { filename: fileName, file_data: dataUrl } }
    : { type: "image_url", image_url: { url: dataUrl } };
}

export async function chat(options: {
  model: string;
  messages: ChatMessage[];
  schema?: { name: string; schema: unknown };
  maxTokens?: number;
  spend: SpendContext;
}): Promise<string> {
  const hasPdf = options.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part) => part.type === "file"),
  );
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json",
      "X-Title": "Takatax",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 4_000,
      // MISSING: confirm on openrouter.ai/docs that `usage.cost` is returned in US dollars.
      usage: { include: true },
      // The model reads the PDF itself; never fall back to OCR.
      ...(hasPdf ? { plugins: [{ id: "file-parser", pdf: { engine: "native" } }] } : {}),
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
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const usage = body.usage ?? {};
  const { error } = await options.spend.admin.from("ai_spend").insert({
    function_name: "trigger:read-run",
    account_id: options.spend.accountId,
    document_id: options.spend.documentId,
    step: options.spend.step,
    model: options.model,
    prompt_tokens: Number(usage.prompt_tokens ?? 0),
    completion_tokens: Number(usage.completion_tokens ?? 0),
    cost_usd: Number(usage.cost ?? 0),
  });
  if (error) console.error("ai_spend insert failed", error.message);
  return body.choices?.[0]?.message?.content ?? "";
}
