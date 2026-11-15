import { createFileRoute } from "@tanstack/react-router";
import { ImageOff, RefreshCw } from "lucide-react";
import { useState } from "react";

import { formatIsoDate } from "@shared/domain/dates.ts";
import { EXPENSE_CATEGORY_LABEL, RECORD_KIND_LABEL } from "@shared/domain/records.ts";
import { CHECK_FLAG_TEXT } from "@shared/parser/checks.ts";
import { DOCUMENT_KIND_LABEL } from "@shared/parser/schema.ts";
import { useAppUser } from "@/components/app/app-user";
import {
  BackLink,
  Card,
  CardTitle,
  EmptyState,
  LoadingBlock,
  NotConnectedNotice,
  PageHeader,
  SampleDataNotice,
  StatusPill,
} from "@/components/app/ui";
import { buttonOutline } from "@/components/site/styles";
import { useClientWorkspace, useMyWorkspace } from "@/lib/data/queries";
import { fileSize, peso } from "@/lib/money";
import { startReading } from "@/lib/services/reader";

export const Route = createFileRoute("/app/documents/$documentId")({
  // `account` is set when a partner opens a client's document.
  validateSearch: (search: Record<string, unknown>): { account?: string } =>
    typeof search["account"] === "string" ? { account: search["account"] } : {},
  component: DocumentPage,
});

const READER_STEP_LABEL: Record<string, string> = {
  fast: "fast model",
  recheck: "second model",
  settle: "top model",
};

/** One document: what was read from it, the checks, and the ledger rows it created. */
function DocumentPage() {
  const { documentId } = Route.useParams();
  const { account } = Route.useSearch();
  const { user } = useAppUser();
  const mine = useMyWorkspace(user.id);
  const client = useClientWorkspace(account ?? "");
  const query = account ? client : mine;
  const [rereadMessage, setRereadMessage] = useState<string | null>(null);

  if (query.isPending) return <LoadingBlock />;
  if (query.isError)
    return <p className="py-16 text-center text-tk-danger">We could not load this document.</p>;

  const { data: workspace, source } = query.data;
  const doc = workspace.documents.find((d) => d.id === documentId);
  const back = account ? `/app/clients/${account}` : "/app/documents";
  if (!doc) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to={back}>Back</BackLink>
        <EmptyState title="Document not found." />
      </div>
    );
  }
  const records = workspace.records.filter((r) => r.documentId === doc.id);

  const reread = async () => {
    setRereadMessage("Asking the reader…");
    const result = await startReading(workspace.account.id, [doc.id]);
    setRereadMessage(
      result.ok
        ? "Sent to be read again."
        : result.reason === "not_connected"
          ? "The AI reader is not connected yet, so the document was not read again."
          : result.message,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <BackLink to={back}>{account ? "Back to client" : "All documents"}</BackLink>
      <PageHeader
        title={doc.fileName}
        subtitle={`${DOCUMENT_KIND_LABEL[doc.kind]} · uploaded ${formatIsoDate(doc.uploadedAt.slice(0, 10))} · ${fileSize(doc.bytes)}`}
        action={
          <button type="button" onClick={() => void reread()} className={buttonOutline}>
            <RefreshCw aria-hidden className="size-4" /> Read again
          </button>
        }
      />
      <SampleDataNotice source={source} />
      {rereadMessage ? (
        <NotConnectedNotice title="Read again">{rereadMessage}</NotConnectedNotice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardTitle action={<StatusPill status={doc.status} />}>What we read</CardTitle>
          {records.length === 0 ? (
            <p className="mt-3 text-tk-muted">
              {doc.kind === "cor"
                ? "This is your COR. Its details are on the My COR page."
                : doc.status.startsWith("waiting") || doc.status === "reading"
                  ? "This document has not been read yet."
                  : "No records came from this document."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {records.map((record) => (
                <li key={record.id} className="rounded-[12px] border border-tk-line p-4">
                  <p className="text-sm text-tk-muted">
                    {RECORD_KIND_LABEL[record.kind]} · {formatIsoDate(record.date)}
                  </p>
                  <p className="font-semibold">{record.counterparty}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-tk-muted">
                      {record.kind === "withholding" ? "Income payment" : "Amount"}
                    </dt>
                    <dd className="text-right font-tk-mono tabular-nums">
                      {peso(record.amount, true)}
                    </dd>
                    {record.vat ? (
                      <>
                        <dt className="text-tk-muted">VAT</dt>
                        <dd className="text-right font-tk-mono tabular-nums">
                          {peso(record.vat, true)}
                        </dd>
                      </>
                    ) : null}
                    {record.taxWithheld ? (
                      <>
                        <dt className="text-tk-muted">Tax withheld</dt>
                        <dd className="text-right font-tk-mono tabular-nums">
                          {peso(record.taxWithheld, true)}
                        </dd>
                      </>
                    ) : null}
                    {record.category ? (
                      <>
                        <dt className="text-tk-muted">Category</dt>
                        <dd className="text-right">{EXPENSE_CATEGORY_LABEL[record.category]}</dd>
                      </>
                    ) : null}
                    {record.counterpartyTin ? (
                      <>
                        <dt className="text-tk-muted">TIN</dt>
                        <dd className="text-right font-tk-mono">{record.counterpartyTin}</dd>
                      </>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ul>
          )}
          {doc.flags.length ? (
            <div className="mt-4 rounded-[12px] bg-tk-warn-soft p-4">
              <p className="font-semibold text-tk-warn">Please check</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-tk-ink">
                {doc.flags.map((flag) => (
                  <li key={flag}>{CHECK_FLAG_TEXT[flag]}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {doc.readerPath.length ? (
            <p className="mt-4 text-sm text-tk-muted">
              Read by the{" "}
              {doc.readerPath.map((step) => READER_STEP_LABEL[step] ?? step).join(", then the ")}.
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle>The document</CardTitle>
          {doc.previewUrl ? (
            <img
              src={doc.previewUrl}
              alt={`Photo of ${doc.fileName}`}
              className="mt-3 w-full rounded-[12px] border border-tk-line"
            />
          ) : (
            // MISSING: once R2 is connected, ask an edge function for a short-lived download
            // link and show the photo or PDF here.
            <div className="mt-3 flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-tk-line bg-tk-surface-2 p-6 text-center text-tk-muted">
              <ImageOff aria-hidden className="size-8" />
              <p>The photo appears here once file storage is connected.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
