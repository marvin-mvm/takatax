/**
 * Paying for a run or a Premium month. The `create-checkout` edge function works out the price
 * on the server (free trial, Premium allowance, partner discount), creates the run, and, when
 * there is something to pay, opens a checkout with the payment provider (a merchant of record,
 * still to be chosen). The provider then tells the `payments-webhook` function the payment
 * went through.
 *
 * MISSING: the payment provider (see docs/MISSING_PIECES.md). Without it, free runs (trial and
 * Premium) still work and paid ones answer `not_connected`.
 */

import { callFunction, type FunctionResult } from "./functions";

export interface CheckoutResult {
  /** The run that will read the documents (null for a Premium month). */
  runId: string | null;
  /** True when nothing is owed (free trial or Premium) and reading can start now. */
  free: boolean;
  /** Where to send the browser to pay, when something is owed. */
  checkoutUrl: string | null;
  total: number;
  summary: string;
}

export function checkoutRun(
  accountId: string,
  documentIds: string[],
): Promise<FunctionResult<CheckoutResult>> {
  return callFunction("create-checkout", { purpose: "run", accountId, documentIds });
}

export function checkoutPremiumMonth(accountId: string): Promise<FunctionResult<CheckoutResult>> {
  return callFunction("create-checkout", { purpose: "premium_month", accountId });
}

/** Opens a new checkout for a run whose payment was not finished. */
export function checkoutUnpaidRun(
  accountId: string,
  runId: string,
): Promise<FunctionResult<CheckoutResult>> {
  return callFunction("create-checkout", { purpose: "run", accountId, runId });
}
