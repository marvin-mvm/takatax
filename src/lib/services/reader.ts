/**
 * Asks the `read-documents` edge function to start reading uploaded documents. It checks the
 * run is paid, then starts the Trigger.dev job `read-run`, which reads every page with the AI
 * (through OpenRouter) and writes the ledger. Progress is in the run's row.
 *
 * MISSING: the Trigger.dev keys and deploy (see docs/MISSING_PIECES.md).
 */

import { callFunction, type FunctionResult } from "./functions";

export interface ReadStarted {
  started: boolean;
  /** Pages the reader will read. Progress is in the run's row (loadRunProgress). */
  pages: number;
}

/**
 * Reads a paid (or free) run's documents, or reads documents again that an earlier run already
 * paid for. Answers 402 `payment_required` while the payment is not confirmed yet.
 */
export function startReading(
  input: { runId: string } | { accountId: string; documentIds: string[] },
): Promise<FunctionResult<ReadStarted>> {
  return callFunction("read-documents", input);
}
