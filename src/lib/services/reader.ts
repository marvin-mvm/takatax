/**
 * Asks the `read-documents` edge function to read uploaded documents with AI (through
 * OpenRouter). The function checks the run is paid, runs the three-step reader and writes the
 * ledger.
 *
 * MISSING: deploy `read-documents` and set OPENROUTER_API_KEY (see docs/MISSING_PIECES.md).
 */

import { callFunction, type FunctionResult } from "./functions";

export interface ReadSummary {
  read: number;
  needsReview: number;
}

/**
 * Reads a paid (or free) run's documents, or reads documents again that an earlier run already
 * paid for. Answers 402 `payment_required` while the payment is not confirmed yet.
 */
export function startReading(
  input: { runId: string } | { accountId: string; documentIds: string[] },
): Promise<FunctionResult<ReadSummary>> {
  return callFunction("read-documents", input);
}
