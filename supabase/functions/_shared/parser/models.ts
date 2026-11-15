/**
 * Which OpenRouter models the reader uses for each step. Model names never appear in the
 * product; they live only here and can be overridden with environment variables in the edge
 * function, so they can be swapped without a code change.
 *
 * MISSING: confirm the exact model slugs on https://openrouter.ai/models before going live.
 */

import type { ReaderStep } from "./pipeline.ts";

export const DEFAULT_READER_MODELS: Record<ReaderStep, string> = {
  fast: "google/gemini-3-flash",
  recheck: "anthropic/claude-haiku-5.5",
  settle: "google/gemini-3.1-pro",
};

/** The model the assistant chat uses to answer questions about a user's records. */
export const DEFAULT_ASSISTANT_MODEL = "google/gemini-3-flash";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
