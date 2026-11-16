/**
 * The tracker: charts, records and tax figures from what was uploaded, the next deadlines, and
 * the records assistant. Empty until something is uploaded. Who can see the account and the COR
 * live on their own tabs (Access, My COR).
 */

import { Link } from "@tanstack/react-router";
import { ArrowRight, Upload } from "lucide-react";

import { daysBetween, formatIsoDate, parseIso } from "@shared/domain/dates.ts";
import { FORM_PAYMENT_TEXT } from "@shared/domain/bir-forms.ts";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import type { TaxProfile } from "@shared/domain/tax-profile.ts";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useMyWorkspace } from "@/lib/data/queries";
import { todayInManila } from "@/lib/data/repository";
import { peso } from "@/lib/money";
import { displayName } from "@/lib/auth/use-auth";

import { AssistantSheet } from "./AssistantSheet";
import { useAppUser } from "./app-user";
import { TrackerPanel } from "./TrackerPanel";
import { Card, EmptyState, LoadingBlock, PageHeader, SampleDataNotice } from "./ui";

/**
 * Until the COR is confirmed, the tracker still shows what was read, with the most common setup:
 * not VAT-registered, graduated rates with the 40% deduction, no withholding.
 */
const SETTINGS_BEFORE_COR: TaxProfile = {
  tin: "",
  registeredName: "",
  rdoCode: "",
  registeredAddress: "",
  lineOfBusiness: "",
  registrationDate: "",
  vatRegistered: false,
  withholdingAgent: false,
  incomeTaxOption: "graduated_osd",
  businessType: "services",
  mixedIncome: false,
};

export function TaxpayerDashboard() {
  const { user } = useAppUser();
  const query = useMyWorkspace(user.id);
  const today = todayInManila();
  const { year, month } = parseIso(today);

  if (query.isPending) return <LoadingBlock label="Loading your tracker…" />;
  if (query.isError) {
    return (
      <p className="py-16 text-center text-tk-danger">
        We could not load your records. Please refresh.
      </p>
    );
  }

  const { data: workspace, source } = query.data;
  const { account, records, documents } = workspace;
  const profile = account.profile;
  const upcoming = profile ? upcomingFilings(profile, today, 3) : [];
  // The COR is checked on the My COR page, not here.
  const toCheck = documents.filter((d) => d.status === "needs_review" && d.kind !== "cor").length;
  // Empty until something other than the COR is uploaded.
  const hasData = records.length > 0 || documents.some((d) => d.kind !== "cor");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Welcome, ${displayName(user)}.`}
        subtitle={
          profile ? account.displayName : "Your records and tax figures, from what you upload."
        }
        action={
          <>
            <Link to="/app/upload" className={buttonPrimary}>
              <Upload aria-hidden className="size-5" />
              Upload documents
            </Link>
            {toCheck > 0 ? (
              <Link to="/app/documents" className={buttonOutline}>
                {toCheck} to check
              </Link>
            ) : null}
          </>
        }
      />
      <SampleDataNotice source={source} what={`an example business (${account.displayName})`} />

      {!hasData ? (
        <EmptyState
          title="Nothing to track yet"
          action={
            <Link to="/app/upload" className={buttonPrimary}>
              <Upload aria-hidden className="size-5" /> Upload documents
            </Link>
          }
        >
          Upload your receipts, sales invoices and Forms 2307. Your charts, records and tax figures
          appear here once they are read.
        </EmptyState>
      ) : (
        <>
          {profile && upcoming.length > 0 ? (
            <section aria-labelledby="next-title">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="next-title" className="text-xl font-semibold">
                  Coming up
                </h2>
                <Link
                  to="/app/cor"
                  className="inline-flex items-center gap-1 font-semibold text-tk-brand hover:underline"
                >
                  All deadlines <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
              <ul className="mt-3 grid gap-3 md:grid-cols-3">
                {upcoming.map((filing) => {
                  const estimate = estimateFiling(filing, records, profile);
                  const days = daysBetween(today, filing.dueDate);
                  return (
                    <li key={filing.id}>
                      <Card as="div" className="h-full p-4 sm:p-5">
                        <p className="text-sm text-tk-muted">
                          {formatIsoDate(filing.dueDate)} ·{" "}
                          {days === 0 ? "today" : `in ${days} days`}
                        </p>
                        <p className="mt-1 font-semibold">
                          {filing.form} · {filing.title}
                        </p>
                        <p className="text-sm text-tk-muted">{filing.periodLabel}</p>
                        <p className="mt-3 font-tk-mono text-xl font-medium tabular-nums">
                          {filing.payment === "estimated" ? peso(estimate.payable) : "—"}
                        </p>
                        <p className="text-[13px] text-tk-muted">
                          {filing.payment === "estimated"
                            ? "expected to pay"
                            : FORM_PAYMENT_TEXT[filing.payment]}
                        </p>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <TrackerPanel
            profile={profile ?? SETTINGS_BEFORE_COR}
            records={records}
            defaultYear={year}
            defaultToMonth={month}
            documentLink={(documentId) => ({
              to: "/app/documents/$documentId",
              params: { documentId },
            })}
          />
          <AssistantSheet
            scope={{ accountId: account.id, year, fromMonth: 1, toMonth: month, taxType: "all" }}
          />
        </>
      )}
    </div>
  );
}
