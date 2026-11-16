// Which reader reads documents, and how the Supabase reader hands work to its next step.
//
// READER (edge function secret) is the switch:
//   READER=supabase  the Supabase reader (read-step) reads, in small steps inside Supabase.
//   READER=trigger   the Trigger.dev job `read-run` reads (the default when READER is not set).
// Changing the secret takes effect on the next run; no redeploy is needed.
import { HttpError, requireEnv } from "./http.ts";

export type ReaderBackend = "supabase" | "trigger";

export function readerBackend(): ReaderBackend {
  return (Deno.env.get("READER") ?? "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "trigger";
}

/** What read-step reads: a whole run, or documents read again. */
export interface StepPayload {
  runId?: string;
  accountId?: string;
  documentIds?: string[];
  /** Retries of the current step after an error. */
  attempt?: number;
}

/** Runs `work` after the response is sent (Supabase Edge Runtime), or waits for it. */
export function inBackground(work: Promise<unknown>): Promise<unknown> | undefined {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  if (runtime) {
    runtime.waitUntil(work);
    return undefined;
  }
  return work;
}

/**
 * Starts the next read-step. read-step answers at once and does its work in the background, so
 * this only waits for that answer.
 */
export async function startReadStep(payload: StepPayload): Promise<void> {
  const env = requireEnv("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/read-step`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`read-step ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
}

/** read-step is called only by these functions, with the service role key. */
export function assertInternalCall(request: Request): void {
  const { SUPABASE_SERVICE_ROLE_KEY } = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (request.headers.get("Authorization") !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    throw new HttpError(401, "unauthorized", "Not allowed");
  }
}
