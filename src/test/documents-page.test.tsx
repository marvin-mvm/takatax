import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ExtractedDocument } from "@shared/parser/schema.ts";
import { AppUserContext } from "@/components/app/app-user";
import type { StoredDocument } from "@/lib/data/types";
import { Route } from "@/routes/app/documents/index";

const queries = vi.hoisted(() => ({
  useMyWorkspace: vi.fn(),
  usePlan: vi.fn(),
  useUsage: vi.fn(),
}));
vi.mock("@/lib/data/queries", () => queries);
vi.mock("@/lib/data/repository", () => ({
  tagDocuments: vi.fn(),
  NotConnectedError: class NotConnectedError extends Error {},
}));
vi.mock("@/lib/services/documents", () => ({ deleteDocument: vi.fn() }));
// No router in this test: the page only needs plain links.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

const Page = (Route as unknown as { component: ComponentType }).component;
const user = { id: "u1", email: "maria@example.com", user_metadata: {} } as unknown as User;

const reading = (issuerName: string): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-11-02",
  documentNumber: null,
  issuerName,
  issuerTin: null,
  recipientName: null,
  recipientTin: null,
  totalAmount: 100,
  vatAmount: null,
  currency: "PHP",
  expenseCategory: null,
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 1, tin: 1, date: 1, kind: 1 },
  notes: null,
});

let next = 0;
const doc = (fileName: string, changes: Partial<StoredDocument> = {}): StoredDocument => ({
  id: `22222222-2222-4222-8222-${String(++next).padStart(12, "0")}`,
  accountId: "11111111-1111-4111-8111-111111111111",
  kind: "expense_receipt",
  fileName,
  mimeType: "application/pdf",
  bytes: 31_554,
  uploadedAt: "2026-11-16T08:00:00Z",
  status: "accepted",
  pageCount: 1,
  pagesRead: 1,
  readerPath: ["fast"],
  flags: [],
  previewUrl: null,
  fileDeleted: false,
  inRun: true,
  tags: [],
  readings: [],
  ...changes,
});

const show = (documents: StoredDocument[]) => {
  queries.useMyWorkspace.mockReturnValue({
    data: { data: { documents, records: [] }, source: "live" },
  });
  queries.usePlan.mockReturnValue({ data: { data: { premiumUntil: null } } });
  queries.useUsage.mockReturnValue({ data: undefined, isError: true });
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

const files = () => [
  doc("receipt-2026-11.pdf", { tags: ["Exp Q4 2026"], readings: [reading("Twilio Inc.")] }),
  doc("workspace.pdf", { tags: ["Exp Q4 2026", "Software"], readings: [reading("Google")] }),
  doc("photo.jpg", { status: "needs_review", mimeType: "image/jpeg" }),
];
const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("link")[0]?.textContent);

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

describe("the Documents tab", () => {
  it("lists every document until something narrows the list", () => {
    show(files());
    expect(names()).toEqual(["receipt-2026-11.pdf", "workspace.pdf", "photo.jpg"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("searches by file name, and by who the document is from", () => {
    show(files());
    const search = screen.getByRole("searchbox", { name: "Search documents" });

    fireEvent.change(search, { target: { value: "photo" } });
    expect(names()).toEqual(["photo.jpg"]);
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3 documents");

    // The file is called receipt-2026-11.pdf; "Twilio" was read from it.
    fireEvent.change(search, { target: { value: "twilio" } });
    expect(names()).toEqual(["receipt-2026-11.pdf"]);
  });

  it("narrows the list to one tag", () => {
    show(files());
    const tags = screen.getByRole("radiogroup", { name: "Tag" });
    expect(
      within(tags)
        .getAllByRole("radio")
        .map((r) => r.textContent),
    ).toEqual(["Any", "Exp Q4 2026", "Software"]);

    fireEvent.click(within(tags).getByRole("radio", { name: "Software" }));
    expect(names()).toEqual(["workspace.pdf"]);
    fireEvent.click(within(tags).getByRole("radio", { name: "Exp Q4 2026" }));
    expect(names()).toEqual(["receipt-2026-11.pdf", "workspace.pdf"]);
    fireEvent.click(within(tags).getByRole("radio", { name: "Any" }));
    expect(names()).toHaveLength(3);
  });

  it("combines the search, the status and the tag", () => {
    show(files());

    fireEvent.click(screen.getByRole("radio", { name: "Exp Q4 2026" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search documents" }), {
      target: { value: "google" },
    });
    expect(names()).toEqual(["workspace.pdf"]);

    fireEvent.click(screen.getByRole("radio", { name: "Please check" }));
    expect(screen.getByText("No documents match.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all documents" }));
    expect(names()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: "Search documents" })).toHaveValue("");
  });

  it("explains tags when none is in use yet", () => {
    show([doc("photo.jpg")]);
    expect(screen.queryByRole("radiogroup", { name: "Tag" })).not.toBeInTheDocument();
    expect(screen.getByText(/Tick files in the list to put a tag on them/)).toBeInTheDocument();
  });
});
