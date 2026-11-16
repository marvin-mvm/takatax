import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, UserX } from "lucide-react";
import { useEffect, useState } from "react";

import { parseIso } from "@shared/domain/dates.ts";
import { upcomingFilings } from "@shared/domain/deadlines.ts";
import { formatTin } from "@shared/domain/tax-profile.ts";
import { AssistantSheet } from "@/components/app/AssistantSheet";
import { CorConfirm } from "@/components/app/CorConfirm";
import { DocumentTable } from "@/components/app/DocumentTable";
import { MessageButton } from "@/components/app/MessageButton";
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
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { useClientWorkspace } from "@/lib/data/queries";
import {
  NotConnectedError,
  leaveClient,
  logAccessEvent,
  todayInManila,
} from "@/lib/data/repository";

export const Route = createFileRoute("/app/clients/$accountId")({
  component: ClientView,
});

/**
 * A partner's view of one client's profile: what they need to pay next, their tracker, tax
 * types, COR and documents (never the client's plan, payments or access settings). The partner
 * can message the client, upload documents for them, or stop working on the account.
 * Row-level security checks the access on every read, and the client's activity log records
 * what the partner opens and changes.
 */
function ClientView() {
  const { accountId } = Route.useParams();
  const query = useClientWorkspace(accountId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  const today = todayInManila();
  const { year, month } = parseIso(today);
  // Opening a client's account goes in their activity log (once per visit).
  useEffect(() => {
    void logAccessEvent(accountId, "opened_account");
  }, [accountId]);

  if (query.isPending) return <LoadingBlock label="Loading client…" />;
  if (query.isError || !query.data) {
    return (
      <EmptyState title="We could not open this client.">
        They may have removed your access, or you have not accepted their invitation yet.
      </EmptyState>
    );
  }
  const { data: workspace, source } = query.data;
  const { account, records, documents } = workspace;
  const profile = account.profile;

  const leave = async () => {
    if (!window.confirm(`Stop working on ${account.displayName}? You will lose access at once.`))
      return;
    try {
      await leaveClient(account.id);
      await queryClient.invalidateQueries({ queryKey: ["partner-clients"] });
      await navigate({ to: "/app" });
    } catch (error) {
      setProblem(
        error instanceof NotConnectedError
          ? "Client access is not connected yet."
          : "That did not work. Please try again.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <BackLink to="/app">All clients</BackLink>
      <PageHeader
        title={account.displayName}
        subtitle={
          <>
            {account.ownerName ? `${account.ownerName} · ` : ""}
            {profile
              ? `${profile.registeredName} · TIN ${formatTin(profile.tin)} · RDO ${profile.rdoCode}`
              : "No COR yet"}
          </>
        }
        action={
          <>
            <MessageButton otherUserId={account.ownerUserId} label="Message client" primary />
            <Link to="/app/upload" search={{ account: account.id }} className={buttonOutline}>
              <Upload aria-hidden className="size-5" /> Upload for them
            </Link>
          </>
        }
      />
      <SampleDataNotice source={source} what="an example client" />
      <CorConfirm accountId={account.id} />
      {problem ? (
        <p role="alert" className="text-tk-danger">
          {problem}
        </p>
      ) : null}
      {!profile ? (
        <EmptyState
          title="This client has not added their COR yet."
          action={
            <Link
              to="/app/upload"
              search={{ account: account.id, kind: "cor" }}
              className={buttonPrimary}
            >
              Upload their COR
            </Link>
          }
        />
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
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Documents</h2>
            {documents.length ? (
              <DocumentTable documents={documents} clientAccountId={account.id} limit={50} />
            ) : (
              <p className="text-tk-muted">No documents yet.</p>
            )}
          </section>
          <AssistantSheet
            scope={{ accountId: account.id, year, fromMonth: 1, toMonth: month, taxType: "all" }}
          />
        </>
      )}
      <div className="border-t border-tk-line pt-6">
        <button
          type="button"
          onClick={() => void leave()}
          className={`${buttonOutline} hover:border-tk-danger hover:text-tk-danger`}
        >
          <UserX aria-hidden className="size-5" /> Stop working on this account
        </button>
      </div>
    </div>
  );
}
