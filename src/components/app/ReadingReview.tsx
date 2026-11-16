/**
 * "Check what was read": the form on a document's page that shows what the AI read from the file
 * (the date, the other party, the TIN, the total, the VAT…), points at the figures it was not
 * sure of, and lets the person correct them and save. Saving puts the corrected figures in the
 * tracker and takes the document off the "Please check" list. When the AI could read nothing,
 * the same form is empty and can be typed in from the photo.
 *
 * The rules (what must be filled in, how a reading becomes ledger rows) are in
 * `@shared/parser/review.ts`; the database function `review_document` saves the result.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import {
  EXPENSE_CATEGORY_LABEL,
  type ExpenseCategory,
  RECORD_KIND_LABEL,
} from "@shared/domain/records.ts";
import { isUnconverted } from "@shared/parser/currency.ts";
import {
  EXPENSE_CATEGORIES,
  REVIEW_KIND_LABEL,
  type ReviewDraft,
  type ReviewField,
  type ReviewKind,
  counterpartyOf,
  draftOf,
  reviewOutcome,
  reviewProblems,
  unsureFields,
} from "@shared/parser/review.ts";
import type { ExtractedDocument } from "@shared/parser/schema.ts";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { NotConnectedError, reviewDocument, todayInManila } from "@/lib/data/repository";
import type { StoredDocument } from "@/lib/data/types";
import { peso } from "@/lib/money";
import { cn } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: ReviewKind[] = ["expense_receipt", "sales_invoice", "form_2307", "unknown"];

const box =
  "min-h-11 w-full rounded-[10px] border bg-tk-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-tk-brand";

interface Entry {
  key: string;
  /** What the AI read, or null for a document typed in by hand. */
  original: ExtractedDocument | null;
  draft: ReviewDraft;
}

/** The words for the other party's boxes, by kind of document. */
const PARTY: Record<Exclude<ReviewKind, "unknown">, { name: string; tin: string }> = {
  expense_receipt: { name: "Supplier", tin: "Supplier's TIN" },
  sales_invoice: { name: "Customer", tin: "Customer's TIN" },
  form_2307: { name: "Payor (who withheld the tax)", tin: "Payor's TIN" },
};

/** What the AI said about the currency, when the amounts were not printed in pesos. */
function currencyNote(original: ExtractedDocument | null): string | null {
  if (!original) return null;
  const amount = (value: number | null) => (value === null ? "" : ` ${value.toFixed(2)}`);
  if (original.converted) {
    const c = original.converted;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(c.rateDate) ? ` of ${formatIsoDate(c.rateDate)}` : "";
    return `Printed as ${c.currency}${amount(c.totalAmount ?? c.incomePayment)}. Converted to pesos at ₱${Math.round(c.rate * 10_000) / 10_000}, the rate${day}.`;
  }
  if (isUnconverted(original)) {
    return `Printed in ${original.currency ?? "another currency"}${amount(original.totalAmount ?? original.incomePayment)}. Its exchange rate could not be fetched, so enter the amounts in pesos.`;
  }
  return null;
}

function Field({
  label,
  hint,
  problem,
  unsure,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  problem: string | undefined;
  unsure: boolean;
  wide?: boolean;
  children: (props: {
    id: string;
    describedBy: string | undefined;
    className: string;
  }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = problem ?? (unsure ? "The AI was not sure of this. Please check it." : hint);
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children({
        id,
        describedBy: note ? noteId : undefined,
        className: cn(
          box,
          problem
            ? "border-tk-danger"
            : unsure
              ? "border-tk-accent bg-tk-warn-soft"
              : "border-tk-line",
        ),
      })}
      {note ? (
        <p
          id={noteId}
          className={cn(
            "text-sm",
            problem ? "text-tk-danger" : unsure ? "text-tk-warn" : "text-tk-muted",
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function ReadingReview({
  doc,
  onSaved,
  onCancel,
}: {
  doc: StoredDocument;
  /** Called after a successful save, with what the document became. */
  onSaved?: (status: "accepted" | "rejected") => void;
  /** Shows a Cancel button (when correcting a document that is already read). */
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<Entry[]>(() =>
    doc.readings.length
      ? doc.readings.map((original, index) => ({
          key: `read-${index}`,
          original,
          draft: draftOf(original),
        }))
      : [{ key: "typed", original: null, draft: draftOf(null) }],
  );
  // Problems show once the person has tried to save, not while they are still typing.
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const today = todayInManila();

  const update = (key: string, change: (draft: ReviewDraft) => ReviewDraft) =>
    setEntries((current) =>
      current.map((entry) =>
        entry.key === key ? { ...entry, draft: change(entry.draft) } : entry,
      ),
    );
  const set = (key: string, field: ReviewField, value: string) =>
    update(key, (draft) => ({ ...draft, [field]: value }));
  /**
   * A sale's other party is the customer, an expense's the supplier: when the kind changes and
   * the name and TIN are still what the AI read, they follow the new kind.
   */
  const setKind = (entry: Entry, kind: ReviewKind) =>
    update(entry.key, (draft) => {
      const before = counterpartyOf(entry.original, draft.kind);
      const untouched = draft.name === before.name && draft.tin === before.tin;
      return { ...draft, kind, ...(untouched ? counterpartyOf(entry.original, kind) : {}) };
    });

  const problems = entries.map((entry) => reviewProblems(entry.draft, today));
  const complete = problems.every((found) => Object.keys(found).length === 0);
  const outcome = complete
    ? reviewOutcome(
        entries.map((entry) => entry.draft),
        entries.map((entry) => entry.original),
        doc.accountId,
        doc.id,
      )
    : null;

  const save = async () => {
    setTried(true);
    setFailure(null);
    if (!outcome) return;
    if (!UUID.test(doc.id)) {
      setFailure("These are sample documents, so nothing was saved.");
      return;
    }
    setSaving(true);
    try {
      const status = await reviewDocument(doc.id, outcome.readings, outcome.rows);
      // The documents, the tracker and the tax figures all come from the workspace.
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      onSaved?.(status);
    } catch (error) {
      setFailure(
        error instanceof NotConnectedError
          ? "Saving a check is not connected yet, so nothing was saved."
          : "We could not save this. Nothing was changed; please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      aria-label="Check what was read"
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {doc.readings.length === 0 ? (
        <p className="rounded-[12px] bg-tk-warn-soft px-4 py-3 text-[15px]/6">
          The AI could not read anything from this file. Look at the document and type in what it
          says, or mark it as not a tax document.
        </p>
      ) : null}

      {entries.map((entry, index) => {
        const { draft, original } = entry;
        const found = tried ? (problems[index] ?? {}) : {};
        // A box the AI was unsure of stays pointed out until the person changes it.
        const start = draftOf(original);
        const unsure = new Set(
          unsureFields(original).filter((field) => draft[field] === start[field]),
        );
        const note = currencyNote(original);
        const party = draft.kind === "unknown" ? null : PARTY[draft.kind];
        const text =
          (field: ReviewField, extra: Record<string, unknown> = {}) =>
          (props: { id: string; describedBy: string | undefined; className: string }) => (
            <input
              id={props.id}
              className={props.className}
              aria-describedby={props.describedBy}
              aria-invalid={found[field] ? true : undefined}
              value={draft[field]}
              onChange={(event) => set(entry.key, field, event.target.value)}
              {...extra}
            />
          );
        const day = (field: ReviewField) => text(field, { type: "date", max: today });
        const money = (field: ReviewField) =>
          text(field, { inputMode: "decimal", placeholder: "0.00", autoComplete: "off" });

        return (
          <fieldset
            key={entry.key}
            className="flex flex-col gap-4 rounded-[14px] border border-tk-line p-4"
          >
            <legend className="px-1 font-semibold">
              {entries.length > 1
                ? `Document ${index + 1} of ${entries.length} in this file`
                : "What this document says"}
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What it is" problem={found.kind} unsure={unsure.has("kind")} wide>
                {(props) => (
                  <select
                    id={props.id}
                    className={props.className}
                    aria-describedby={props.describedBy}
                    value={draft.kind}
                    onChange={(event) => setKind(entry, event.target.value as ReviewKind)}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {REVIEW_KIND_LABEL[kind]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              {draft.kind === "unknown" || !party ? (
                <p className="text-tk-muted sm:col-span-2">
                  Nothing from it will be counted in the tracker or in any tax figure. If it is a
                  receipt, an invoice or a Form 2307, choose that above and fill in what it says.
                </p>
              ) : draft.kind === "form_2307" ? (
                <>
                  <Field label={party.name} problem={found.name} unsure={unsure.has("name")}>
                    {text("name", { maxLength: 200 })}
                  </Field>
                  <Field
                    label={party.tin}
                    problem={found.tin}
                    unsure={unsure.has("tin")}
                    hint="As printed, for example 123-456-789-00000."
                  >
                    {text("tin", { inputMode: "numeric", maxLength: 24, autoComplete: "off" })}
                  </Field>
                  <Field
                    label="Period from"
                    problem={found.periodFrom}
                    unsure={unsure.has("periodFrom")}
                  >
                    {day("periodFrom")}
                  </Field>
                  <Field
                    label="Period to"
                    problem={found.periodTo}
                    unsure={unsure.has("periodTo")}
                    hint="The last day the form covers. It decides the quarter."
                  >
                    {day("periodTo")}
                  </Field>
                  <Field
                    label="Income payment (₱)"
                    problem={found.incomePayment}
                    unsure={unsure.has("incomePayment")}
                    hint="The total of the income payments."
                  >
                    {money("incomePayment")}
                  </Field>
                  <Field
                    label="Tax withheld (₱)"
                    problem={found.taxWithheld}
                    unsure={unsure.has("taxWithheld")}
                    hint="The total tax withheld."
                  >
                    {money("taxWithheld")}
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Date" problem={found.date} unsure={unsure.has("date")}>
                    {day("date")}
                  </Field>
                  <Field
                    label="Invoice or receipt number"
                    problem={found.documentNumber}
                    unsure={unsure.has("documentNumber")}
                  >
                    {text("documentNumber", { maxLength: 60, autoComplete: "off" })}
                  </Field>
                  <Field label={party.name} problem={found.name} unsure={unsure.has("name")}>
                    {text("name", { maxLength: 200 })}
                  </Field>
                  <Field
                    label={party.tin}
                    problem={found.tin}
                    unsure={unsure.has("tin")}
                    hint="As printed. Leave it empty if there is none."
                  >
                    {text("tin", { inputMode: "numeric", maxLength: 24, autoComplete: "off" })}
                  </Field>
                  <Field
                    label="Total (₱)"
                    problem={found.total}
                    unsure={unsure.has("total")}
                    hint="The grand total, VAT included."
                  >
                    {money("total")}
                  </Field>
                  <Field
                    label="VAT (₱)"
                    problem={found.vat}
                    unsure={unsure.has("vat")}
                    hint="Only if VAT is shown separately."
                  >
                    {money("vat")}
                  </Field>
                  {draft.kind === "expense_receipt" ? (
                    <Field
                      label="Category"
                      problem={found.category}
                      unsure={unsure.has("category")}
                      wide
                    >
                      {(props) => (
                        <select
                          id={props.id}
                          className={props.className}
                          aria-describedby={props.describedBy}
                          value={draft.category}
                          onChange={(event) => set(entry.key, "category", event.target.value)}
                        >
                          <option value="">Not sure</option>
                          {EXPENSE_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {EXPENSE_CATEGORY_LABEL[category as ExpenseCategory]}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  ) : null}
                </>
              )}
            </div>

            {note ? <p className="text-sm text-tk-muted">{note}</p> : null}
            {original?.notes ? (
              <p className="text-sm text-tk-muted">
                <span className="font-medium text-tk-ink">The AI's note:</span> {original.notes}
              </p>
            ) : null}
            {entries.length > 1 ? (
              <button
                type="button"
                onClick={() => setEntries((current) => current.filter((e) => e.key !== entry.key))}
                className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-tk-danger hover:underline"
              >
                <Trash2 aria-hidden className="size-4" /> Remove this one: it is not in the file
              </button>
            ) : null}
          </fieldset>
        );
      })}

      <div aria-live="polite" className="text-[15px]/6">
        {outcome ? (
          outcome.rows.length ? (
            <>
              <p className="font-medium">Saving counts this in your tracker:</p>
              <ul className="mt-1 list-disc pl-5 text-tk-muted marker:text-tk-brand">
                {outcome.rows.map((row, index) => (
                  <li key={index}>
                    {RECORD_KIND_LABEL[row.kind]}, {formatIsoDate(row.record_date)}:{" "}
                    <span className="font-tk-mono tabular-nums text-tk-ink">
                      {peso(row.amount_centavos / 100, true)}
                    </span>
                    {row.vat_centavos ? ` (VAT ${peso(row.vat_centavos / 100, true)})` : ""}
                    {row.tax_withheld_centavos
                      ? ` (tax withheld ${peso(row.tax_withheld_centavos / 100, true)})`
                      : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-tk-muted">
              Saving marks this file as not a tax document. Nothing from it is counted.
            </p>
          )
        ) : tried ? (
          <p role="alert" className="text-tk-danger">
            Fill in the boxes marked in red, then save.
          </p>
        ) : (
          <p className="text-tk-muted">Fill in what is missing, then save.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} aria-busy={saving} className={buttonPrimary}>
          {saving ? (
            <>
              <Loader2 aria-hidden className="size-5 animate-spin" /> Saving…
            </>
          ) : (
            "Save as checked"
          )}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={saving} className={buttonOutline}>
            Cancel
          </button>
        ) : null}
      </div>
      {failure ? (
        <p role="alert" className="text-tk-danger">
          {failure}
        </p>
      ) : null}
    </form>
  );
}
