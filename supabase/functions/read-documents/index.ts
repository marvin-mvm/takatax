// POST { runId }                    -> reads a paid (or free) run's documents
// POST { accountId, documentIds }    -> reads documents again that a paid run already covered
//   -> { read, needsReview }
//
// Reads uploaded documents with the three-step reader (fast model, recheck, settle) through
// OpenRouter, runs the arithmetic checks, and writes the results to `documents` and
// `ledger_records`. A COR is saved on its document for the owner to check and confirm
// (database function confirm_cor); it does not change the account until then.
//
// Answers 402 { code: "payment_required" } while a run is unpaid, 429 over the daily AI spending
// cap, and 503 { code: "not_configured" } until OPENROUTER_API_KEY and the R2 secrets are set.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, requireEnv, serve } from "../_lib/http.ts";
import { chat, documentPart } from "../_lib/openrouter.ts";
import { signedDownloadUrl } from "../_lib/r2.ts";
import { assertUnderDailyCap } from "../_lib/spend.ts";
import { DEFAULT_READER_MODELS } from "../_shared/parser/models.ts";
import { readWithEscalation, type ReaderStep } from "../_shared/parser/pipeline.ts";
import { EXTRACTION_SYSTEM_PROMPT, REGISTRATION_SYSTEM_PROMPT } from "../_shared/parser/prompts.ts";
import {
  EXTRACTION_JSON_SCHEMA,
  type ExtractedDocument,
  parseExtraction,
} from "../_shared/parser/schema.ts";

const centavos = (pesos: number | null) => Math.round((pesos ?? 0) * 100);

function modelFor(step: ReaderStep): string {
  const override = Deno.env.get(`OPENROUTER_MODEL_${step.toUpperCase()}`);
  return override || DEFAULT_READER_MODELS[step];
}

/** Turns one reading into ledger rows (in centavos). */
function toLedgerRows(
  doc: ExtractedDocument,
  accountId: string,
  documentId: string,
): Record<string, unknown>[] {
  const base = {
    account_id: accountId,
    document_id: documentId,
    record_date: doc.date ?? doc.periodTo,
    counterparty: (doc.kind === "sales_invoice" ? doc.recipientName : doc.issuerName) ?? "",
    counterparty_tin: doc.kind === "sales_invoice" ? doc.recipientTin : doc.issuerTin,
  };
  if (!base.record_date) return [];
  switch (doc.kind) {
    case "sales_invoice":
      return [
        {
          ...base,
          kind: "sale",
          description: doc.documentNumber ?? "Sale",
          amount_centavos: centavos(doc.totalAmount),
          vat_centavos: centavos(doc.vatAmount),
        },
      ];
    case "expense_receipt":
      return [
        {
          ...base,
          kind: "expense",
          description: doc.issuerName ?? "Expense",
          category: doc.expenseCategory,
          amount_centavos: centavos(doc.totalAmount),
          vat_centavos: centavos(doc.vatAmount),
        },
      ];
    case "form_2307":
      return [
        {
          ...base,
          kind: "withholding",
          description: `Form 2307 ${doc.periodFrom ?? ""} to ${doc.periodTo ?? ""}`.trim(),
          amount_centavos: centavos(doc.incomePayment),
          tax_withheld_centavos: centavos(doc.taxWithheld),
        },
      ];
    default:
      return [];
  }
}

serve(async (request) => {
  const body = (await request.json()) as {
    runId?: string;
    accountId?: string;
    documentIds?: string[];
  };
  const admin = adminClient();
  const unpaidAllowed = Deno.env.get("ALLOW_UNPAID_RUNS") === "true"; // testing only

  let accountId: string;
  let documents: {
    id: string;
    kind: string;
    file_name: string;
    mime_type: string;
    storage_key: string;
    status: string;
  }[];
  let runId: string | null = null;

  if (body.runId) {
    // A new run: it must be paid (or free), and each of its documents is read once.
    const { data: run, error } = await admin
      .from("runs")
      .select("id, account_id, status")
      .eq("id", body.runId)
      .single();
    if (error || !run) throw new HttpError(404, "not_found", "Run not found");
    await authorize(request, run.account_id);
    if (run.status === "awaiting_payment" && !unpaidAllowed) {
      throw new HttpError(402, "payment_required", "Pay for this run before it is read");
    }
    accountId = run.account_id;
    runId = run.id;
    requireEnv("OPENROUTER_API_KEY");
    await assertUnderDailyCap(admin);
    // Claim the run's waiting documents in one update, so a second call (a reload, a double
    // click) cannot read the same documents twice.
    const { data, error: docsError } = await admin
      .from("documents")
      .update({ status: "reading" })
      .eq("run_id", run.id)
      .eq("status", "waiting_for_reader")
      .select("id, kind, file_name, mime_type, storage_key, status");
    if (docsError) throw docsError;
    documents = data ?? [];
    if (documents.length === 0) {
      // Already read (for example the page was reloaded): report what the run produced.
      const { data: done } = await admin.from("documents").select("status").eq("run_id", run.id);
      return json({
        read: (done ?? []).filter((d) => d.status === "accepted").length,
        needsReview: (done ?? []).filter((d) => d.status === "needs_review").length,
      });
    }
  } else {
    // "Read again": only documents that a paid run already covered.
    if (!body.accountId || !Array.isArray(body.documentIds) || body.documentIds.length === 0) {
      throw new HttpError(400, "bad_request", "Send a run, or an account and documents");
    }
    accountId = body.accountId;
    await authorize(request, accountId);
    const { data, error } = await admin
      .from("documents")
      .select("id, kind, file_name, mime_type, storage_key, status, runs(status)")
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
  }

  requireEnv("OPENROUTER_API_KEY");
  await assertUnderDailyCap(admin);
  if (runId) await admin.from("runs").update({ status: "reading" }).eq("id", runId);
  // If something fails part-way, the documents not read yet go back to waiting, so the paid
  // run can be read again later.
  const pending = new Set(documents.map((d) => d.id));
  const spend = (documentId: string, step: string) => ({
    admin,
    functionName: "read-documents",
    accountId,
    documentId,
    step,
  });

  let read = 0;
  let needsReview = 0;
  try {
    for (const document of documents) {
      await admin.from("documents").update({ status: "reading" }).eq("id", document.id);
      const file = await fetch(await signedDownloadUrl(document.storage_key));
      if (!file.ok) {
        await admin
          .from("documents")
          .update({ status: "needs_review", flags: ["not_a_document"] })
          .eq("id", document.id);
        needsReview++;
        pending.delete(document.id);
        continue;
      }
      const part = documentPart(
        new Uint8Array(await file.arrayBuffer()),
        document.mime_type,
        document.file_name,
      );

      if (document.kind === "cor") {
        const reply = await chat({
          model: modelFor("settle"),
          messages: [
            { role: "system", content: REGISTRATION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [part, { type: "text", text: "Read this COR. Reply with JSON only." }],
            },
          ],
          spend: spend(document.id, "settle"),
        });
        const cor = JSON.parse(reply.replace(/^```json|```$/g, "").trim());
        // Saved on the document only: the owner checks the fields and picks the income tax
        // option on My COR, and confirm_cor() then sets the account's tax types and deadlines.
        await admin
          .from("documents")
          .update({ status: "needs_review", reader_path: ["settle"], extracted: cor })
          .eq("id", document.id);
        needsReview++;
        pending.delete(document.id);
        continue;
      }

      const readWith = (step: ReaderStep) => async () => {
        const reply = await chat({
          model: modelFor(step),
          messages: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [part, { type: "text", text: "Read every document in this file." }],
            },
          ],
          schema: { name: "documents", schema: EXTRACTION_JSON_SCHEMA },
          spend: spend(document.id, step),
        });
        return parseExtraction(JSON.parse(reply));
      };
      const result = await readWithEscalation({
        fast: readWith("fast"),
        recheck: readWith("recheck"),
        settle: readWith("settle"),
      });

      const first = result.documents[0];
      await admin
        .from("documents")
        .update({
          status: result.status,
          reader_path: result.path,
          flags: result.flags,
          kind: first?.kind ?? "unknown",
          extracted: result.documents,
        })
        .eq("id", document.id);
      const rows = result.documents.flatMap((doc) => toLedgerRows(doc, accountId, document.id));
      // Reading again replaces what the document produced before, instead of adding to it.
      await admin.from("ledger_records").delete().eq("document_id", document.id);
      if (rows.length) await admin.from("ledger_records").insert(rows);
      if (result.status === "accepted") read++;
      else needsReview++;
      pending.delete(document.id);
    }
  } catch (error) {
    if (pending.size) {
      await admin
        .from("documents")
        .update({ status: "waiting_for_reader" })
        .in("id", [...pending]);
    }
    if (runId) await admin.from("runs").update({ status: "paid" }).eq("id", runId);
    throw error;
  }
  if (runId) {
    await admin
      .from("runs")
      .update({ status: needsReview > 0 ? "review" : "complete" })
      .eq("id", runId);
  }
  return json({ read, needsReview });
});
