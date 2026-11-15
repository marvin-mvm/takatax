// The daily AI spending cap. Every model call is logged to `ai_spend` (see openrouter.ts); before
// reading documents or answering a question, functions check today's total (Manila day) against
// AI_DAILY_CAP_USD (default 20). Over the cap, they answer 429 and nothing is spent.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { HttpError } from "./http.ts";

const DEFAULT_CAP_USD = 20;

export async function assertUnderDailyCap(admin: SupabaseClient): Promise<void> {
  const cap = Number(Deno.env.get("AI_DAILY_CAP_USD") ?? DEFAULT_CAP_USD);
  const { data, error } = await admin.rpc("ai_spend_today");
  if (error) throw error;
  if (Number(data ?? 0) >= cap) {
    throw new HttpError(
      429,
      "spend_cap",
      "Takatax has reached today's reading limit. Please try again tomorrow.",
    );
  }
}
