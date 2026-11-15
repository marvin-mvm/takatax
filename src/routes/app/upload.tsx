import { createFileRoute } from "@tanstack/react-router";

import { UploadPanel } from "@/components/app/UploadPanel";
import { PageHeader } from "@/components/app/ui";
import type { DocumentKind } from "@shared/parser/schema.ts";

const KINDS: DocumentKind[] = ["sales_invoice", "expense_receipt", "form_2307", "cor", "unknown"];

export const Route = createFileRoute("/app/upload")({
  validateSearch: (search: Record<string, unknown>): { kind?: DocumentKind } =>
    KINDS.includes(search["kind"] as DocumentKind) ? { kind: search["kind"] as DocumentKind } : {},
  component: UploadPage,
});

function UploadPage() {
  const { kind } = Route.useSearch();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Upload documents"
        subtitle="Receipts, sales invoices and collections, Form 2307s and your COR. Take photos with your phone or choose PDFs."
      />
      <UploadPanel initialKind={kind ?? "expense_receipt"} />
    </div>
  );
}
