/**
 * Environment variables of the Trigger.dev project (Dashboard -> Project -> Environment
 * variables). The reader job needs: OPENROUTER_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Optional: OPENROUTER_MODEL_FAST / _RECHECK / _SETTLE, READER_CONCURRENCY, AI_DAILY_CAP_USD.
 */

export function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    // MISSING: set it in the Trigger.dev dashboard; see docs/MISSING_PIECES.md.
    throw new Error(`Missing environment variable ${name} in the Trigger.dev project`);
  }
  return value;
}

export const optionalEnv = (name: string): string | undefined => process.env[name] || undefined;
