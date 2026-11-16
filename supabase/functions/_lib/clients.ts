// Supabase clients for edge functions.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { HttpError } from "./http.ts";

/** Acts as the signed-in user: row-level security applies. */
export function userClient(request: Request): SupabaseClient {
  const authorization = request.headers.get("Authorization");
  if (!authorization) throw new HttpError(401, "unauthorized", "Sign in first");
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
}

/** Bypasses row-level security. Use only after checking the user's access yourself. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
}

/** The signed-in user's id, and a check that they may use `accountId`. */
export async function authorize(request: Request, accountId: string) {
  const client = userClient(request);
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new HttpError(401, "unauthorized", "Sign in first");
  const { data: allowed, error } = await client.rpc("has_account_access", { target: accountId });
  if (error) throw error;
  if (!allowed) throw new HttpError(403, "forbidden", "You do not have access to this account");
  return { userId: auth.user.id, client };
}

/**
 * Adds "a professional opened this" to the account owner's activity log. The database ignores
 * the owner's own visits and repeats within ten minutes. Never fails the request: the log must
 * not stop someone from working.
 */
export async function logAccess(
  client: SupabaseClient,
  accountId: string,
  activity: "opened_document" | "asked_assistant",
  target?: string,
): Promise<void> {
  try {
    const { error } = await client.rpc("log_access_event", {
      account: accountId,
      activity,
      target: target ?? null,
    });
    if (error) console.warn(`Activity log: ${error.message}`);
  } catch (error) {
    console.warn(`Activity log: ${String(error)}`);
  }
}
