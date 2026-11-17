import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredDocument } from "@/lib/data/types";
import { PARSED_RECORDS_HINT, type DeletePlan } from "@/lib/documents/delete";

import { DocumentTable } from "./DocumentTable";

const service = vi.hoisted(() => ({ deleteDocument: vi.fn() }));
vi.mock("@/lib/services/documents", () => service);
const repository = vi.hoisted(() => ({
  tagDocuments: vi.fn(),
  NotConnectedError: class NotConnectedError extends Error {},
}));
vi.mock("@/lib/data/repository", () => repository);
// The table only needs the links to render; there is no router in this test.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const doc = (changes: Partial<StoredDocument> = {}): StoredDocument => ({
  id: "22222222-2222-4222-8222-222222222222",
  accountId: ACCOUNT,
  kind: "expense_receipt",
  fileName: "rent.jpg",
  mimeType: "image/jpeg",
  bytes: 120_000,
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

const show = (documents: StoredDocument[], plan: DeletePlan, clientAccountId?: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocumentTable
        documents={documents}
        plan={plan}
        {...(clientAccountId ? { clientAccountId } : {})}
      />
    </QueryClientProvider>,
  );

const points = () =>
  within(screen.getByRole("alertdialog"))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

beforeAll(() => {
  // The tooltip measures itself with a ResizeObserver, which the test browser does not have.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

beforeEach(() => {
  service.deleteDocument.mockReset();
  service.deleteDocument.mockResolvedValue({ ok: true, data: {} });
  repository.tagDocuments.mockReset();
  repository.tagDocuments.mockResolvedValue(1);
});

afterEach(cleanup);

describe("DocumentTable: deleting", () => {
  it("asks in the themed pop-up, not the browser's box, and deletes nothing on Cancel", async () => {
    const browserBox = vi.spyOn(window, "confirm").mockReturnValue(true);
    show([doc()], "standard");

    fireEvent.click(screen.getByRole("button", { name: "Delete the file rent.jpg" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete this file?" });
    expect(within(dialog).getByText("rent.jpg")).toBeInTheDocument();
    expect(points()).toEqual([
      "The file and its parsed records are deleted.",
      "Their amounts leave the Tracker and tax figures.",
      "Reading it again uses your run or monthly limit.",
      "Premium keeps the records of deleted files.",
    ]);
    expect(browserBox).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(service.deleteDocument).not.toHaveBeenCalled();
    browserBox.mockRestore();
  });

  it("deletes the file once the person presses Delete file", async () => {
    show([doc()], "standard");
    fireEvent.click(screen.getByRole("button", { name: "Delete the file rent.jpg" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }),
    );
    await waitFor(() =>
      expect(service.deleteDocument).toHaveBeenCalledWith(ACCOUNT, doc().id, "file"),
    );
    expect(service.deleteDocument).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("tells a Premium account that the records stay", () => {
    show([doc()], "premium");
    fireEvent.click(screen.getByRole("button", { name: "Delete the file rent.jpg" }));
    expect(points()).toEqual([
      "Only the file is deleted.",
      "Its parsed records stay. The Tracker does not change.",
      "Reading it again counts toward the monthly limit.",
    ]);
  });

  it("does not sell Premium to a professional on a Standard client's account", () => {
    show([doc()], "standard", ACCOUNT);
    fireEvent.click(screen.getByRole("button", { name: "Delete the file rent.jpg" }));
    expect(points()).toEqual([
      "The file and its parsed records are deleted.",
      "Their amounts leave the Tracker and tax figures.",
      "Reading it again counts toward a new run.",
    ]);
  });

  it("asks before the kept records of a deleted file are deleted", async () => {
    show([doc({ fileDeleted: true })], "premium");
    expect(screen.getByText("File deleted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete the parsed records of rent.jpg" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete these parsed records?" });
    expect(points()).toEqual([
      "They leave the Tracker and the tax figures.",
      "This cannot be undone.",
    ]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete records" }));
    await waitFor(() =>
      expect(service.deleteDocument).toHaveBeenCalledWith(ACCOUNT, doc().id, "records"),
    );
  });

  it("keeps Delete record greyed out on Standard, and on Premium until the file is gone", () => {
    show([doc()], "standard");
    expect(
      screen.getByRole("button", { name: "Delete the parsed records of rent.jpg" }),
    ).toBeDisabled();
    cleanup();
    show([doc()], "premium");
    expect(
      screen.getByRole("button", { name: "Delete the parsed records of rent.jpg" }),
    ).toBeDisabled();
  });

  it("says what went wrong when the server refuses", async () => {
    service.deleteDocument.mockResolvedValue({
      ok: false,
      reason: "error",
      code: "being_read",
      message: "Being read",
    });
    show([doc()], "standard");
    fireEvent.click(screen.getByRole("button", { name: "Delete the file rent.jpg" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This document is being read. Delete it when reading is done.",
    );
  });
});

describe("DocumentTable: the Parsed Records (?)", () => {
  it("explains the Premium feature on the column's name", async () => {
    show([doc()], "standard");
    const header = screen.getByRole("columnheader", { name: /Parsed Records/ });
    const mark = within(header).getByRole("button", { name: "About Parsed Records" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(mark);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(PARSED_RECORDS_HINT);
    expect(PARSED_RECORDS_HINT).toBe(
      "Premium feature: parsed records are kept when you delete a file. Deleting them afterwards is optional.",
    );
  });

  it("opens on a tap as well, for phones", async () => {
    show([doc()], "standard");
    fireEvent.click(screen.getByRole("button", { name: "About Parsed Records" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Premium feature");
  });

  it("explains the two steps beside Delete record on Premium while the file is there", async () => {
    show([doc()], "premium");
    fireEvent.focus(
      screen.getByRole("button", { name: "Why the records of rent.jpg cannot be deleted yet" }),
    );
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Delete the file first");
  });
});

describe("tagging files in the table", () => {
  const SECOND = "33333333-3333-4333-8333-333333333333";
  const files = () => [
    doc({ tags: ["Exp Q1 2026", "Rent"] }),
    doc({ id: SECOND, fileName: "power.jpg", tags: ["Exp Q1 2026"] }),
  ];
  const bar = () => screen.getByRole("region", { name: "Tag the selected files" });

  it("shows each file's tags, and no tag bar until a file is ticked", () => {
    show(files(), "standard");

    const tags = within(screen.getByRole("list", { name: "Tags of rent.jpg" })).getAllByRole(
      "listitem",
    );
    expect(tags.map((tag) => tag.textContent)).toEqual(["Exp Q1 2026", "Rent"]);
    expect(
      screen.queryByRole("region", { name: "Tag the selected files" }),
    ).not.toBeInTheDocument();
  });

  it("puts a new tag on the ticked files", async () => {
    show(files(), "standard");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select rent.jpg" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select power.jpg" }));
    expect(within(bar()).getByText("2 selected")).toBeInTheDocument();
    fireEvent.change(within(bar()).getByLabelText("Tag to put on the selected files"), {
      target: { value: "  For   filing " },
    });
    fireEvent.click(within(bar()).getByRole("button", { name: "Add tag" }));

    await waitFor(() => expect(repository.tagDocuments).toHaveBeenCalledTimes(1));
    expect(repository.tagDocuments).toHaveBeenCalledWith(
      ACCOUNT,
      ["22222222-2222-4222-8222-222222222222", SECOND],
      ["For filing"],
      [],
    );
  });

  it("offers the tags already in use, and uses their spelling", async () => {
    show(files(), "standard");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select power.jpg" }));
    const input = within(bar()).getByLabelText("Tag to put on the selected files");
    const offered = [...(input as HTMLInputElement).list!.options].map((option) => option.value);
    expect(offered).toEqual(["Exp Q1 2026", "Rent"]);

    fireEvent.change(input, { target: { value: "rent" } });
    fireEvent.click(within(bar()).getByRole("button", { name: "Add tag" }));

    await waitFor(() =>
      expect(repository.tagDocuments).toHaveBeenCalledWith(ACCOUNT, [SECOND], ["Rent"], []),
    );
  });

  it("selects every file with the box in the header, and clears the selection", () => {
    show(files(), "standard");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select every file" }));
    expect(within(bar()).getByText("2 selected")).toBeInTheDocument();
    // "Rent" is on one of the two files only.
    const onThem = within(within(bar()).getByRole("list", { name: "Tags on the selected files" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(onThem).toEqual(["Exp Q1 2026", "Rent(some)"]);

    fireEvent.click(within(bar()).getByRole("button", { name: "Clear selection" }));
    expect(
      screen.queryByRole("region", { name: "Tag the selected files" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select rent.jpg" })).not.toBeChecked();
  });

  it("stacks the tag bar for a phone: the box, Add tag under it, then the count and Clear", () => {
    show(files(), "standard");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select rent.jpg" }));

    const input = within(bar()).getByLabelText("Tag to put on the selected files");
    const add = within(bar()).getByRole("button", { name: "Add tag" });
    const count = within(bar()).getByText("1 selected");
    const clear = within(bar()).getByRole("button", { name: "Clear selection" });
    // On a phone the pieces follow the order they are written in, one under the other.
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(input, add)).toBe(true);
    expect(before(add, count)).toBe(true);
    expect(before(count, clear)).toBe(true);

    // Stacked and full width on a phone; side by side from the "sm" width up.
    const form = input.closest("form") as HTMLElement;
    expect(form.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-col", "sm:flex-row"]),
    );
    expect(input.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-full", "text-base"]));
    expect(add.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-full", "sm:w-auto"]));
    // The count and Clear share the last line on a phone, and rejoin the row on wider screens.
    expect(count.parentElement).toBe(clear.parentElement);
    expect((count.parentElement as HTMLElement).className.split(/\s+/)).toEqual(
      expect.arrayContaining(["justify-between", "sm:contents"]),
    );
  });

  it("takes a tag off the ticked files", async () => {
    show(files(), "standard");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select rent.jpg" }));
    fireEvent.click(
      within(bar()).getByRole("button", { name: "Take the tag Rent off the selected files" }),
    );

    await waitFor(() =>
      expect(repository.tagDocuments).toHaveBeenCalledWith(
        ACCOUNT,
        ["22222222-2222-4222-8222-222222222222"],
        [],
        ["Rent"],
      ),
    );
  });

  it("does not add an empty tag, an eleventh tag, or a tag to sample files", async () => {
    const full = doc({ tags: Array.from({ length: 10 }, (_, i) => `t${i}`) });
    const { unmount } = show([full], "standard");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select rent.jpg" }));
    expect(within(bar()).getByRole("button", { name: "Add tag" })).toBeDisabled();
    fireEvent.change(within(bar()).getByLabelText("Tag to put on the selected files"), {
      target: { value: "one more" },
    });
    fireEvent.click(within(bar()).getByRole("button", { name: "Add tag" }));
    expect(await within(bar()).findByRole("alert")).toHaveTextContent("up to 10 tags");
    unmount();

    show([doc({ id: "sample-dela-cruz-doc-1" })], "standard");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select rent.jpg" }));
    fireEvent.change(within(bar()).getByLabelText("Tag to put on the selected files"), {
      target: { value: "Rent" },
    });
    fireEvent.click(within(bar()).getByRole("button", { name: "Add tag" }));
    expect(await within(bar()).findByRole("alert")).toHaveTextContent("sample documents");
    expect(repository.tagDocuments).not.toHaveBeenCalled();
  });

  it("says so when the tag could not be saved", async () => {
    repository.tagDocuments.mockRejectedValue(new Error("boom"));
    show(files(), "standard");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select rent.jpg" }));
    fireEvent.change(within(bar()).getByLabelText("Tag to put on the selected files"), {
      target: { value: "Meals" },
    });
    fireEvent.click(within(bar()).getByRole("button", { name: "Add tag" }));

    expect(await within(bar()).findByRole("alert")).toHaveTextContent("We could not save the tag");
  });
});
