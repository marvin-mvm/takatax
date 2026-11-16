/**
 * Which OpenRouter models the reader uses for each step. Model names never appear in the
 * product; they live only here and can be overridden with environment variables in the edge
 * function, so they can be swapped without a code change.
 *
 * The names were checked against OpenRouter's model list (https://openrouter.ai/models) on
 * 2026-11-16: all three exist and accept photos, PDFs and a JSON schema. The Gemini names end in
 * "-preview" there, so check them again when those models leave preview.
 */

import type { ReaderStep } from "./pipeline.ts";

export const DEFAULT_READER_MODELS: Record<ReaderStep, string> = {
  fast: "google/gemini-3-flash-preview",
  recheck: "anthropic/claude-haiku-5.5",
  settle: "google/gemini-3.1-pro-preview",
};

/** The model the assistant chat uses to answer questions about a user's records. */
export const DEFAULT_ASSISTANT_MODEL = "google/gemini-3-flash-preview";

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
