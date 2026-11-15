// POST { accountId, documentIds } -> { read, needsReview }
//
// Reads uploaded documents with the three-step reader (fast model, recheck, settle) through
// OpenRouter, runs the arithmetic checks, and writes the results to `documents` and
// `ledger_records`. A COR fills in the account's tax profile instead.
//
// Answers 503 { code: "not_configured" } until OPENROUTER_API_KEY and the R2 secrets are set.
import { adminClient, authorize } from "../_lib/clients.ts";
import { HttpError, json, requireEnv, serve } from "../_lib/http.ts";
import { chat, documentPart } from "../_lib/openrouter.ts";
import { signedDownloadUrl } from "../_lib/r2.ts";
import { DEFAULT_READER_MODELS } from "../_shared/parser/models.ts";
import { readWithEscalation, type ReaderStep } from "../_shared/parser/pipeline.ts";
import { EXTRACTION_SYSTEM_PROMPT, REGISTRATION_SYSTEM_PROMPT } from "../_shared/parser/prompts.ts";
import {
  EXTRACTION_JSON_SCHEMA,
  type ExtractedDocument,
  parseExtraction,
} from "../_shared/parser/schema.ts";
import { PRICING } from "../_shared/uploads/rules.ts";

const centavos = (pesos: number | null) => Math.round((pesos ?? 0) * 100);

function modelFor(step: ReaderStep): string {
  const override = Deno.env.get(`OPENROUTER_MODEL_${step.toUpperCase()}`);
  return override || DEFAULT_READER_MODELS[step];
}

/** Turns one reading into ledger rows (in centavos). */
function toLedgerRows(doc: ExtractedDocument, accountId: string, documentId: string) {
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
  const { accountId, documentIds } = (await request.json()) as {
    accountId: string;
    documentIds: string[];
  };
  if (!accountId || !Array.isArray(documentIds) || documentIds.length === 0) {
    throw new HttpError(400, "bad_request", "Send an account and the documents to read");
  }
  await authorize(request, accountId);
  requireEnv("OPENROUTER_API_KEY");

  const admin = adminClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, trial_used")
    .eq("id", accountId)
    .single();
  const { data: documents, error } = await admin
    .from("documents")
    .select("id, kind, file_name, mime_type, storage_key, status")
    .eq("account_id", accountId)
    .in("id", documentIds);
  if (error) throw error;

  // Pay before any reading. MISSING: payments. Until checkout exists, only the one free trial
  // (10 documents) is allowed, unless ALLOW_UNPAID_RUNS=true is set for testing.
  const trial = !account?.trial_used && documents.length <= PRICING.trialDocuments;
  if (!trial && Deno.env.get("ALLOW_UNPAID_RUNS") !== "true") {
    throw new HttpError(402, "payment_required", "Pay for this run before it is read");
  }
  if (trial) await admin.from("accounts").update({ trial_used: true }).eq("id", accountId);

  let read = 0;
  let needsReview = 0;
  for (const document of documents) {
    await admin.from("documents").update({ status: "reading" }).eq("id", document.id);
    const file = await fetch(await signedDownloadUrl(document.storage_key));
    if (!file.ok) {
      await admin
        .from("documents")
        .update({ status: "needs_review", flags: ["not_a_document"] })
        .eq("id", document.id);
      needsReview++;
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
      });
      const cor = JSON.parse(reply.replace(/^```json|```$/g, "").trim());
      // MISSING: show these fields to the user to confirm (and pick the income tax option)
      // before saving; today they are saved directly.
      await admin
        .from("accounts")
        .update({
          tin: cor.tin,
          registered_name: cor.registeredName,
          trade_name: cor.tradeName,
          rdo_code: cor.rdoCode,
          registered_address: cor.registeredAddress,
          line_of_business: cor.lineOfBusiness,
          registration_date: cor.registrationDate,
          vat_registered: cor.vatRegistered === true,
          income_tax_option: cor.eightPercentIndicated ? "eight_percent" : "graduated_osd",
          cor_document_id: document.id,
        })
        .eq("id", accountId);
      await admin
        .from("documents")
        .update({ status: "accepted", reader_path: ["settle"], extracted: cor })
        .eq("id", document.id);
      read++;
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
    if (rows.length) await admin.from("ledger_records").insert(rows);
    // MISSING: log every model call's tokens and cost to an ai_spend table for the spend guard.
    if (result.status === "accepted") read++;
    else needsReview++;
  }
  return json({ read, needsReview });
});
