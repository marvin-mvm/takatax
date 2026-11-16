/** Supabase with the service role: the job writes documents, ledger rows and progress. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { env } from "./env";

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
