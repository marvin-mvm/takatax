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
  { ok: true; data: T } | { ok: false; reason: "not_connected" | "error"; message: string };

export async function callFunction<T>(name: string, body: unknown): Promise<FunctionResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(name, { body: body as object });
    if (!error) return { ok: true, data: data as T };
    if (error instanceof FunctionsHttpError) {
      const status = (error.context as Response | undefined)?.status ?? 0;
      // 404: the function is not deployed. 503: deployed, but a key is missing.
      if (status === 404 || status === 503) {
        return { ok: false, reason: "not_connected", message: `${name} is not connected yet.` };
      }
      return { ok: false, reason: "error", message: `${name} failed (${status}).` };
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      return { ok: false, reason: "not_connected", message: `${name} could not be reached.` };
    }
    return { ok: false, reason: "error", message: String(error) };
  } catch (error) {
    return { ok: false, reason: "not_connected", message: String(error) };
  }
}
