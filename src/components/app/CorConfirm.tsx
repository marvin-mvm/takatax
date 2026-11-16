/**
 * "Check your COR": after the AI reads a COR (BIR Form 2303), the owner (or their partner)
 * checks each field and picks the income tax option before anything is saved. Confirming sets
 * the account's tax types and deadlines (database function `confirm_cor`).
 */

import { useQueryClient } from "@tanstack/react-query";
import { Plus, ScanLine, X } from "lucide-react";
import { useState } from "react";

import { buttonPrimary } from "@/components/site/styles";
import { useCorToConfirm } from "@/lib/data/queries";
import { NotConnectedError, confirmCor } from "@/lib/data/repository";
import type { CorDetails } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import {
  type CorTaxType,
  FORM_INFO,
  flagsFromTaxTypes,
  normalizeFormCode,
} from "@shared/parser/registration.ts";

const field =
  "min-h-11 w-full rounded-[10px] border border-tk-line bg-tk-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-tk-brand";

const OPTIONS: { value: CorDetails["incomeTaxOption"]; label: string; hint: string }[] = [
  {
    value: "eight_percent",
    label: "8% on gross sales",
    hint: "Non-VAT, sales up to ₱3M. Replaces income tax and percentage tax. Chosen on your first return of the year.",
  },
  {
    value: "graduated_osd",
    label: "Graduated rates, 40% optional deduction",
    hint: "Deduct a flat 40% of sales instead of keeping every receipt.",
  },
  {
    value: "graduated_itemized",
    label: "Graduated rates, itemized deductions",
    hint: "Deduct your actual expenses, backed by receipts.",
  },
];

function emptyDetails(read: Partial<CorDetails>): CorDetails {
  return {
    tin: read.tin ?? "",
    registeredName: read.registeredName ?? "",
    tradeName: read.tradeName ?? "",
    rdoCode: read.rdoCode ?? "",
    registeredAddress: read.registeredAddress ?? "",
    lineOfBusiness: read.lineOfBusiness ?? "",
    registrationDate: read.registrationDate ?? "",
    vatRegistered: read.vatRegistered ?? false,
    withholdingAgent: read.withholdingAgent ?? false,
    incomeTaxOption: read.incomeTaxOption ?? "graduated_osd",
    businessType: read.businessType ?? "services",
    mixedIncome: read.mixedIncome ?? false,
    taxTypes: read.taxTypes ?? [],
  };
}

/** Shows the confirmation form when the account has a COR waiting to be checked. */
export function CorConfirm({ accountId }: { accountId: string }) {
  const query = useCorToConfirm(accountId);
  if (!query.data) return null;
  return (
    <CorConfirmForm
      key={query.data.documentId}
      accountId={accountId}
      documentId={query.data.documentId}
      read={query.data.read}
    />
  );
}

function CorConfirmForm({
  accountId,
  documentId,
  read,
}: {
  accountId: string;
  documentId: string;
  read: Partial<CorDetails>;
}) {
  const queryClient = useQueryClient();
  const [details, setDetails] = useState<CorDetails>(() => emptyDetails(read));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof CorDetails>(key: K, value: CorDetails[K]) =>
    setDetails((current) => ({ ...current, [key]: value }));
  /** Changing the forms also updates the VAT and withholding boxes they imply. */
  const setTaxTypes = (taxTypes: CorTaxType[]) =>
    setDetails((current) => ({ ...current, taxTypes, ...flagsFromTaxTypes(taxTypes) }));
  const [newForm, setNewForm] = useState("");
  const addForm = () => {
    const form = normalizeFormCode(newForm);
    if (!form || details.taxTypes.some((t) => t.form === form)) return;
    setTaxTypes([
      ...details.taxTypes,
      { taxType: FORM_INFO[form]?.title ?? form, form, frequency: null, effectiveDate: null },
    ]);
    setNewForm("");
  };

  const tinDigits = details.tin.replace(/\D/g, "");
  const valid =
    tinDigits.length >= 9 && details.registeredName.trim() !== "" && details.rdoCode.trim() !== "";

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await confirmCor(documentId, details);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["cor-to-confirm", accountId] }),
        queryClient.invalidateQueries({ queryKey: ["partner-clients"] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setProblem(
        error instanceof NotConnectedError
          ? "COR confirmation is not connected yet."
          : /duplicate|unique/i.test(message)
            ? "This TIN already belongs to another Takatax account. Each TIN can have one account; ask its owner to give you access instead."
            : "We could not save your COR. Please check the fields and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof CorDetails, label: string, extra: Record<string, unknown> = {}) => (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium">{label}</span>
      <input
        className={field}
        value={String(details[key])}
        onChange={(e) => set(key, e.target.value as never)}
        {...extra}
      />
    </label>
  );
  const check = (key: "vatRegistered" | "withholdingAgent" | "mixedIncome", label: string) => (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={details[key]}
        onChange={(e) => set(key, e.target.checked)}
        className="size-5 accent-[var(--tk-brand)]"
      />
      <span>{label}</span>
    </label>
  );

  return (
    <section
      aria-labelledby="cor-confirm-title"
      className="rounded-[18px] border-2 border-tk-accent/60 bg-tk-surface p-5 sm:p-6"
    >
      <h2 id="cor-confirm-title" className="flex items-center gap-2 text-xl font-semibold">
        <ScanLine aria-hidden className="size-5 text-tk-accent" /> Check your COR
      </h2>
      <p className="mt-1 max-w-[65ch] text-tk-muted text-pretty">
        The AI read these details from your Certificate of Registration. Check each one against the
        paper, fix anything wrong, and choose your income tax option. Nothing changes until you
        confirm.
      </p>
      <form
        className="mt-5 grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void save();
        }}
      >
        {text("tin", "TIN", {
          inputMode: "numeric",
          required: true,
          placeholder: "123-456-789-000",
        })}
        {text("rdoCode", "RDO code", { required: true, maxLength: 5 })}
        {text("registeredName", "Registered name", { required: true })}
        {text("tradeName", "Trade name (if any)")}
        {text("registeredAddress", "Registered address")}
        {text("lineOfBusiness", "Line of business")}
        {text("registrationDate", "Registration date", { type: "date" })}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-medium">What you sell</legend>
          <div className="flex gap-2">
            {(["services", "goods"] as const).map((type) => (
              <label
                key={type}
                className={cn(
                  "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-[10px] border px-3 font-medium",
                  details.businessType === type
                    ? "border-tk-brand bg-tk-brand-soft text-tk-brand"
                    : "border-tk-line",
                )}
              >
                <input
                  type="radio"
                  name="business-type"
                  className="sr-only"
                  checked={details.businessType === type}
                  onChange={() => set("businessType", type)}
                />
                {type === "services" ? "Services" : "Goods"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 md:col-span-2">
          <legend className="font-medium">Tax types and forms on your COR</legend>
          <p className="text-sm text-tk-muted">
            These are the returns your COR says you file. Check them against the tax type table on
            the paper; remove any that are not there and add any that were missed.
          </p>
          {details.taxTypes.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-tk-line p-3 text-sm text-tk-muted">
              No tax types were read. Add each form printed on your COR below.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {details.taxTypes.map((row, index) => {
                const info = row.form ? FORM_INFO[row.form] : undefined;
                return (
                  <li
                    key={`${row.form ?? row.taxType}-${index}`}
                    className="flex items-start gap-3 rounded-[12px] border border-tk-line p-3"
                  >
                    <span className="min-w-16 font-tk-mono font-semibold">{row.form ?? "—"}</span>
                    <span className="flex-1">
                      <span className="block font-medium">{row.taxType}</span>
                      <span className="block text-sm text-tk-muted">
                        {[info?.title, row.frequency ?? info?.frequency]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${row.form ?? row.taxType}`}
                      onClick={() => setTaxTypes(details.taxTypes.filter((_, i) => i !== index))}
                      className="inline-flex size-9 items-center justify-center rounded-full text-tk-muted hover:bg-tk-surface-2 hover:text-tk-ink"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              className={cn(field, "max-w-48")}
              value={newForm}
              placeholder="Form, e.g. 1601-EQ"
              aria-label="Add a form"
              onChange={(e) => setNewForm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addForm();
                }
              }}
            />
            <button
              type="button"
              onClick={addForm}
              disabled={!normalizeFormCode(newForm)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-tk-line px-3 font-semibold disabled:opacity-50"
            >
              <Plus aria-hidden className="size-4" /> Add
            </button>
          </div>
        </fieldset>
        <div className="flex flex-col md:col-span-2 md:flex-row md:gap-6">
          {check("vatRegistered", "VAT-registered")}
          {check("withholdingAgent", "Withholding agent (you withhold tax from others)")}
          {check("mixedIncome", "I also earn a salary")}
        </div>
        <fieldset className="flex flex-col gap-2 md:col-span-2">
          <legend className="font-medium">Income tax option</legend>
          {OPTIONS.map((option) => {
            const blocked = option.value === "eight_percent" && details.vatRegistered;
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[12px] border p-3",
                  details.incomeTaxOption === option.value
                    ? "border-tk-brand bg-tk-brand-soft"
                    : "border-tk-line",
                  blocked && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="income-tax-option"
                  checked={details.incomeTaxOption === option.value}
                  disabled={blocked}
                  onChange={() => set("incomeTaxOption", option.value)}
                  className="mt-1 size-4 accent-[var(--tk-brand)]"
                />
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-sm text-tk-muted">
                    {blocked ? "Not available to VAT-registered taxpayers." : option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button type="submit" disabled={!valid || saving} className={buttonPrimary}>
            {saving ? "Saving…" : "Confirm my COR"}
          </button>
          {!valid ? (
            <span className="text-sm text-tk-muted">
              TIN, RDO code and registered name are needed.
            </span>
          ) : null}
          {problem ? (
            <p role="alert" className="text-sm text-tk-danger">
              {problem}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
