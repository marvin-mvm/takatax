import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractedDocument } from "@shared/parser/schema.ts";
import type { StoredDocument } from "@/lib/data/types";

import { ReadingReview } from "./ReadingReview";

const repository = vi.hoisted(() => ({
  reviewDocument: vi.fn(),
  NotConnectedError: class NotConnectedError extends Error {},
}));
vi.mock("@/lib/data/repository", () => ({
  ...repository,
  todayInManila: () => "2026-11-17",
}));

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const DOCUMENT = "22222222-2222-4222-8222-222222222222";

const reading = (changes: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  kind: "expense_receipt",
  date: "2026-11-02",
  documentNumber: "OR-1042",
  issuerName: "Mercury Drug",
  issuerTin: "000-388-474-000",
  recipientName: "Acme Corp",
  recipientTin: "123-456-789",
  totalAmount: 1120,
  vatAmount: 120,
  currency: "PHP",
  expenseCategory: "supplies",
  periodFrom: null,
  periodTo: null,
  incomePayment: null,
  taxWithheld: null,
  atc: null,
  confidence: { amount: 0.95, tin: 0.95, date: 0.95, kind: 0.95 },
  notes: null,
  ...changes,
});

const doc = (
  readings: ExtractedDocument[],
  changes: Partial<StoredDocument> = {},
): StoredDocument => ({
  id: DOCUMENT,
  accountId: ACCOUNT,
  kind: "expense_receipt",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  bytes: 120_000,
  uploadedAt: "2026-11-16T08:00:00Z",
  status: "needs_review",
  pageCount: 1,
  pagesRead: 1,
  readerPath: ["fast", "recheck", "settle"],
  flags: ["missing_date"],
  previewUrl: null,
  fileDeleted: false,
  readings,
  ...changes,
});

const show = (
  document: StoredDocument,
  handlers: { onSaved?: () => void; onCancel?: () => void } = {},
) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReadingReview doc={document} {...handlers} />
    </QueryClientProvider>,
  );

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save as checked" }));

beforeEach(() => {
  repository.reviewDocument.mockReset();
  repository.reviewDocument.mockResolvedValue("accepted");
});

afterEach(cleanup);

describe("ReadingReview", () => {
  it("shows what the AI read, box by box", () => {
    show(doc([reading()]));

    expect(screen.getByLabelText("What it is")).toHaveValue("expense_receipt");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-02");
    expect(screen.getByLabelText("Supplier")).toHaveValue("Mercury Drug");
    expect(screen.getByLabelText("Supplier's TIN")).toHaveValue("000-388-474-000");
    expect(screen.getByLabelText("Invoice or receipt number")).toHaveValue("OR-1042");
    expect(screen.getByLabelText("Total (₱)")).toHaveValue("1120");
    expect(screen.getByLabelText("VAT (₱)")).toHaveValue("120");
    expect(screen.getByLabelText("Category")).toHaveValue("supplies");
    // What saving will count, before anything is saved.
    expect(screen.getByText("Saving counts this in your tracker:")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Expense, Nov 2, 2026: ₱1,120.00");
  });

  it("points at what the AI was not sure of, until the person changes it", () => {
    show(
      doc([reading({ date: null, confidence: { amount: 0.4, tin: 0.95, date: 0.2, kind: 0.95 } })]),
    );

    const unsure = "The AI was not sure of this. Please check it.";
    expect(screen.getByLabelText("Date")).toHaveAccessibleDescription(unsure);
    expect(screen.getByLabelText("Total (₱)")).toHaveAccessibleDescription(unsure);
    expect(screen.getByLabelText("Supplier")).not.toHaveAccessibleDescription(unsure);

    type("Total (₱)", "1,150");
    expect(screen.getByLabelText("Total (₱)")).not.toHaveAccessibleDescription(unsure);
  });

  it("does not save while the date is missing, and says which box to fill", () => {
    show(doc([reading({ date: null })]));

    save();

    expect(repository.reviewDocument).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Date")).toHaveAccessibleDescription(
      "Enter the date printed on the document.",
    );
    expect(screen.getByLabelText("Date")).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent("Fill in the boxes marked in red");
  });

  it("saves the corrected figures and their ledger row", async () => {
    const onSaved = vi.fn();
    show(doc([reading({ date: null })]), { onSaved });

    type("Date", "2026-11-03");
    type("Total (₱)", "1,150.50");
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("accepted"));
    expect(repository.reviewDocument).toHaveBeenCalledTimes(1);
    const [documentId, readings, rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(documentId).toBe(DOCUMENT);
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      kind: "expense_receipt",
      date: "2026-11-03",
      totalAmount: 1150.5,
      confidence: { amount: 1, tin: 1, date: 1, kind: 1 },
    });
    expect(rows).toEqual([
      {
        account_id: ACCOUNT,
        document_id: DOCUMENT,
        kind: "expense",
        record_date: "2026-11-03",
        counterparty: "Mercury Drug",
        counterparty_tin: "000-388-474-000",
        description: "Mercury Drug",
        category: "supplies",
        amount_centavos: 115050,
        vat_centavos: 12000,
      },
    ]);
  });

  it("gives an empty form to type in when the AI read nothing", async () => {
    show(doc([]));

    expect(screen.getByText(/The AI could not read anything from this file/)).toBeInTheDocument();
    expect(screen.getByLabelText("What it is")).toHaveValue("unknown");
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("What it is"), { target: { value: "expense_receipt" } });
    type("Date", "2026-11-05");
    type("Supplier", "Sari-sari store");
    type("Total (₱)", "85");
    save();

    await waitFor(() => expect(repository.reviewDocument).toHaveBeenCalledTimes(1));
    const [, , rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "expense",
      record_date: "2026-11-05",
      counterparty: "Sari-sari store",
      amount_centavos: 8500,
    });
  });

  it("saves something that is not a tax document with no records", async () => {
    repository.reviewDocument.mockResolvedValue("rejected");
    const onSaved = vi.fn();
    show(doc([reading({ kind: "unknown", date: null, totalAmount: null })]), { onSaved });

    expect(screen.getByText(/Saving marks this file as not a tax document/)).toBeInTheDocument();
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("rejected"));
    const [, readings, rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(readings[0]).toMatchObject({ kind: "unknown" });
    expect(rows).toEqual([]);
  });

  it("takes the customer as the other side when a receipt is really a sale", () => {
    show(doc([reading()]));

    fireEvent.change(screen.getByLabelText("What it is"), { target: { value: "sales_invoice" } });

    expect(screen.getByLabelText("Customer")).toHaveValue("Acme Corp");
    expect(screen.getByLabelText("Customer's TIN")).toHaveValue("123-456-789");
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Sale, Nov 2, 2026: ₱1,120.00");
  });

  it("asks a Form 2307 for its period and its two totals", async () => {
    show(doc([reading({ kind: "form_2307", date: null, totalAmount: null, vatAmount: null })]));

    expect(screen.getByLabelText("Payor (who withheld the tax)")).toHaveValue("Mercury Drug");
    type("Period from", "2026-07-01");
    type("Period to", "2026-09-30");
    type("Income payment (₱)", "50000");
    type("Tax withheld (₱)", "5000");
    save();

    await waitFor(() => expect(repository.reviewDocument).toHaveBeenCalledTimes(1));
    const [, , rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(rows[0]).toMatchObject({
      kind: "withholding",
      record_date: "2026-09-30",
      amount_centavos: 5_000_000,
      tax_withheld_centavos: 500_000,
    });
  });

  it("never offers a foreign amount as pesos", () => {
    show(doc([reading({ currency: "USD", totalAmount: 250, vatAmount: null })]));

    expect(screen.getByLabelText("Total (₱)")).toHaveValue("");
    expect(
      screen.getByText(/Printed in USD 250\.00\. Its exchange rate could not be fetched/),
    ).toBeInTheDocument();
  });

  it("shows each document found in one file, and lets one be removed", async () => {
    show(
      doc([
        reading(),
        reading({ issuerName: "7-Eleven", totalAmount: 56, vatAmount: null, documentNumber: null }),
      ]),
    );

    const second = screen.getByRole("group", { name: "Document 2 of 2 in this file" });
    expect(within(second).getByLabelText("Supplier")).toHaveValue("7-Eleven");
    fireEvent.click(
      within(second).getByRole("button", { name: /Remove this one: it is not in the file/ }),
    );
    expect(screen.queryByRole("group", { name: /Document 2 of 2/ })).not.toBeInTheDocument();

    save();
    await waitFor(() => expect(repository.reviewDocument).toHaveBeenCalledTimes(1));
    const [, readings, rows] = repository.reviewDocument.mock.calls[0] ?? [];
    expect(readings).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it("shows the AI's note and says so when saving fails", async () => {
    repository.reviewDocument.mockRejectedValue(new Error("boom"));
    const onSaved = vi.fn();
    show(doc([reading({ notes: "The total is handwritten." })]), { onSaved });

    expect(screen.getByText("The total is handwritten.")).toBeInTheDocument();
    save();

    expect(
      await screen.findByText(/We could not save this\. Nothing was changed/),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("says when saving is not connected yet, and offers Cancel only when asked", async () => {
    repository.reviewDocument.mockRejectedValue(new repository.NotConnectedError("x"));
    const onCancel = vi.fn();
    show(doc([reading()], { status: "accepted", flags: [] }), { onCancel });

    save();
    expect(await screen.findByText(/Saving a check is not connected yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not try to save a sample document", async () => {
    show(doc([reading()], { id: "sample-dela-cruz-doc-1" }));

    save();

    expect(await screen.findByText(/These are sample documents/)).toBeInTheDocument();
    expect(repository.reviewDocument).not.toHaveBeenCalled();
  });
});
