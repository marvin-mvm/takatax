import { createFileRoute } from "@tanstack/react-router";

import { parseIso } from "@shared/domain/dates.ts";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import { formatTin } from "@shared/domain/tax-profile.ts";
import { AssistantSheet } from "@/components/app/AssistantSheet";
import {
  CorDetails,
  CorDocumentLink,
  DeadlineList,
  TaxTypeCards,
} from "@/components/app/TaxCalendar";
import { TrackerPanel } from "@/components/app/TrackerPanel";
import {
  BackLink,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SampleDataNotice,
} from "@/components/app/ui";
import { useClientWorkspace } from "@/lib/data/queries";
import { todayInManila } from "@/lib/data/repository";

export const Route = createFileRoute("/app/clients/$accountId")({
  component: ClientView,
});

/** A partner's view of one client: their tracker, tax types and what they need to pay. */
function ClientView() {
  const { accountId } = Route.useParams();
  const query = useClientWorkspace(accountId);
  const today = todayInManila();
  const { year, month } = parseIso(today);

  if (query.isPending) return <LoadingBlock label="Loading client…" />;
  if (query.isError || !query.data) {
    return (
      <EmptyState title="We could not open this client.">
        They may have removed your access.
      </EmptyState>
    );
  }
  const { data: workspace, source } = query.data;
  const { account, records } = workspace;
  const profile = account.profile;

  return (
    <div className="flex flex-col gap-8">
      <BackLink to="/app">All clients</BackLink>
      <PageHeader
        title={account.displayName}
        subtitle={
          profile
            ? `${profile.registeredName} · TIN ${formatTin(profile.tin)} · RDO ${profile.rdoCode}`
            : "No COR yet"
        }
      />
      <SampleDataNotice source={source} what="an example client" />
      {!profile ? (
        <EmptyState title="This client has not added their COR yet." />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">What they need to pay next</h2>
            <DeadlineList
              filings={upcomingFilings(profile, today, 3)}
              records={records}
              profile={profile}
              today={today}
            />
          </section>
          <TrackerPanel
            profile={profile}
            records={records}
            defaultYear={year}
            defaultToMonth={month}
            documentLink={(documentId) => ({
              to: "/app/documents/$documentId",
              params: { documentId },
              search: { account: account.id },
            })}
          />
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Tax types</h2>
            <TaxTypeCards profile={profile} />
          </section>
          <CorDetails
            profile={profile}
            corLink={<CorDocumentLink documentId={account.corDocumentId} accountId={account.id} />}
          />
          <AssistantSheet
            scope={{ accountId: account.id, year, fromMonth: 1, toMonth: month, taxType: "all" }}
          />
        </>
      )}
    </div>
  );
}
