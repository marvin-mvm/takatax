// The Supabase reader: reads documents in small steps, used while READER=supabase (see
// _lib/reader.ts). Called only by read-documents and by itself, with the service role key
// (JWT check off in supabase/config.toml; assertInternalCall checks the key instead).
//
// POST { runId } | { accountId, documentIds }  -> 202 at once; the step runs in the background.
//
// Each step reads one photo, a COR, or a few groups of PDF pages (READER_GROUPS_PER_STEP,
// default 3, of up to 5 pages each), saves what it has, then starts the next step. So every
// step stays far inside the edge function limits (150 to 400 seconds, 256 MB), however long the
// run. Reading is the same as the Trigger.dev job (trigger/read-run.ts): the shared plan
// (_shared/parser/plan.ts), the same prompts and the fast -> recheck -> settle escalation.
//
// While a PDF is half read, its results so far sit in documents.extracted as
// { "reading": { next, pagesDone, results, flags } } and are replaced by the final reading.
// PDFs over READER_MAX_MB (default 25) are too big to load here: they stay "waiting to be read"
// for the Trigger.dev reader. Errors are retried twice; after that the document goes back to
// "waiting to be read" and the run to "paid", so starting it again resumes.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { DEFAULT_READER_MODELS } from "../_shared/parser/models.ts";
import { combineReadings } from "../_shared/parser/pages.ts";
import {
  readWithEscalation,
  type ReadResult,
  type ReaderStep,
} from "../_shared/parser/pipeline.ts";
import {
  COR_PAGES,
  extractionRequest,
  isPdf,
  parseJsonReply,
  planReading,
  type ReadChunk,
  REGISTRATION_REQUEST,
} from "../_shared/parser/plan.ts";
import { EXTRACTION_SYSTEM_PROMPT, REGISTRATION_SYSTEM_PROMPT } from "../_shared/parser/prompts.ts";
import { EXTRACTION_JSON_SCHEMA, parseExtraction } from "../_shared/parser/schema.ts";
import { toLedgerRows } from "../_shared/parser/ledger.ts";
import type { CheckFlag } from "../_shared/parser/checks.ts";
import { adminClient } from "../_lib/clients.ts";
import { json, serve } from "../_lib/http.ts";
import { chat, type ContentPart, documentPart } from "../_lib/openrouter.ts";
import { extractPages, loadPdf } from "../_lib/pdf.ts";
import { getObject } from "../_lib/r2.ts";
import {
  assertInternalCall,
  inBackground,
  startReadStep,
  type StepPayload,
} from "../_lib/reader.ts";

const MB = 1024 * 1024;
const MAX_BYTES = Number(Deno.env.get("READER_MAX_MB") ?? 25) * MB;
const GROUPS_PER_STEP = Math.max(Number(Deno.env.get("READER_GROUPS_PER_STEP") ?? 3), 1);
const CALL_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const FUNCTION_NAME = "read-step";

interface DocumentRow {
  id: string;
  account_id: string;
  run_id: string | null;
  kind: string;
  file_name: string;
  mime_type: string;
  bytes: number;
  page_count: number;
  storage_key: string;
  status: string;
  extracted: unknown;
}

/** A half-read PDF, kept in documents.extracted between steps. */
interface Progress {
  next: number;
  pagesDone: number;
  results: ReadResult[];
}

const DOCUMENT_COLUMNS =
  "id, account_id, run_id, kind, file_name, mime_type, bytes, page_count, storage_key, status, extracted";
const FINISHED = ["accepted", "needs_review", "rejected"];

function modelFor(step: ReaderStep): string {
  return Deno.env.get(`OPENROUTER_MODEL_${step.toUpperCase()}`) ?? DEFAULT_READER_MODELS[step];
}

function progressOf(document: DocumentRow): Progress {
  const saved = (document.extracted as { reading?: Progress } | null)?.reading;
  if (document.status === "reading" && saved && Array.isArray(saved.results)) return saved;
  return { next: 0, pagesDone: 0, results: [] };
}

serve(async (request) => {
  assertInternalCall(request);
  const payload = (await request.json()) as StepPayload;
  const work = step(payload).catch((error) => console.error("read-step failed", error));
  const waited = inBackground(work);
  if (waited) await waited;
  return json({ accepted: true }, 202);
});

/** One step: read the next part of the next document, save it, start the next step. */
async function step(payload: StepPayload): Promise<void> {
  const admin = adminClient();

  // The daily spending cap: stop before spending more, and leave the rest waiting.
  const cap = Number(Deno.env.get("AI_DAILY_CAP_USD") ?? 20);
  const { data: spent } = await admin.rpc("ai_spend_today");
  if (Number(spent ?? 0) >= cap) {
    console.warn("Daily AI spending cap reached; stopping", { spent, cap });
    await pause(admin, payload);
    return;
  }

  const document = await nextDocument(admin, payload);
  if (!document) {
    await finish(admin, payload);
    return;
  }

  try {
    await readPart(admin, document);
    await reportProgress(admin, payload);
  } catch (error) {
    const attempt = (payload.attempt ?? 0) + 1;
    console.error(`read-step: ${document.id} failed (attempt ${attempt})`, error);
    if (attempt >= MAX_ATTEMPTS) {
      await admin
        .from("documents")
        .update({
          status: "waiting_for_reader",
          extracted: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);
      await pause(admin, payload);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
    await startReadStep({ ...payload, attempt });
    return;
  }
  await startReadStep({ ...payload, attempt: 0 });
}

/** The document being read, or the next one waiting (oldest first), small enough to load. */
async function nextDocument(
  admin: SupabaseClient,
  payload: StepPayload,
): Promise<DocumentRow | null> {
  let query = admin
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .in("status", ["reading", "waiting_for_reader"])
    .lte("bytes", MAX_BYTES);
  if (payload.runId) query = query.eq("run_id", payload.runId);
  else if (payload.accountId && payload.documentIds?.length) {
    query = query.eq("account_id", payload.accountId).in("id", payload.documentIds);
  } else return null;
  // A document already being read goes first, so it is finished before the next is started.
  const { data, error } = await query
    .order("status", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as DocumentRow | undefined) ?? null;
}

/** Reads the next part of a document and saves it (the whole document when it is done). */
async function readPart(admin: SupabaseClient, document: DocumentRow): Promise<void> {
  const now = () => new Date().toISOString();
  const progress = progressOf(document);
  if (document.status !== "reading") {
    await admin
      .from("documents")
      .update({ status: "reading", extracted: { reading: progress }, updated_at: now() })
      .eq("id", document.id);
  }
  const spend = (step: string) => ({
    admin,
    functionName: FUNCTION_NAME,
    accountId: document.account_id,
    documentId: document.id,
    step,
  });
  const bytes = await getObject(document.storage_key);
  const pdf = isPdf(document) ? await loadPdf(bytes) : null;

  // ---- A COR: read once, saved for the owner to check and confirm ---------------------------
  if (document.kind === "cor") {
    const part = pdf
      ? documentPart(
          await extractPages(pdf, { from: 1, to: Math.min(pdf.getPageCount(), COR_PAGES) }),
          "application/pdf",
          document.file_name,
        )
      : documentPart(bytes, document.mime_type, document.file_name);
    const reply = await chat({
      model: modelFor("settle"),
      messages: [
        { role: "system", content: REGISTRATION_SYSTEM_PROMPT },
        { role: "user", content: [part, { type: "text", text: REGISTRATION_REQUEST }] },
      ],
      spend: spend("settle"),
      timeoutMs: CALL_TIMEOUT_MS,
    });
    const { error } = await admin
      .from("documents")
      .update({
        status: "needs_review",
        reader_path: ["settle"],
        extracted: parseJsonReply(reply),
        updated_at: now(),
      })
      .eq("id", document.id);
    if (error) throw error;
    return;
  }

  // ---- The next few chunks: one photo, or groups of PDF pages -------------------------------
  const plan = planReading(document, pdf?.getPageCount() ?? 0);
  const batch = plan.chunks.slice(progress.next, progress.next + GROUPS_PER_STEP);
  const results = await Promise.all(
    batch.map(async (chunk) => {
      const part = pdf
        ? documentPart(await extractPages(pdf, chunk), "application/pdf", document.file_name)
        : documentPart(bytes, document.mime_type, document.file_name);
      return readChunk(part, chunk, spend);
    }),
  );
  const done: Progress = {
    next: progress.next + batch.length,
    pagesDone: progress.pagesDone + batch.reduce((sum, c) => sum + c.pages, 0),
    results: [...progress.results, ...results],
  };

  if (done.next < plan.chunks.length) {
    const { error } = await admin
      .from("documents")
      .update({ extracted: { reading: done }, updated_at: now() })
      .eq("id", document.id);
    if (error) throw error;
    return;
  }

  // ---- Done: the document, then its ledger rows (replacing any from an earlier reading) -----
  const result = combineReadings(done.results, plan.flags as CheckFlag[]);
  const first = result.documents[0];
  const { error: documentError } = await admin
    .from("documents")
    .update({
      status: result.status,
      reader_path: result.path,
      flags: result.flags,
      kind: first?.kind ?? document.kind,
      extracted: result.documents,
      updated_at: now(),
    })
    .eq("id", document.id);
  if (documentError) throw documentError;
  await admin.from("ledger_records").delete().eq("document_id", document.id);
  const rows = result.documents.flatMap((doc) =>
    toLedgerRows(doc, document.account_id, document.id),
  );
  if (rows.length) {
    const { error: ledgerError } = await admin.from("ledger_records").insert(rows);
    if (ledgerError) throw ledgerError;
  }
}

function readChunk(
  part: ContentPart,
  chunk: ReadChunk,
  spend: (step: string) => Parameters<typeof chat>[0]["spend"],
): Promise<ReadResult> {
  const readWith = (step: ReaderStep) => async () => {
    const reply = await chat({
      model: modelFor(step),
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: [part, { type: "text", text: extractionRequest(chunk.label) }] },
      ],
      schema: { name: "documents", schema: EXTRACTION_JSON_SCHEMA },
      spend: spend(step),
      timeoutMs: CALL_TIMEOUT_MS,
    });
    return parseExtraction(JSON.parse(reply));
  };
  return readWithEscalation({
    fast: readWith("fast"),
    recheck: readWith("recheck"),
    settle: readWith("settle"),
  });
}

/** Pages read so far in the run: finished documents, plus the PDF being read. */
async function reportProgress(admin: SupabaseClient, payload: StepPayload): Promise<void> {
  if (!payload.runId) return;
  const { data, error } = await admin
    .from("documents")
    .select("status, page_count, extracted")
    .eq("run_id", payload.runId);
  if (error) throw error;
  let pagesRead = 0;
  for (const row of data ?? []) {
    if (FINISHED.includes(row.status)) pagesRead += row.page_count ?? 1;
    else if (row.status === "reading") {
      pagesRead += (row.extracted as { reading?: Progress } | null)?.reading?.pagesDone ?? 0;
    }
  }
  await admin.from("runs").update({ pages_read: pagesRead }).eq("id", payload.runId);
}

/** Nothing left that this reader can read: close the run. */
async function finish(admin: SupabaseClient, payload: StepPayload): Promise<void> {
  if (!payload.runId) return;
  await reportProgress(admin, payload);
  const { data } = await admin.from("documents").select("status").eq("run_id", payload.runId);
  const statuses = (data ?? []).map((d) => d.status as string);
  // Needs review, or PDFs left waiting because they are too big for this reader.
  const review = statuses.some((s) => s === "needs_review" || s === "waiting_for_reader");
  await admin
    .from("runs")
    .update({ status: review ? "review" : "complete" })
    .eq("id", payload.runId);
  console.log("read-step: run read", { runId: payload.runId, documents: statuses.length });
}

/** Stops for now (spending cap, or repeated errors): the run can be started again later. */
async function pause(admin: SupabaseClient, payload: StepPayload): Promise<void> {
  if (payload.runId) {
    await reportProgress(admin, payload);
    await admin.from("runs").update({ status: "paid" }).eq("id", payload.runId);
  }
}
