/** The taxpayer's home: next deadlines, the tracker, and the records assistant. */

import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  FileUp,
  ScanLine,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { daysBetween, formatIsoDate, parseIso } from "@shared/domain/dates.ts";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useMyWorkspace } from "@/lib/data/queries";
import { todayInManila } from "@/lib/data/repository";
import { peso } from "@/lib/money";
import { displayName } from "@/lib/auth/use-auth";

import { AssistantSheet } from "./AssistantSheet";
import { useAppUser } from "./app-user";
import { TrackerPanel } from "./TrackerPanel";
import { Card, LoadingBlock, PageHeader, SampleDataNotice } from "./ui";

/**
 * The three steps, worded as on the landing page. Step 1 starts with the COR because it sets the
 * tax types and deadlines that everything else is computed against.
 */
const STEPS: { icon: LucideIcon; title: string; text: string; actions: ReactNode }[] = [
  {
    icon: Upload,
    title: "Upload receipts, sales collections, withholding, etc.",
    text: "Start with your COR (BIR Form 2303): it sets your tax types and deadlines. Then add receipts, sales invoices and 2307s, as photos or PDFs. Your first 10 documents are free.",
    actions: (
      <>
        <Link to="/app/upload" search={{ kind: "cor" }} className={buttonPrimary}>
          <FileUp aria-hidden className="size-5" /> Upload my COR
        </Link>
        <Link to="/app/upload" className={buttonOutline}>
          Upload documents
        </Link>
      </>
    ),
  },
  {
    icon: ScanLine,
    title: "AI will read each document",
    text: "A fast model reads every document, a second one double-checks anything doubtful, and arithmetic checks catch wrong totals. You only confirm the few it is unsure about.",
    actions: (
      <Link to="/app/documents" className={buttonOutline}>
        My documents
      </Link>
    ),
  },
  {
    icon: BarChart3,
    title: "Get your tax figures",
    text: "Your tracker, deadlines and return figures fill in on their own, per tax type. File them yourself, or with a bookkeeper you choose.",
    actions: (
      <Link to="/app/cor" className={buttonOutline}>
        My COR and deadlines
      </Link>
    ),
  },
];

/** Shown to a real account with no COR yet: the three steps to get started. */
function Onboarding() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS.map(({ icon: Icon, title, text, actions }, index) => (
        <li
          key={title}
          className="flex flex-col rounded-[18px] border border-tk-line bg-tk-surface p-5"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-[12px] bg-tk-brand text-white">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="font-tk-mono text-2xl font-medium text-tk-brand">{index + 1}</span>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-pretty">{title}</h2>
          <p className="mt-1 flex-1 text-tk-muted text-pretty">{text}</p>
          <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
        </li>
      ))}
    </ol>
  );
}

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
  const toCheck = documents.filter((d) => d.status === "needs_review").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Welcome, ${displayName(user)}.`}
        subtitle={profile ? account.displayName : "Three steps to your tax figures."}
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

      {!profile ? (
        <Onboarding />
      ) : (
        <>
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
                        {formatIsoDate(filing.dueDate)} · {days === 0 ? "today" : `in ${days} days`}
                      </p>
                      <p className="mt-1 font-semibold">
                        {filing.form} · {filing.title}
                      </p>
                      <p className="text-sm text-tk-muted">{filing.periodLabel}</p>
                      <p className="mt-3 font-tk-mono text-xl font-medium tabular-nums">
                        {peso(estimate.payable)}
                      </p>
                      <p className="text-[13px] text-tk-muted">expected to pay</p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          <TrackerPanel
            profile={profile}
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

      {!profile && source === "live" ? (
        <p className="flex items-center gap-2 text-sm text-tk-muted">
          <Sparkles aria-hidden className="size-4 text-tk-accent" />
          Your tracker, deadlines and the records assistant appear once your COR is read.
        </p>
      ) : null}
    </div>
  );
}
