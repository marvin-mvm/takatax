// POST { messages: [{ role, content }], scope: { accountId, year, fromMonth, toMonth, taxType } }
// -> { reply }
//
// Answers questions about the user's own records. The figures come from the database here,
// never from the browser, and the model only explains them; it does not give tax advice. A
// professional's questions about a client go in the client's activity log (that they asked,
// not what).
// Answers 429 over the daily AI spending cap, and 503 { code: "not_configured" } until
// OPENROUTER_API_KEY is set.
import { adminClient, authorize, logAccess } from "../_lib/clients.ts";
import { HttpError, json, requireEnv, serve } from "../_lib/http.ts";
import { chat } from "../_lib/openrouter.ts";
import { assertUnderDailyCap } from "../_lib/spend.ts";
import { DEFAULT_ASSISTANT_MODEL } from "../_shared/parser/models.ts";

const SYSTEM = `You are the Takatax records assistant for a Filipino small business owner.
Answer only from the figures provided. Use plain, friendly words and peso amounts with commas.
If the figures cannot answer the question, say so. You compute and explain; you do not give tax
advice, and you remind the user to check with a bookkeeper or CPA before filing when it matters.`;

interface Scope {
  accountId: string;
  year: number;
  fromMonth: number;
  toMonth: number;
  taxType: string;
}

serve(async (request) => {
  const { messages, scope } = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    scope: Scope;
  };
  if (!scope?.accountId || !Array.isArray(messages) || messages.length === 0) {
    throw new HttpError(400, "bad_request", "Send a question and its scope");
  }
  const { client } = await authorize(request, scope.accountId);
  requireEnv("OPENROUTER_API_KEY");
  await logAccess(client, scope.accountId, "asked_assistant");
  const admin = adminClient();
  await assertUnderDailyCap(admin);

  const from = `${scope.year}-${String(scope.fromMonth).padStart(2, "0")}-01`;
  const to = `${scope.year}-${String(scope.toMonth).padStart(2, "0")}-31`;
  const { data: records, error } = await client
    .from("ledger_records")
    .select(
      "kind, record_date, counterparty, category, amount_centavos, vat_centavos, tax_withheld_centavos",
    )
    .eq("account_id", scope.accountId)
    .gte("record_date", from)
    .lte("record_date", to);
  if (error) throw error;

  // A compact, numbers-only summary keeps the prompt small and the model on the facts.
  const byMonth: Record<string, { sales: number; expenses: number; withheld: number }> = {};
  const byCategory: Record<string, number> = {};
  for (const r of records ?? []) {
    const month = String(r.record_date).slice(0, 7);
    byMonth[month] ??= { sales: 0, expenses: 0, withheld: 0 };
    const pesos = r.amount_centavos / 100;
    if (r.kind === "sale") byMonth[month].sales += pesos;
    if (r.kind === "expense") {
      byMonth[month].expenses += pesos;
      byCategory[r.category ?? "other"] = (byCategory[r.category ?? "other"] ?? 0) + pesos;
    }
    if (r.kind === "withholding") byMonth[month].withheld += r.tax_withheld_centavos / 100;
  }
  const facts = JSON.stringify({
    period: { from, to },
    taxType: scope.taxType,
    byMonth,
    expensesByCategory: byCategory,
  });

  const reply = await chat({
    model: Deno.env.get("OPENROUTER_MODEL_ASSISTANT") || DEFAULT_ASSISTANT_MODEL,
    messages: [
      { role: "system", content: `${SYSTEM}\n\nThe user's figures (pesos):\n${facts}` },
      ...messages.slice(-10),
    ],
    maxTokens: 800,
    spend: { admin, functionName: "assistant-chat", accountId: scope.accountId },
  });
  return json({ reply });
});
