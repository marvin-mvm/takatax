// Deno-only helpers shared by the edge functions (not imported by the web app).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** A key or secret this function needs is not set. The app shows this as "not connected yet". */
export class NotConfiguredError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing secrets: ${missing.join(", ")}`);
  }
}

export function requireEnv(...names: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) values[name] = value;
    else missing.push(name);
  }
  if (missing.length) throw new NotConfiguredError(missing);
  return values;
}

/** Wraps a handler with CORS, JSON errors and the not-configured -> 503 mapping. */
export function serve(handler: (request: Request) => Promise<Response>): void {
  Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof NotConfiguredError) {
        return json({ code: "not_configured", missing: error.missing }, 503);
      }
      if (error instanceof HttpError)
        return json({ code: error.code, error: error.message }, error.status);
      console.error(error);
      return json({ code: "internal", error: "Something went wrong" }, 500);
    }
  });
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
