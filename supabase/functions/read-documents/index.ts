// POST { runId }                    -> start reading a paid (or free) run
// POST { accountId, documentIds }    -> read documents again that a paid run already covered
//   -> { started: true, pages }
//
// Checks the request, then hands the reading to one of two readers, chosen by the READER
// secret (see _lib/reader.ts):
// - READER=trigger (the default): the Trigger.dev job `read-run` (trigger/read-run.ts).
// - READER=supabase: the Supabase reader `read-step`, which reads in small steps inside
//   Supabase. Used while Trigger.dev deployments are not available.
// Either way this function returns at once, and the browser follows progress in
// `runs.pages_read`. Calling it again for a run whose Supabase reading has stalled (no progress
// for a few minutes) starts it again where it stopped.
//
// Answers 402 { code: "payment_required" } while a run is unpaid, 429 over the daily AI spending
// cap, and 503 { code: "not_configured" } until TRIGGER_SECRET_KEY is set (Trigger.dev reader).
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, requireEnv, serve } from "../_lib/http.ts";
import { readerBackend, startReadStep } from "../_lib/reader.ts";
import { assertUnderDailyCap } from "../_lib/spend.ts";

const MB = 1024 * 1024;
/** A Supabase reading with no progress for this long is started again. */
const STALLED_MS = 3 * 60 * 1000;

/** A bigger machine when a run holds large PDFs (they are loaded whole to be split). */
function machineFor(largestBytes: number): string {
  if (largestBytes > 100 * MB) return "large-1x"; // 8 GB
  if (largestBytes > 25 * MB) return "medium-1x"; // 2 GB
  return "small-1x"; // 0.5 GB
}

serve(async (request) => {
  const body = (await request.json()) as {
    runId?: string;
    accountId?: string;
    documentIds?: string[];
  };
  const admin = adminClient();
  const backend = readerBackend();
  // The Supabase reader also picks up documents it left half read.
  const pending =
    backend === "supabase" ? ["waiting_for_reader", "reading"] : ["waiting_for_reader"];
  const unpaidAllowed = Deno.env.get("ALLOW_UNPAID_RUNS") === "true"; // testing only

  let accountId: string;
  let documents: { bytes: number; page_count: number }[];
  let payload: Record<string, unknown>;
  let idempotencyKey: string | undefined;

  if (body.runId) {
    const { data: run, error } = await admin
      .from("runs")
      .select("id, account_id, status, page_count")
      .eq("id", body.runId)
      .single();
    if (error || !run) throw new HttpError(404, "not_found", "Run not found");
    await authorize(request, run.account_id);
    if (run.status === "awaiting_payment" && !unpaidAllowed) {
      throw new HttpError(402, "payment_required", "Pay for this run before it is read");
    }
    accountId = run.account_id;
    const { data, error: docsError } = await admin
      .from("documents")
      .select("bytes, page_count")
      .eq("run_id", run.id)
      .in("status", pending);
    if (docsError) throw docsError;
    documents = data ?? [];
    if (documents.length === 0) {
      // Already started or read (a reload, a double click): nothing new to start.
      return json({ started: true, pages: run.page_count });
    }
    payload = { runId: run.id };
    // The same run is never started twice at the same time.
    idempotencyKey = `read-run-${run.id}-${documents.length}`;
  } else {
    if (!body.accountId || !Array.isArray(body.documentIds) || body.documentIds.length === 0) {
      throw new HttpError(400, "bad_request", "Send a run, or an account and documents");
    }
    accountId = body.accountId;
    await authorize(request, accountId);
    const { data, error } = await admin
      .from("documents")
      .select("bytes, page_count, runs(status)")
      .eq("account_id", accountId)
      .in("id", body.documentIds);
    if (error) throw error;
    const unpaid = (data ?? []).some((d) => {
      const run = d.runs as unknown as { status: string } | null;
      return !run || run.status === "awaiting_payment";
    });
    if (unpaid && !unpaidAllowed) {
      throw new HttpError(402, "payment_required", "Pay for these documents before they are read");
    }
    documents = data ?? [];
    payload = { accountId, documentIds: body.documentIds };
  }

  await assertUnderDailyCap(admin);
  const pages = documents.reduce((sum, d) => sum + (d.page_count ?? 1), 0);

  if (backend === "supabase") {
    const start = body.runId
      ? await claimRun(admin, body.runId)
      : await claimDocuments(admin, accountId, body.documentIds ?? []);
    if (start) await startReadStep(payload);
    return json({ started: true, pages });
  }

  const { TRIGGER_SECRET_KEY } = requireEnv("TRIGGER_SECRET_KEY");
  const api = Deno.env.get("TRIGGER_API_URL") ?? "https://api.trigger.dev";
  const largest = documents.reduce((max, d) => Math.max(max, d.bytes), 0);
  const response = await fetch(`${api}/api/v1/tasks/read-run/trigger`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TRIGGER_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload,
      options: {
        machine: machineFor(largest),
        tags: [`account_${accountId}`],
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    }),
  });
  if (!response.ok) {
    console.error("Trigger.dev", response.status, (await response.text()).slice(0, 300));
    throw new HttpError(502, "reader_unavailable", "The reader could not be started");
  }
  const started = (await response.json()) as { id?: string };
  if (body.runId && started.id) {
    await admin.from("runs").update({ trigger_run_id: started.id }).eq("id", body.runId);
  }
  return json({ started: true, pages });
});

type Admin = ReturnType<typeof adminClient>;

/** True when no document in `rows` has made progress for STALLED_MS (or there are none). */
function stalled(rows: { updated_at: string | null }[] | null): boolean {
  const latest = Math.max(0, ...(rows ?? []).map((r) => Date.parse(r.updated_at ?? "") || 0));
  return Date.now() - latest > STALLED_MS;
}

/**
 * Marks the run as being read. True when the Supabase reader should be started: the run was not
 * being read yet, or its reading has stalled.
 */
async function claimRun(admin: Admin, runId: string): Promise<boolean> {
  const { data: claimed, error } = await admin
    .from("runs")
    .update({ status: "reading" })
    .eq("id", runId)
    .neq("status", "reading")
    .select("id");
  if (error) throw error;
  if ((claimed ?? []).length > 0) return true;
  const { data: latest } = await admin
    .from("documents")
    .select("updated_at")
    .eq("run_id", runId)
    .in("status", ["reading", "waiting_for_reader"])
    .order("updated_at", { ascending: false })
    .limit(1);
  return stalled(latest);
}

/** Queues documents to be read again. False while some of them are already being read. */
async function claimDocuments(admin: Admin, accountId: string, ids: string[]): Promise<boolean> {
  const { data: reading } = await admin
    .from("documents")
    .select("updated_at")
    .eq("account_id", accountId)
    .in("id", ids)
    .eq("status", "reading");
  if ((reading ?? []).length > 0 && !stalled(reading)) return false;
  const { error } = await admin
    .from("documents")
    .update({ status: "waiting_for_reader", updated_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .in("id", ids)
    .neq("status", "reading");
  if (error) throw error;
  return true;
}
