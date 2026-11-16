/**
 * The reader, as a Trigger.dev background job, so long runs and long PDFs never hit the
 * Supabase Edge Function limits (150 to 400 seconds, 256 MB).
 *
 * Started by the `read-documents` edge function once a run is paid (or free):
 *   { runId }                     read every waiting document of the run
 *   { accountId, documentIds }    read documents again ("Read again" on a document)
 *
 * For each document, in order:
 * - a photo is read in one call;
 * - a PDF is split into groups of up to 5 pages (fewer for heavy scanned pages), and the groups
 *   are read side by side, a few at a time; only the pages paid for are read;
 * - a COR is read once and saved for the owner to confirm (confirm_cor in the database).
 * Every page goes to the model itself through OpenRouter (no OCR): fast model first, a second
 * model for anything doubtful, the top model to settle disagreements (readWithEscalation).
 * Results go to `documents` and `ledger_records`, progress to `runs.pages_read`.
 *
 * Safe to retry: documents already read are skipped, and documents left half-way go back to
 * "waiting to be read".
 */

import { AbortTaskRunError, logger, task } from "@trigger.dev/sdk";

import type { CheckFlag } from "../supabase/functions/_shared/parser/checks.ts";
import { toLedgerRows } from "../supabase/functions/_shared/parser/ledger.ts";
import { DEFAULT_READER_MODELS } from "../supabase/functions/_shared/parser/models.ts";
import { combineReadings } from "../supabase/functions/_shared/parser/pages.ts";
import {
  readWithEscalation,
  type ReadResult,
  type ReaderStep,
} from "../supabase/functions/_shared/parser/pipeline.ts";
import {
  EXTRACTION_SYSTEM_PROMPT,
  REGISTRATION_SYSTEM_PROMPT,
} from "../supabase/functions/_shared/parser/prompts.ts";
import {
  EXTRACTION_JSON_SCHEMA,
  parseExtraction,
} from "../supabase/functions/_shared/parser/schema.ts";
import {
  COR_PAGES,
  extractionRequest,
  isPdf as isPdfDocument,
  parseJsonReply,
  planReading,
  REGISTRATION_REQUEST,
} from "../supabase/functions/_shared/parser/plan.ts";
import { optionalEnv } from "./lib/env";
import { chat, documentPart, type ContentPart } from "./lib/openrouter";
import { extractPages, loadPdf } from "./lib/pdf";
import { mapWithConcurrency } from "./lib/pool";
import { getObject } from "./lib/r2";
import { supabaseAdmin } from "./lib/supabase";

export interface ReadRunPayload {
  runId?: string;
  accountId?: string;
  documentIds?: string[];
}

interface DocumentRow {
  id: string;
  account_id: string;
  kind: string;
  file_name: string;
  mime_type: string;
  bytes: number;
  page_count: number;
  storage_key: string;
  status: string;
}

const DOCUMENT_COLUMNS =
  "id, account_id, kind, file_name, mime_type, bytes, page_count, storage_key, status";

function modelFor(step: ReaderStep): string {
  return optionalEnv(`OPENROUTER_MODEL_${step.toUpperCase()}`) ?? DEFAULT_READER_MODELS[step];
}

export const readRun = task({
  id: "read-run",
  // A ceiling, not a target: 250 photos take a few minutes; a 1,000-page PDF longer.
  maxDuration: 3_600,
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2 },
  run: async (payload: ReadRunPayload) => {
    const admin = supabaseAdmin();
    const concurrency = Number(optionalEnv("READER_CONCURRENCY") ?? 4);
    const dailyCap = Number(optionalEnv("AI_DAILY_CAP_USD") ?? 20);

    // ---- Which documents ---------------------------------------------------------------------
    let documents: DocumentRow[];
    if (payload.runId) {
      const { data, error } = await admin
        .from("documents")
        .select(DOCUMENT_COLUMNS)
        .eq("run_id", payload.runId)
        .in("status", ["waiting_for_reader", "reading"])
        .order("created_at");
      if (error) throw error;
      documents = (data ?? []) as DocumentRow[];
      await admin.from("runs").update({ status: "reading" }).eq("id", payload.runId);
    } else if (payload.accountId && payload.documentIds?.length) {
      // Only documents read-documents claimed (waiting, or being read): a finished document is
      // never read again.
      const { data, error } = await admin
        .from("documents")
        .select(DOCUMENT_COLUMNS)
        .eq("account_id", payload.accountId)
        .in("id", payload.documentIds)
        .in("status", ["waiting_for_reader", "reading"]);
      if (error) throw error;
      documents = (data ?? []) as DocumentRow[];
    } else {
      throw new AbortTaskRunError("Send a run, or an account and documents");
    }

    // Pages already read in this run (after a retry), for the progress bar.
    let pagesRead = 0;
    if (payload.runId) {
      const { data: done } = await admin
        .from("documents")
        .select("page_count")
        .eq("run_id", payload.runId)
        .in("status", ["accepted", "needs_review", "rejected"]);
      pagesRead = (done ?? []).reduce((sum, d) => sum + (d.page_count ?? 1), 0);
    }
    const reportProgress = async () => {
      if (payload.runId) {
        await admin.from("runs").update({ pages_read: pagesRead }).eq("id", payload.runId);
      }
    };

    let needsReview = 0;
    for (const document of documents) {
      // The daily spending cap: stop before spending more, and leave the rest waiting.
      const { data: spentToday } = await admin.rpc("ai_spend_today");
      if (Number(spentToday ?? 0) >= dailyCap) {
        logger.warn("Daily AI spending cap reached; stopping", { spentToday, dailyCap });
        if (payload.runId)
          await admin.from("runs").update({ status: "paid" }).eq("id", payload.runId);
        throw new AbortTaskRunError("Daily AI spending cap reached");
      }

      // Pages done in this document, saved as it goes for the document's own progress bar (the
      // same shape as the Supabase reader's: extracted.reading.pagesDone).
      let documentPages = 0;
      const saveDocumentProgress = () =>
        admin
          .from("documents")
          .update({
            extracted: { reading: { pagesDone: documentPages } },
            updated_at: new Date().toISOString(),
          })
          .eq("id", document.id)
          .eq("status", "reading");
      await admin
        .from("documents")
        .update({
          status: "reading",
          extracted: { reading: { pagesDone: 0 } },
          updated_at: new Date().toISOString(),
        })
        .eq("id", document.id);
      try {
        const result = await readDocument(document, concurrency, (pages) => {
          pagesRead += pages;
          documentPages += pages;
          void reportProgress();
          void saveDocumentProgress();
        });
        if (result.status === "needs_review") needsReview++;
      } catch (error) {
        // Put it back so a retry (or a later run) reads it again.
        await admin
          .from("documents")
          .update({ status: "waiting_for_reader" })
          .eq("id", document.id);
        throw error;
      }
      await reportProgress();
    }

    if (payload.runId) {
      await admin
        .from("runs")
        .update({ status: needsReview > 0 ? "review" : "complete", pages_read: pagesRead })
        .eq("id", payload.runId);
    }
    logger.info("Run read", { documents: documents.length, pagesRead, needsReview });
    return { documents: documents.length, pagesRead, needsReview };
  },
});

/** Reads one document and saves what was found. Calls `onPages` as groups of pages finish. */
async function readDocument(
  document: DocumentRow,
  concurrency: number,
  onPages: (pages: number) => void,
): Promise<ReadResult> {
  const admin = supabaseAdmin();
  const spend = (step: string) => ({
    admin,
    accountId: document.account_id,
    documentId: document.id,
    step,
  });
  const bytes = await getObject(document.storage_key);
  const isPdf = isPdfDocument(document);

  // ---- A COR: read once, saved for the owner to check and confirm --------------------------
  if (document.kind === "cor") {
    let part: ContentPart = documentPart(bytes, document.mime_type, document.file_name);
    if (isPdf) {
      // A COR is one or two pages; read only the first two.
      const pdf = await loadPdf(bytes);
      part = documentPart(
        await extractPages(pdf, { from: 1, to: Math.min(pdf.getPageCount(), COR_PAGES) }),
        "application/pdf",
        document.file_name,
      );
    }
    const reply = await chat({
      model: modelFor("settle"),
      messages: [
        { role: "system", content: REGISTRATION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [part, { type: "text", text: REGISTRATION_REQUEST }],
        },
      ],
      spend: spend("settle"),
    });
    const cor = parseJsonReply(reply);
    await admin
      .from("documents")
      .update({ status: "needs_review", reader_path: ["settle"], extracted: cor })
      .eq("id", document.id);
    onPages(document.page_count);
    return { documents: [], path: ["settle"], status: "needs_review", flags: [] };
  }

  // ---- The parts to read: one photo, or groups of PDF pages (see planReading) ------------
  const parts: { part: ContentPart; label: string; pages: number }[] = [];
  let extraFlags: CheckFlag[] = [];
  if (isPdf) {
    const pdf = await loadPdf(bytes);
    const plan = planReading(document, pdf.getPageCount());
    extraFlags = plan.flags;
    for (const chunk of plan.chunks) {
      parts.push({
        part: documentPart(await extractPages(pdf, chunk), "application/pdf", document.file_name),
        label: chunk.label,
        pages: chunk.pages,
      });
    }
  } else {
    const [chunk] = planReading(document).chunks;
    parts.push({
      part: documentPart(bytes, document.mime_type, document.file_name),
      label: chunk?.label ?? "this photo",
      pages: 1,
    });
  }

  const results = await mapWithConcurrency(parts, concurrency, async ({ part, label, pages }) => {
    const readWith = (step: ReaderStep) => async () => {
      const reply = await chat({
        model: modelFor(step),
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [part, { type: "text", text: extractionRequest(label) }],
          },
        ],
        schema: { name: "documents", schema: EXTRACTION_JSON_SCHEMA },
        spend: spend(step),
      });
      return parseExtraction(JSON.parse(reply));
    };
    const reading = await readWithEscalation({
      fast: readWith("fast"),
      recheck: readWith("recheck"),
      settle: readWith("settle"),
    });
    onPages(pages);
    return reading;
  });

  // ---- Save: the document, then its ledger rows (replacing any from an earlier reading) ------
  const result = combineReadings(results, extraFlags);
  const first = result.documents[0];
  const { error: documentError } = await admin
    .from("documents")
    .update({
      status: result.status,
      reader_path: result.path,
      flags: result.flags,
      kind: first?.kind ?? document.kind,
      extracted: result.documents,
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
  return result;
}
