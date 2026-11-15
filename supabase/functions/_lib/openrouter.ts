// One place for calls to OpenRouter's chat completions API.
//
// MISSING: set OPENROUTER_API_KEY as an edge function secret.
import { OPENROUTER_CHAT_URL } from "../_shared/parser/models.ts";

import { requireEnv } from "./http.ts";

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
}): Promise<string> {
  const { OPENROUTER_API_KEY } = requireEnv("OPENROUTER_API_KEY");
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Takatax",
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      max_tokens: options.maxTokens ?? 4_000,
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
