import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MB } from "@shared/uploads/usage.ts";
import type { AccountUsage, StoredDocument } from "@/lib/data/types";

import { UploadPanel } from "./UploadPanel";
import { AppUserContext } from "./app-user";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";

const uploads = vi.hoisted(() => ({
  requestUploadSlots: vi.fn(),
  putToStorage: vi.fn(),
  confirmUploads: vi.fn(),
}));
vi.mock("@/lib/services/uploads", () => uploads);
const payments = vi.hoisted(() => ({ checkoutRun: vi.fn() }));
vi.mock("@/lib/services/payments", () => payments);
const reader = vi.hoisted(() => ({ startReading: vi.fn() }));
vi.mock("@/lib/services/reader", () => reader);
const queries = vi.hoisted(() => ({
  usePlan: vi.fn(),
  useUsage: vi.fn(),
  useMyWorkspace: vi.fn(),
  useClientWorkspace: vi.fn(),
}));
vi.mock("@/lib/data/queries", () => queries);
const repository = vi.hoisted(() => ({ loadRunProgress: vi.fn() }));
vi.mock("@/lib/data/repository", () => repository);
const database = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: database }));
// The browser's own file checks are not what is tested here: a PDF has 3 pages, a photo is fine.
vi.mock("@/lib/uploads/pdf-pages", () => ({
  countPdfPages: vi.fn().mockResolvedValue({ ok: true, pages: 3 }),
}));
vi.mock("@/lib/uploads/photo-prep", () => ({
  PHOTO_FLAG_TEXT: {},
  preparePhoto: vi.fn(async (file: File) => ({
    blob: file,
    mimeType: "image/jpeg",
    flags: [],
    measurements: null,
    originalBytes: file.size,
    preparedBytes: file.size,
  })),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

const user = { id: "u1", email: "maria@example.com", user_metadata: {} } as unknown as User;

const usage = (changes: Partial<AccountUsage> = {}): AccountUsage => ({
  accountId: ACCOUNT,
  tier: "standard",
  premiumUntil: null,
  standard: { added: 80, used: 11 },
  trialAvailable: false,
  premiumPagesUsed: 0,
  storageBytes: 8 * MB,
  files: 7,
  ...changes,
});

const saved = (changes: Partial<StoredDocument> = {}): StoredDocument => ({
  id: "33333333-3333-4333-8333-333333333333",
  accountId: ACCOUNT,
  kind: "unknown",
  fileName: "earlier.pdf",
  mimeType: "application/pdf",
  bytes: 200_000,
  uploadedAt: "2026-11-16T08:00:00Z",
  status: "waiting_for_reader",
  pageCount: 2,
  pagesRead: 0,
  readerPath: [],
  flags: [],
  previewUrl: null,
  fileDeleted: false,
  inRun: false,
  tags: [],
  readings: [],
  ...changes,
});

const file = (name: string, type: string, bytes = 1_000) =>
  new File([new Uint8Array(bytes)], name, { type });

const show = (options: { usage?: AccountUsage; waiting?: StoredDocument[] } = {}) => {
  queries.usePlan.mockReturnValue({
    data: { data: { trialUsed: true, premiumPagesLeft: null }, source: "live" },
  });
  queries.useUsage.mockReturnValue({ data: { data: options.usage ?? usage(), source: "live" } });
  queries.useMyWorkspace.mockReturnValue({
    data: { data: { documents: options.waiting ?? [], records: [] }, source: "live" },
  });
  queries.useClientWorkspace.mockReturnValue({ data: undefined });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppUserContext.Provider
        value={{ user, role: "taxpayer", signOut: vi.fn(), signingOut: false }}
      >
        <UploadPanel initialKind="unknown" />
      </AppUserContext.Provider>
    </QueryClientProvider>,
  );
};

/** Picks files through the "Choose files" input and waits until each one is checked. */
const pick = async (files: File[]) => {
  const input = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
  await waitFor(() => expect(screen.queryByText(/Counting pages…|Checking the photo…/)).toBeNull());
};

const card = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }),
  );
  for (const mock of [
    uploads.requestUploadSlots,
    uploads.putToStorage,
    uploads.confirmUploads,
    payments.checkoutRun,
    reader.startReading,
    repository.loadRunProgress,
    database.rpc,
  ])
    mock.mockReset();
  database.rpc.mockResolvedValue({ data: ACCOUNT, error: null });
  // Each file gets a slot; the document id is "doc-" + the file's name.
  uploads.requestUploadSlots.mockImplementation(
    async (_account: string, files: { clientId: string; fileName: string }[]) => ({
      ok: true,
      data: {
        slots: files.map((f) => ({
          clientId: f.clientId,
          documentId: `doc-${f.fileName}`,
          uploadUrl: "https://r2.example/put",
        })),
      },
    }),
  );
  uploads.putToStorage.mockResolvedValue(true);
  uploads.confirmUploads.mockImplementation(async (_account: string, ids: string[]) => ({
    ok: true,
    data: { arrived: ids },
  }));
  payments.checkoutRun.mockResolvedValue({
    ok: true,
    data: {
      runId: "run-1",
      free: true,
      checkoutUrl: null,
      total: 0,
      summary: "Free during launch",
    },
  });
  reader.startReading.mockResolvedValue({ ok: true, data: { started: true, pages: 1 } });
  repository.loadRunProgress.mockResolvedValue({
    status: "complete",
    pages: 1,
    pagesRead: 1,
    read: 1,
    needsReview: 0,
    documents: [],
  });
});

afterEach(cleanup);

describe("UploadPanel", () => {
  it("counts a photo as 1 page and a PDF by its pages, against the pages left", async () => {
    show();
    await pick([file("receipt.jpg", "image/jpeg"), file("statement.pdf", "application/pdf")]);

    expect(
      screen.getByText("You uploaded 1 JPG and 1 PDF file with 4 total combined pages."),
    ).toBeInTheDocument();
    // 11 of 80 used, 4 more to read: 65 left afterwards.
    expect(screen.getByText("65 of 80 pages left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proceed All" })).toBeEnabled();
  });

  it("saves one file only with that file's Proceed, and reads nothing", async () => {
    show();
    await pick([file("receipt.jpg", "image/jpeg"), file("statement.pdf", "application/pdf")]);

    fireEvent.click(within(card("statement.pdf")).getByRole("button", { name: /^Proceed with/ }));

    await waitFor(() => expect(uploads.confirmUploads).toHaveBeenCalledTimes(1));
    const [account, files] = uploads.requestUploadSlots.mock.calls[0] ?? [];
    expect(account).toBe(ACCOUNT);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ fileName: "statement.pdf", pages: 3 });
    expect(uploads.putToStorage).toHaveBeenCalledTimes(1);
    expect(payments.checkoutRun).not.toHaveBeenCalled();
    expect(reader.startReading).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Saved\. The file is stored and waiting to be read/),
    ).toBeInTheDocument();
    // The other file is still waiting to be uploaded.
    expect(screen.getByText("receipt.jpg")).toBeInTheDocument();
    expect(screen.queryByText("statement.pdf")).not.toBeInTheDocument();
  });

  it("saves every file and reads them, with the saved ones, on Proceed All", async () => {
    show({ waiting: [saved()] });
    await pick([file("receipt.jpg", "image/jpeg"), file("statement.pdf", "application/pdf")]);

    // 1 photo + a 3-page PDF + the 2-page PDF saved earlier.
    expect(
      screen.getByText("You uploaded 1 JPG and 2 PDF files with 6 total combined pages."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Proceed All" }));

    await waitFor(() => expect(payments.checkoutRun).toHaveBeenCalledTimes(1));
    expect(uploads.requestUploadSlots.mock.calls[0]?.[1]).toHaveLength(2);
    expect(payments.checkoutRun).toHaveBeenCalledWith(ACCOUNT, [
      "doc-receipt.jpg",
      "doc-statement.pdf",
      "33333333-3333-4333-8333-333333333333",
    ]);
    await waitFor(() => expect(reader.startReading).toHaveBeenCalledWith({ runId: "run-1" }));
    expect(await screen.findByText(/^Done\./)).toBeInTheDocument();
  });

  it("reads one saved file with its own Read button", async () => {
    show({
      waiting: [
        saved(),
        saved({
          id: "44444444-4444-4444-8444-444444444444",
          fileName: "other.jpg",
          mimeType: "image/jpeg",
          pageCount: 1,
        }),
      ],
    });

    const list = screen.getByRole("heading", { name: "Saved, waiting to be read" })
      .parentElement as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Read earlier.pdf only" }));

    await waitFor(() => expect(payments.checkoutRun).toHaveBeenCalledTimes(1));
    expect(payments.checkoutRun).toHaveBeenCalledWith(ACCOUNT, [
      "33333333-3333-4333-8333-333333333333",
    ]);
    expect(uploads.requestUploadSlots).not.toHaveBeenCalled();
  });

  it("reads a file again in its old run when its reading did not finish, using no new pages", async () => {
    show({ waiting: [saved({ inRun: true })] });

    expect(screen.getByText(/its reading did not finish/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read earlier.pdf only" }));

    await waitFor(() =>
      expect(reader.startReading).toHaveBeenCalledWith({
        accountId: ACCOUNT,
        documentIds: ["33333333-3333-4333-8333-333333333333"],
      }),
    );
    expect(payments.checkoutRun).not.toHaveBeenCalled();
    expect(await screen.findByText(/Reading has started again/)).toBeInTheDocument();
  });

  it("blocks Proceed All when the pages left do not cover the files, but still lets a file be saved", async () => {
    show({ usage: usage({ standard: { added: 80, used: 78 } }) });
    await pick([file("statement.pdf", "application/pdf")]);

    expect(
      screen.getByText(
        "You have 2 pages left of your 80 free pages. Extra pages (₱3.50 each) are coming soon, so for now please remove 1 page.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proceed All" })).toBeDisabled();
    expect(
      screen.getByText("You can still save a file with its own Proceed button and read it later."),
    ).toBeInTheDocument();
    expect(
      within(card("statement.pdf")).getByRole("button", { name: /^Proceed with/ }),
    ).toBeEnabled();
  });

  it("does not offer Read on a saved file the pages left cannot cover", () => {
    show({ usage: usage({ standard: { added: 80, used: 80 } }), waiting: [saved()] });

    expect(screen.getByText("Not enough pages left to read this file.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read earlier.pdf only" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Proceed All" })).toBeDisabled();
  });

  it("refuses files that do not fit in the storage that is free", async () => {
    show({ usage: usage({ storageBytes: 299 * MB }) });
    await pick([file("big.jpg", "image/jpeg", 2 * MB), file("small.jpg", "image/jpeg", 1_000)]);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "These files take 2 MB and only 1 MB of the 300 MB storage is free.",
    );
    expect(screen.getByRole("button", { name: "Proceed All" })).toBeDisabled();
    expect(
      within(card("big.jpg")).getByText("This file does not fit in the storage that is free."),
    ).toBeInTheDocument();
    expect(within(card("big.jpg")).getByRole("button", { name: /^Proceed with/ })).toBeDisabled();
    // The small one still fits by itself.
    expect(within(card("small.jpg")).getByRole("button", { name: /^Proceed with/ })).toBeEnabled();
  });

  it("shows the server's reason when it refuses the pages or the storage", async () => {
    uploads.requestUploadSlots.mockResolvedValue({
      ok: false,
      reason: "error",
      code: "storage_full",
      message:
        "The account's 300 MB storage is full. Delete files you no longer need, then try again",
    });
    show();
    await pick([file("receipt.jpg", "image/jpeg")]);

    fireEvent.click(screen.getByRole("button", { name: "Proceed All" }));

    expect(await screen.findByText(/The account's 300 MB storage is full/)).toBeInTheDocument();
    expect(payments.checkoutRun).not.toHaveBeenCalled();
  });

  it("has nothing to proceed with until a file is picked or saved", () => {
    show();
    expect(screen.getByRole("button", { name: "Proceed All" })).toBeDisabled();
    expect(
      screen.queryByRole("heading", { name: "Saved, waiting to be read" }),
    ).not.toBeInTheDocument();
  });
});
