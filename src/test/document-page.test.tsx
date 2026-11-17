import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LedgerRecord } from "@shared/domain/records.ts";
import type { ExtractedDocument } from "@shared/parser/schema.ts";
import { AppUserContext } from "@/components/app/app-user";
import type { StoredDocument, Workspace } from "@/lib/data/types";
import { Route } from "@/routes/app/documents/$documentId";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = "22222222-2222-4222-8222-222222222222";

const queries = vi.hoisted(() => ({ useMyWorkspace: vi.fn(), useClientWorkspace: vi.fn() }));
vi.mock("@/lib/data/queries", () => queries);
const repository = vi.hoisted(() => ({
  reviewDocument: vi.fn(),
  logAccessEvent: vi.fn(),
  NotConnectedError: class NotConnectedError extends Error {},
}));
vi.mock("@/lib/data/repository", () => ({
  ...repository,
  READ_FINISHED: ["accepted", "needs_review", "rejected"],
  todayInManila: () => "2026-11-17",
}));
vi.mock("@/lib/services/reader", () => ({ startReading: vi.fn() }));
vi.mock("@/lib/services/uploads", () => ({
  getDocumentLink: vi.fn().mockResolvedValue({ ok: false, reason: "not_connected", message: "" }),
}));
// No router in this test: the page only needs its address values and plain links.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ documentId: "22222222-2222-4222-8222-222222222222" }),
    useSearch: () => ({}),
  }),
  Link: ({ children, to, className }: { children?: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const Page = (Route as unknown as { component: ComponentType }).component;
const user = { id: "u1", email: "maria@example.com", user_metadata: {} } as unknown as User;

const reading = (changes: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  kind: "expense_receipt",
  date: null,
  documentNumber: null,
  issuerName: "Mercury Drug",
  issuerTin: null,
  recipientName: null,
  recipientTin: null,
  totalAmount: 1120,
  vatAmount: 120,
  currency: "PHP",
  expenseCategory: "supplies",
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 0.9, tin: 0.9, date: 0.2, kind: 0.9 },
  notes: "The date is cut off at the top of the photo.",
  ...changes,
});

const doc = (changes: Partial<StoredDocument> = {}): StoredDocument => ({
  id: DOCUMENT,
  accountId: ACCOUNT,
  kind: "expense_receipt",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  bytes: 420_000,
  uploadedAt: "2026-11-16T21:35:00Z",
  status: "needs_review",
  pageCount: 1,
  pagesRead: 1,
  readerPath: ["fast", "recheck", "settle"],
  flags: ["missing_date", "low_confidence"],
  previewUrl: null,
  fileDeleted: false,
  readings: [reading()],
  ...changes,
});

const record: LedgerRecord = {
  id: "r1",
  documentId: DOCUMENT,
  kind: "expense",
  date: "2026-11-02",
  counterparty: "Mercury Drug",
  description: "Mercury Drug",
  category: "supplies",
  amount: 1120,
  vat: 120,
  taxWithheld: 0,
};

const workspace = (document: StoredDocument, records: LedgerRecord[] = []): Workspace => ({
  account: {
    id: ACCOUNT,
    ownerUserId: "u1",
    ownerName: "Maria Santos",
    displayName: "My business",
    profile: null,
    corDocumentId: null,
  },
  documents: [document],
  records,
});

const show = (document: StoredDocument, records: LedgerRecord[] = []) => {
  queries.useMyWorkspace.mockReturnValue({
    data: { data: workspace(document, records), source: "live" },
  });
  queries.useClientWorkspace.mockReturnValue({ isPending: true });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppUserContext.Provider
        value={{ user, role: "taxpayer", signOut: vi.fn(), signingOut: false }}
      >
        <Page />
      </AppUserContext.Provider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  repository.reviewDocument.mockReset();
  repository.reviewDocument.mockResolvedValue("accepted");
});

afterEach(cleanup);

describe("a document's page", () => {
  it("gives a photo the AI was unsure of something to check, even when no record was saved", () => {
    show(doc());

    expect(screen.getByRole("heading", { name: "Check what was read" })).toBeInTheDocument();
    // Why it is here…
    const why = screen.getByText("Why it needs your check").parentElement as HTMLElement;
    expect(within(why).getByText("No date was found.")).toBeInTheDocument();
    expect(within(why).getByText("The AI was not sure about a key figure.")).toBeInTheDocument();
    // …what the AI did read, ready to be corrected…
    const form = screen.getByRole("form", { name: "Check what was read" });
    expect(within(form).getByLabelText("Supplier")).toHaveValue("Mercury Drug");
    expect(within(form).getByLabelText("Total (₱)")).toHaveValue("1120");
    expect(within(form).getByLabelText("VAT (₱)")).toHaveValue("120");
    expect(within(form).getByLabelText("Date")).toHaveValue("");
    expect(
      within(form).getByText("The date is cut off at the top of the photo."),
    ).toBeInTheDocument();
    // …and what is counted meanwhile.
    expect(
      screen.getByText(/Until you save, nothing from this document is counted in the tracker\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("No records came from this document.")).not.toBeInTheDocument();
    expect(
      screen.getByText("Read by the fast model, then the second model, then the top model."),
    ).toBeInTheDocument();
  });

  it("gives a file the AI found nothing in an empty form to type in", async () => {
    repository.reviewDocument.mockResolvedValue("rejected");
    show(doc({ kind: "unknown", flags: ["not_a_document"], readings: [] }));

    expect(screen.getByRole("heading", { name: "Check what was read" })).toBeInTheDocument();
    expect(
      screen.getByText("This does not look like a receipt, invoice or Form 2307."),
    ).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Check what was read" });
    expect(
      within(form).getByText(/The AI could not read anything from this file/),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("What it is")).toHaveValue("unknown");

    // It can be typed in from the photo…
    fireEvent.change(within(form).getByLabelText("What it is"), {
      target: { value: "expense_receipt" },
    });
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-11-05" } });
    fireEvent.change(within(form).getByLabelText("Total (₱)"), { target: { value: "85" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save as checked" }));

    await waitFor(() => expect(repository.reviewDocument).toHaveBeenCalledTimes(1));
    const [, , rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(rows[0]).toMatchObject({
      kind: "expense",
      record_date: "2026-11-05",
      amount_centavos: 8500,
    });
  });

  it("saves the check from the page", async () => {
    show(doc());

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as checked" }));

    await waitFor(() => expect(repository.reviewDocument).toHaveBeenCalledTimes(1));
    const [documentId, , rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(documentId).toBe(DOCUMENT);
    expect(rows[0]).toMatchObject({ record_date: "2026-11-02", amount_centavos: 112000 });
  });

  it("shows a read document's records, and lets them be corrected", async () => {
    show(doc({ status: "accepted", flags: [], readings: [reading({ date: "2026-11-02" })] }), [
      record,
    ]);

    expect(screen.getByRole("heading", { name: "What we read" })).toBeInTheDocument();
    expect(screen.getByText("₱1,120.00")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Correct what was read" }));
    const form = screen.getByRole("form", { name: "Check what was read" });
    expect(within(form).getByLabelText("Date")).toHaveValue("2026-11-02");
    expect(within(form).getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText("Total (₱)"), { target: { value: "1150" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save as checked" }));

    expect(
      await screen.findByText("Saved. These figures are now counted in the tracker."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("says a file marked as not a tax document counts for nothing", () => {
    show(
      doc({
        status: "rejected",
        kind: "unknown",
        flags: [],
        readings: [reading({ kind: "unknown" })],
      }),
    );

    expect(
      screen.getByText(
        "This file was marked as not a tax document, so nothing from it is counted.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correct what was read" })).toBeInTheDocument();
  });

  it("leaves a COR to its own page", () => {
    show(doc({ kind: "cor", status: "accepted", flags: [], readings: [] }));

    expect(
      screen.getByText("This is your COR. Its details are on the My COR page."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Correct what was read" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
});
