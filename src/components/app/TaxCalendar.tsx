/** COR summary, tax types and the deadline list, shared by My COR and the partner client view. */

import { Link } from "@tanstack/react-router";
import { CalendarClock, CheckCircle2, FileText } from "lucide-react";

import { daysBetween, formatIsoDate } from "@shared/domain/dates.ts";
import type { Filing } from "@shared/domain/deadlines.ts";
import type { LedgerRecord } from "@shared/domain/records.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import {
  INCOME_TAX_OPTION_LABEL,
  TAX_TYPES,
  type TaxProfile,
  formatTin,
  taxTypesFor,
} from "@shared/domain/tax-profile.ts";
import { FORM_INFO } from "@shared/parser/registration.ts";
import { peso } from "@/lib/money";
import { cn } from "@/lib/utils";

import { Card, CardTitle, Tag } from "./ui";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-tk-line py-2.5 first:border-t-0 sm:grid sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-tk-muted">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

export function CorDetails({
  profile,
  corLink,
}: {
  profile: TaxProfile;
  corLink?: React.ReactNode;
}) {
  return (
    <Card>
      <CardTitle action={corLink}>Certificate of Registration (BIR Form 2303)</CardTitle>
      <dl className="mt-3">
        <Detail label="Registered name" value={profile.registeredName} />
        {profile.tradeName ? <Detail label="Trade name" value={profile.tradeName} /> : null}
        <Detail label="TIN" value={formatTin(profile.tin)} />
        <Detail label="RDO" value={profile.rdoCode} />
        <Detail label="Registered address" value={profile.registeredAddress} />
        <Detail label="Line of business" value={profile.lineOfBusiness} />
        <Detail label="Registered on" value={formatIsoDate(profile.registrationDate)} />
        <Detail
          label="VAT"
          value={profile.vatRegistered ? "VAT-registered" : "Not VAT-registered"}
        />
        <Detail
          label="Income tax option"
          value={INCOME_TAX_OPTION_LABEL[profile.incomeTaxOption]}
        />
      </dl>
    </Card>
  );
}

/** The tax types and forms printed on the COR, one row per form, as the owner confirmed them. */
export function CorFormsList({ profile }: { profile: TaxProfile }) {
  const rows = profile.corTaxTypes ?? [];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((row, index) => {
        const info = row.form ? FORM_INFO[row.form] : undefined;
        return (
          <li
            key={`${row.form ?? row.taxType}-${index}`}
            className={cn(
              "flex gap-4 rounded-[16px] border border-tk-line bg-tk-surface p-4",
              info?.active === false && "opacity-60",
            )}
          >
            <span className="min-w-16 font-tk-mono text-lg font-semibold text-tk-brand">
              {row.form ?? "—"}
            </span>
            <span>
              <span className="block font-semibold">{info?.title ?? row.taxType}</span>
              <span className="block text-sm/5 text-tk-muted">{row.taxType}</span>
              <span className="mt-1 block text-sm/5 text-tk-muted">
                {row.frequency ?? info?.frequency ?? ""}
                {row.effectiveDate ? ` · since ${formatIsoDate(row.effectiveDate)}` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TaxTypeCards({ profile }: { profile: TaxProfile }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {taxTypesFor(profile).map((id) => {
        const info = TAX_TYPES[id];
        return (
          <li key={id} className="rounded-[16px] border border-tk-line bg-tk-surface p-4">
            <p className="font-semibold">{info.label}</p>
            <p className="mt-1 text-sm/5 text-tk-muted text-pretty">{info.description}</p>
            <p className="mt-3 flex flex-wrap gap-1.5">
              {info.forms.map((form) => (
                <Tag key={form} tone="brand">
                  {form}
                </Tag>
              ))}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function dueLabel(days: number): { text: string; tone: "warn" | "neutral" | "brand" } {
  if (days < 0) return { text: `${-days} days late`, tone: "warn" };
  if (days === 0) return { text: "Due today", tone: "warn" };
  if (days <= 14) return { text: `In ${days} days`, tone: "warn" };
  return { text: `In ${days} days`, tone: "neutral" };
}

/** Upcoming returns with what to have ready and the amount expected from the records so far. */
export function DeadlineList({
  filings,
  records,
  profile,
  today,
}: {
  filings: Filing[];
  records: LedgerRecord[];
  profile: TaxProfile;
  today: string;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {filings.map((filing) => {
        const estimate = estimateFiling(filing, records, profile);
        const due = dueLabel(daysBetween(today, filing.dueDate));
        return (
          <li
            key={filing.id}
            className="rounded-[16px] border border-tk-line bg-tk-surface p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-tk-brand-soft text-tk-brand">
                  <CalendarClock aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">
                    {filing.form} · {filing.title}
                  </p>
                  <p className="text-sm text-tk-muted">
                    {filing.periodLabel} · due {formatIsoDate(filing.dueDate)}
                  </p>
                </div>
              </div>
              <Tag tone={due.tone}>{due.text}</Tag>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_220px]">
              <div>
                <p className="text-sm font-medium">What to have ready</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm text-tk-muted">
                  {filing.needs.map((need) => (
                    <li key={need} className="flex gap-2">
                      <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-tk-brand" />
                      {need}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[12px] bg-tk-bg p-3">
                <p className="text-sm text-tk-muted">Expected to pay</p>
                <p className={cn("font-tk-mono text-xl font-medium tabular-nums")}>
                  {peso(estimate.payable, true)}
                </p>
                <p className="mt-1 text-[13px]/[18px] text-tk-muted">
                  {estimate.credits > 0
                    ? `${peso(estimate.taxDue)} tax less ${peso(estimate.credits)} already withheld`
                    : "From the records read so far"}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CorDocumentLink({
  documentId,
  accountId,
}: {
  documentId: string | null;
  accountId?: string;
}) {
  if (!documentId) return null;
  return (
    <Link
      to="/app/documents/$documentId"
      params={{ documentId }}
      search={accountId ? { account: accountId } : {}}
      className="inline-flex items-center gap-1 text-sm font-semibold text-tk-brand hover:underline"
    >
      <FileText aria-hidden className="size-4" />
      View COR
    </Link>
  );
}
