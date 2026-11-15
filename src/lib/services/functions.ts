/**
 * Calls a Supabase Edge Function and turns "not deployed", "key not set" and "no network" into
 * a single `not_connected` answer, so every screen can show the same friendly placeholder.
 */

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type FunctionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: "not_connected" | "error";
      message: string;
      /** The HTTP status and the function's own error code, when it answered. */
      status?: number | undefined;
      code?: string | undefined;
    };

export async function callFunction<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body: body as object });
    if (!error) return { ok: true, data: data as T };
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response | undefined;
      const status = response?.status ?? 0;
      let code: string | undefined;
      let message = `${name} failed (${status}).`;
      try {
        const body = (await response?.clone().json()) as { code?: string; error?: string };
        code = body?.code;
        if (body?.error) message = body.error;
      } catch {
        // Not JSON: keep the generic message.
      }
      // 404: the function is not deployed. 503: deployed, but a key is missing.
      if (status === 404 || status === 503) {
        return {
          ok: false,
          reason: "not_connected",
          message: `${name} is not connected yet.`,
          status,
          code,
        };
      }
      return { ok: false, reason: "error", message, status, code };
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      return { ok: false, reason: "not_connected", message: `${name} could not be reached.` };
    }
    return { ok: false, reason: "error", message: String(error) };
  } catch (error) {
    return { ok: false, reason: "not_connected", message: String(error) };
  }
}
