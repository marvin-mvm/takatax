import { Link, createFileRoute } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useState } from "react";

import { filingsForPeriodYear, upcomingFilings } from "@shared/domain/deadlines.ts";
import { formatIsoDate, parseIso } from "@shared/domain/dates.ts";
import { estimateFiling } from "@shared/domain/tax-estimates.ts";
import { CorConfirm } from "@/components/app/CorConfirm";
import {
  CorDetails,
  CorDocumentLink,
  DeadlineList,
  TaxTypeCards,
} from "@/components/app/TaxCalendar";
import { useAppUser } from "@/components/app/app-user";
import { EmptyState, LoadingBlock, PageHeader, SampleDataNotice } from "@/components/app/ui";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useMyWorkspace } from "@/lib/data/queries";
import { todayInManila } from "@/lib/data/repository";
import { peso } from "@/lib/money";

export const Route = createFileRoute("/app/cor")({
  component: MyCorPage,
});

/** What the COR says, the taxes it means, the deadlines, and what to have ready for each. */
function MyCorPage() {
  const { user } = useAppUser();
  const query = useMyWorkspace(user.id);
  const today = todayInManila();
  const [showAll, setShowAll] = useState(false);

  if (query.isPending) return <LoadingBlock />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load your COR.</p>;

  const { data: workspace, source } = query.data;
  const { account, records } = workspace;
  const profile = account.profile;
  const year = parseIso(today).year;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="My COR"
        subtitle="Your Certificate of Registration decides which taxes you file and when. Here is what it means for you."
        action={
          <Link
            to="/app/upload"
            search={{ kind: "cor" }}
            className={profile ? buttonOutline : buttonPrimary}
          >
            <FileUp aria-hidden className="size-5" />
            {profile ? "Replace COR" : "Upload my COR"}
          </Link>
        }
      />
      <SampleDataNotice source={source} what={`an example business (${account.displayName})`} />
      <CorConfirm accountId={account.id} />

      {!profile ? (
        <EmptyState
          title="Upload your COR to start"
          action={
            <Link to="/app/upload" search={{ kind: "cor" }} className={buttonPrimary}>
              Upload BIR Form 2303
            </Link>
          }
        >
          Take a clear photo of your Certificate of Registration (BIR Form 2303). We read your TIN,
          RDO and tax types, and you confirm them.
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="types-title" className="flex flex-col gap-3">
            <h2 id="types-title" className="text-xl font-semibold">
              Your tax types
            </h2>
            <TaxTypeCards profile={profile} />
          </section>

          <section aria-labelledby="deadlines-title" className="flex flex-col gap-3">
            <h2 id="deadlines-title" className="text-xl font-semibold">
              Coming up, and what to have ready
            </h2>
            <DeadlineList
              filings={upcomingFilings(profile, today, 4)}
              records={records}
              profile={profile}
              today={today}
            />
          </section>

          <section aria-labelledby="year-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="year-title" className="text-xl font-semibold">
                All {year} returns
              </h2>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="font-semibold text-tk-brand hover:underline"
              >
                {showAll ? "Hide" : "Show all"}
              </button>
            </div>
            {showAll ? (
              <div className="relative overflow-x-auto rounded-[16px] border border-tk-line bg-tk-surface">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm/5">
                  <thead>
                    <tr className="border-b border-tk-line bg-tk-bg text-[13px] text-tk-muted">
                      <th className="px-4 py-2 font-medium">Return</th>
                      <th className="px-3 py-2 font-medium">Period</th>
                      <th className="px-3 py-2 font-medium">Due</th>
                      <th className="px-4 py-2 text-right font-medium">Expected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filingsForPeriodYear(profile, year).map((filing) => (
                      <tr key={filing.id} className="border-b border-tk-line last:border-b-0">
                        <td className="px-4 py-2.5 font-medium">
                          {filing.form}{" "}
                          <span className="font-normal text-tk-muted">{filing.title}</span>
                        </td>
                        <td className="px-3 py-2.5 text-tk-muted">{filing.periodLabel}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {formatIsoDate(filing.dueDate)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-tk-mono tabular-nums">
                          {filing.periodEnd <= today || filing.periodStart <= today
                            ? peso(estimateFiling(filing, records, profile).payable)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="text-sm text-tk-muted">
              Due dates that fall on a weekend or holiday move to the next working day. Amounts are
              estimates from the documents read so far, not the figures to file.
            </p>
          </section>

          <CorDetails
            profile={profile}
            corLink={<CorDocumentLink documentId={account.corDocumentId} />}
          />
        </>
      )}
    </div>
  );
}
