import { createFileRoute } from "@tanstack/react-router";

import { UploadPanel } from "@/components/app/UploadPanel";
import { BackLink, PageHeader } from "@/components/app/ui";
import type { DocumentKind } from "@shared/parser/schema.ts";

const KINDS: DocumentKind[] = ["sales_invoice", "expense_receipt", "form_2307", "cor", "unknown"];

interface UploadSearch {
  kind?: DocumentKind;
  /** A client's account, when a partner uploads for them. */
  account?: string;
  /** The run the payment page sends the browser back with after paying. */
  run?: string;
}

export const Route = createFileRoute("/app/upload")({
  validateSearch: (search: Record<string, unknown>): UploadSearch => ({
    ...(KINDS.includes(search["kind"] as DocumentKind)
      ? { kind: search["kind"] as DocumentKind }
      : {}),
    ...(typeof search["account"] === "string" ? { account: search["account"] } : {}),
    ...(typeof search["run"] === "string" ? { run: search["run"] } : {}),
  }),
  component: UploadPage,
});

function UploadPage() {
  const { kind, account, run } = Route.useSearch();
  return (
    <div className="flex flex-col gap-8">
      {account ? <BackLink to={`/app/clients/${account}`}>Back to the client</BackLink> : null}
      <PageHeader
        title={account ? "Upload for your client" : "Upload documents"}
        subtitle="Receipts, sales invoices and collections, Form 2307s and the COR. Take photos with your phone or choose PDFs."
      />
      <UploadPanel initialKind={kind ?? "unknown"} clientAccountId={account} returningRunId={run} />
    </div>
  );
}
