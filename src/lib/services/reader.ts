/**
 * Asks the `read-documents` edge function to read uploaded documents with AI (through
 * OpenRouter). The function checks payment, runs the three-step reader and writes the ledger.
 *
 * MISSING: deploy `read-documents` and set OPENROUTER_API_KEY (see docs/MISSING_PIECES.md).
 */

import { callFunction, type FunctionResult } from "./functions";

export interface ReadSummary {
  read: number;
  needsReview: number;
}

export function startReading(
  accountId: string,
  documentIds: string[],
): Promise<FunctionResult<ReadSummary>> {
  return callFunction("read-documents", { accountId, documentIds });
}
