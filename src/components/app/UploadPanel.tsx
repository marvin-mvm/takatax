/**
 * Upload and scan: pick or photograph documents, check each photo in the browser (blur,
 * darkness, glare), count every PDF's pages, and show what reading them will use of the
 * account's pages and storage before anything is sent.
 *
 * Saving a file and reading it are two steps, so a person chooses what to read:
 * - "Proceed" on a file saves that file only. It goes to Cloudflare R2 and then waits to be
 *   read, with its own "Read" button; nothing is read and no pages are used yet.
 * - "Proceed All" saves every file picked and reads everything that is saved and not read yet,
 *   in one run.
 *
 * Steps: ensure the account -> signed upload links (refused when the tier's storage is full)
 * -> PUT each file to R2 -> confirm-upload. Reading: create-checkout (prices the pages against
 * the account's pages; free: read now; paid: the payment provider, then back here with ?run=)
 * -> read-documents, which starts the reader -> progress from the run's row.
 * Each step that needs a key says so plainly when it is missing. See docs/MISSING_PIECES.md.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpenCheck,
  Camera,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@shared/parser/schema.ts";
import {
  ACCEPT_ATTRIBUTE,
  FILE_PROBLEM_TEXT,
  type FileProblem,
  MAX_BATCH_BYTES,
  PARTNER_RUN_PRICE,
  PAYMENTS_LIVE,
  PRICING,
  batchMessage,
  checkFile,
  pesoText,
  quoteRun,
} from "@shared/uploads/rules.ts";
import { sizeText, storageRoom } from "@shared/uploads/usage.ts";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { supabase } from "@/integrations/supabase/client";
import { useClientWorkspace, useMyWorkspace, usePlan, useUsage } from "@/lib/data/queries";
import { loadRunProgress } from "@/lib/data/repository";
import type { StoredDocument } from "@/lib/data/types";
import { fileSize } from "@/lib/money";
import { checkoutRun } from "@/lib/services/payments";
import { startReading } from "@/lib/services/reader";
import {
  type RunDocumentProgress,
  confirmUploads,
  putToStorage,
  requestUploadSlots,
} from "@/lib/services/uploads";
import { countPdfPages } from "@/lib/uploads/pdf-pages";
import { PHOTO_FLAG_TEXT, type PhotoFlag, preparePhoto } from "@/lib/uploads/photo-prep";
import { cn } from "@/lib/utils";

import { ReadingProgress, RunReadingProgress } from "./ReadingProgress";
import { useAppUser } from "./app-user";
import { NotConnectedNotice } from "./ui";

const KIND_CHOICES: { kind: DocumentKind; label: string; hint: string }[] = [
  { kind: "unknown", label: "Mixed docs", hint: "AI will sort it" },
  { kind: "expense_receipt", label: "Receipts and purchases", hint: "What you paid suppliers" },
  { kind: "sales_invoice", label: "Sales and collections", hint: "Invoices you issued" },
  { kind: "form_2307", label: "Withholding (2307)", hint: "From clients who withheld tax" },
  { kind: "cor", label: "COR (Form 2303)", hint: "Your registration" },
];

interface QueuedFile {
  id: string;
  file: File;
  kind: DocumentKind;
  isPdf: boolean;
  previewUrl: string | null;
  problem: FileProblem | null;
  photoFlags: PhotoFlag[];
  prepared: { blob: Blob; mimeType: string } | null;
  /** 1 for a photo; a PDF's page count once counted. */
  pages: number | null;
  checking: boolean;
}

type Stage =
  | { step: "idle" }
  | { step: "working"; message: string }
  | { step: "reading"; pages: number; pagesRead: number; documents: RunDocumentProgress[] }
  | { step: "storage_not_connected" }
  | { step: "payments_not_connected"; uploaded: number }
  | { step: "reader_not_connected"; uploaded: number }
  | { step: "done"; read: number; needsReview: number; documents: RunDocumentProgress[] }
  /** Files were saved without being read (a file's own Proceed). */
  | { step: "saved"; files: number }
  /** Documents whose reading had not finished were started again. */
  | { step: "started" }
  | { step: "error"; message: string };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isJpeg = (file: File) => file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);

export function UploadPanel({
  initialKind,
  clientAccountId,
  returningRunId,
}: {
  initialKind: DocumentKind;
  /** Set when a partner uploads for a client: their account, at the partner price. */
  clientAccountId?: string | undefined;
  /** Set when the payment provider sends the browser back after paying for this run. */
  returningRunId?: string | undefined;
}) {
  const { user } = useAppUser();
  const plan = usePlan(user.id);
  // The pages and the storage of the account the files go into: the user's, or a client's.
  const usage = useUsage(user.id, clientAccountId);
  const mine = useMyWorkspace(user.id);
  const client = useClientWorkspace(clientAccountId ?? "");
  const workspace = clientAccountId ? client : mine;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>(initialKind);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [stage, setStage] = useState<Stage>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Free the photo previews when the screen closes.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(
    () => () => queueRef.current.forEach((q) => q.previewUrl && URL.revokeObjectURL(q.previewUrl)),
    [],
  );

  const addFiles = (files: FileList | File[]) => {
    const added: QueuedFile[] = Array.from(files).map((file) => {
      const problem = checkFile(file);
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind,
        isPdf,
        previewUrl: !problem && file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        problem,
        photoFlags: [],
        prepared: null,
        pages: isPdf ? null : 1,
        checking: !problem,
      };
    });
    setQueue((current) => [...current, ...added]);
    setStage({ step: "idle" });
    // One file at a time, so a phone stays responsive: photos are checked for blur and
    // shrunk; PDFs have their pages counted.
    void (async () => {
      for (const item of added) {
        if (item.problem) continue;
        if (item.isPdf) {
          const counted = await countPdfPages(item.file);
          setQueue((current) =>
            current.map((q) =>
              q.id === item.id
                ? counted.ok
                  ? {
                      ...q,
                      checking: false,
                      pages: counted.pages,
                      prepared: { blob: q.file, mimeType: "application/pdf" },
                    }
                  : { ...q, checking: false, problem: counted.problem }
                : q,
            ),
          );
          continue;
        }
        const result = await preparePhoto(item.file);
        setQueue((current) =>
          current.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  checking: false,
                  photoFlags: result.flags,
                  prepared: { blob: result.blob, mimeType: result.mimeType },
                }
              : q,
          ),
        );
      }
    })();
  };

  const remove = (id: string) =>
    setQueue((current) => {
      const item = current.find((q) => q.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((q) => q.id !== id);
    });

  // ---- Saved files that were not read yet ---------------------------------------------------
  const waiting = useMemo<StoredDocument[]>(
    () =>
      workspace.data?.source === "live"
        ? workspace.data.data.documents.filter(
            (d) => d.status === "waiting_for_reader" && !d.fileDeleted,
          )
        : [],
    [workspace.data],
  );
  // Never sent for reading: reading them uses pages.
  const unread = waiting.filter((d) => !d.inRun);
  // Sent before, but the reading did not finish: read again in the run that counted them.
  const unfinished = waiting.filter((d) => d.inRun);

  // ---- What Proceed All is about to do: pages, storage and price ----------------------------
  const ready = queue.filter((q) => !q.problem);
  const counting = ready.some((q) => q.checking);
  const sizeOf = (q: QueuedFile) => q.prepared?.blob.size ?? q.file.size;
  const localImages = ready.filter((q) => !q.isPdf);
  const localPdfs = ready.filter((q) => q.isPdf);
  const savedPdfs = unread.filter((d) => d.mimeType === "application/pdf");
  const savedImages = unread.filter((d) => d.mimeType !== "application/pdf");
  const pdfPages =
    localPdfs.reduce((sum, q) => sum + (q.pages ?? 0), 0) +
    savedPdfs.reduce((sum, d) => sum + d.pageCount, 0);
  const images = localImages.length + savedImages.length;
  const totalPages = images + pdfPages;
  const batchBytes = ready.reduce((sum, q) => sum + sizeOf(q), 0);
  const tooBig = batchBytes > MAX_BATCH_BYTES;

  const account = usage.data?.data;
  const quoteOptions = {
    partner: Boolean(clientAccountId),
    trialAvailable: !clientAccountId && plan.data?.data.trialUsed !== true,
    ...(account ? { standard: account.standard } : {}),
    ...(!clientAccountId && typeof plan.data?.data.premiumPagesLeft === "number"
      ? { premiumRemaining: plan.data.data.premiumPagesLeft }
      : {}),
  };
  // An estimate for the message; create-checkout works out the real price on the server.
  const quote = quoteRun(totalPages, quoteOptions);
  // Storage: what the files picked would add to what the account already stores.
  const room = storageRoom(account?.tier ?? "standard", account?.storageBytes ?? 0, batchBytes);
  const fits = (item: QueuedFile) =>
    storageRoom(account?.tier ?? "standard", account?.storageBytes ?? 0, sizeOf(item)).ok;
  const message =
    totalPages > 0 && !counting
      ? batchMessage(
          {
            images,
            allJpeg:
              localImages.every((q) => isJpeg(q.file)) &&
              savedImages.every((d) => d.mimeType === "image/jpeg"),
            pdfs: localPdfs.length + savedPdfs.length,
            pdfPages,
          },
          quote,
        )
      : [];
  const busy = stage.step === "working" || stage.step === "reading";
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["workspace"] });
    void queryClient.invalidateQueries({ queryKey: ["plan"] });
    void queryClient.invalidateQueries({ queryKey: ["usage"] });
  };

  // ---- Reading: start the reader, then follow its progress -----------------------------------
  /** Starts reading a run, waiting a little for the payment confirmation if it is not in yet. */
  const readRun = async (runId: string, uploaded: number) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      setStage({
        step: "working",
        message: attempt === 0 ? "Starting the reader…" : "Waiting for the payment to clear…",
      });
      const started = await startReading({ runId });
      if (started.ok) break;
      if (started.code !== "payment_required") {
        setStage(
          started.reason === "not_connected"
            ? { step: "reader_not_connected", uploaded }
            : { step: "error", message: started.message },
        );
        return;
      }
      if (attempt === 9) {
        setStage({
          step: "error",
          message:
            "We have not received the payment confirmation yet. If you paid, reading starts once the payment is confirmed; check Documents in a few minutes.",
        });
        return;
      }
      await wait(3_000);
    }
    refresh();

    // The reader (Supabase or Trigger.dev) writes its progress to the run. Follow it while this
    // screen is open; leaving is fine, reading carries on.
    while (mounted.current) {
      const progress = await loadRunProgress(runId);
      if (progress) {
        if (progress.status === "complete" || progress.status === "review") {
          setStage({
            step: "done",
            read: progress.read,
            needsReview: progress.needsReview,
            documents: progress.documents,
          });
          refresh();
          return;
        }
        setStage({
          step: "reading",
          pages: progress.pages,
          pagesRead: progress.pagesRead,
          documents: progress.documents,
        });
      }
      await wait(3_000);
    }
  };

  // Back from the payment page: read the run that was just paid for.
  const resumed = useRef(false);
  useEffect(() => {
    if (!returningRunId || resumed.current) return;
    resumed.current = true;
    void navigate({
      to: "/app/upload",
      search: clientAccountId ? { account: clientAccountId } : {},
      replace: true,
    });
    void readRun(returningRunId, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on return
  }, [returningRunId]);

  /**
   * Saves files: signed links, each file to R2, then the check that they arrived. Returns the
   * account and the documents now waiting to be read, or null when it could not be done (the
   * reason is on the screen). Nothing is read here.
   */
  const send = async (
    items: QueuedFile[],
  ): Promise<{ accountId: string; arrived: string[] } | null> => {
    setStage({ step: "working", message: "Preparing the account…" });
    // A partner uploads into their client's account; a taxpayer into their own (created now if
    // this is their first upload).
    let accountId = clientAccountId ?? "";
    if (!accountId) {
      const { data, error } = await supabase.rpc("ensure_my_account" as never);
      accountId = typeof data === "string" ? data : "";
      if (error || !accountId) {
        setStage({ step: "storage_not_connected" });
        return null;
      }
    }

    setStage({ step: "working", message: "Getting upload links…" });
    const slots = await requestUploadSlots(
      accountId,
      items.map((q) => ({
        clientId: q.id,
        fileName: q.file.name,
        mimeType: q.prepared?.mimeType ?? q.file.type,
        bytes: sizeOf(q),
        kind: q.kind,
        pages: q.pages ?? 1,
      })),
    );
    if (!slots.ok) {
      setStage(
        slots.reason === "not_connected"
          ? { step: "storage_not_connected" }
          : { step: "error", message: slots.message },
      );
      return null;
    }

    let sent = 0;
    for (const slot of slots.data.slots) {
      const item = items.find((q) => q.id === slot.clientId);
      if (!item) continue;
      setStage({ step: "working", message: `Uploading ${sent + 1} of ${items.length}…` });
      if (
        await putToStorage(
          slot,
          item.prepared?.blob ?? item.file,
          item.prepared?.mimeType ?? item.file.type,
        )
      )
        sent++;
    }

    setStage({ step: "working", message: "Checking the uploads…" });
    const confirmed = await confirmUploads(
      accountId,
      slots.data.slots.map((slot) => slot.documentId),
    );
    if (!confirmed.ok || confirmed.data.arrived.length === 0) {
      setStage(
        confirmed.ok
          ? { step: "error", message: "None of the files reached storage. Please try again." }
          : confirmed.reason === "not_connected"
            ? { step: "storage_not_connected" }
            : { step: "error", message: confirmed.message },
      );
      return null;
    }
    // The files that arrived leave the list of files to upload: they are saved now.
    const arrived = new Set(confirmed.data.arrived);
    const savedIds = new Set(
      slots.data.slots.filter((slot) => arrived.has(slot.documentId)).map((slot) => slot.clientId),
    );
    setQueue((current) => {
      current
        .filter((q) => savedIds.has(q.id) && q.previewUrl)
        .forEach((q) => URL.revokeObjectURL(q.previewUrl ?? ""));
      return current.filter((q) => !savedIds.has(q.id));
    });
    refresh();
    return { accountId, arrived: confirmed.data.arrived };
  };

  /** Prices the documents against the account's pages, pays if needed, then reads them. */
  const read = async (accountId: string, documentIds: string[], uploaded: number) => {
    setStage({ step: "working", message: "Counting the pages…" });
    const checkout = await checkoutRun(accountId, documentIds);
    if (!checkout.ok) {
      setStage(
        checkout.reason === "not_connected"
          ? { step: "payments_not_connected", uploaded }
          : { step: "error", message: `${checkout.message}.`.replace(/\.\.$/, ".") },
      );
      refresh();
      return;
    }
    if (checkout.data.checkoutUrl) {
      setStage({ step: "working", message: "Opening the payment page…" });
      window.location.assign(checkout.data.checkoutUrl);
      return;
    }
    if (checkout.data.runId) await readRun(checkout.data.runId, uploaded);
  };

  /** A file's own Proceed: saves that file only. It then waits to be read. */
  const saveOne = async (item: QueuedFile) => {
    if (busy || item.problem || item.checking || !fits(item)) return;
    const sent = await send([item]);
    if (sent) setStage({ step: "saved", files: sent.arrived.length });
  };

  /** "Read" on a saved file: reads that file only. */
  const readOne = async (doc: StoredDocument) => {
    if (busy) return;
    if (!doc.inRun) {
      await read(doc.accountId, [doc.id], 0);
      return;
    }
    // Its reading did not finish: the run that counted its pages reads it again.
    setStage({ step: "working", message: "Starting the reader…" });
    const started = await startReading({ accountId: doc.accountId, documentIds: [doc.id] });
    refresh();
    setStage(
      started.ok
        ? { step: "started" }
        : started.reason === "not_connected"
          ? { step: "reader_not_connected", uploaded: 0 }
          : { step: "error", message: started.message },
    );
  };

  const nothingToDo = ready.length === 0 && waiting.length === 0;
  const cannotProceedAll = busy || counting || tooBig || quote.blocked || !room.ok || nothingToDo;

  /** Proceed All: saves every file picked, then reads everything saved and not read yet. */
  const proceedAll = async () => {
    if (cannotProceedAll) return;
    let accountId = clientAccountId ?? waiting[0]?.accountId ?? "";
    let arrived: string[] = [];
    if (ready.length) {
      const sent = await send(ready);
      if (!sent) return;
      accountId = sent.accountId;
      arrived = sent.arrived;
    }
    if (unfinished.length) {
      // No new pages: these were counted when they were first sent for reading.
      void startReading({ accountId, documentIds: unfinished.map((d) => d.id) }).then(refresh);
    }
    const documentIds = [...arrived, ...unread.map((d) => d.id)];
    if (documentIds.length) await read(accountId, documentIds, arrived.length);
    else setStage({ step: "started" });
  };

  const pagesNote =
    quote.plan === "premium"
      ? `${quote.leftAfter.toLocaleString("en-PH")} of ${quote.allowance.toLocaleString("en-PH")} pages left this Premium month`
      : `${quote.leftAfter.toLocaleString("en-PH")} of ${quote.allowance.toLocaleString("en-PH")} pages left`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <fieldset>
          <legend className="font-semibold">What are you uploading?</legend>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {KIND_CHOICES.map((choice) => (
              <label
                key={choice.kind}
                className={cn(
                  "flex cursor-pointer flex-col rounded-[14px] border bg-tk-surface p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-tk-brand",
                  kind === choice.kind
                    ? "border-tk-brand bg-tk-brand-soft"
                    : "border-tk-line hover:border-tk-brand",
                )}
              >
                <input
                  type="radio"
                  name="kind"
                  value={choice.kind}
                  checked={kind === choice.kind}
                  onChange={() => setKind(choice.kind)}
                  className="sr-only"
                />
                <span className="text-[15px] font-semibold">{choice.label}</span>
                <span className="text-[13px] text-tk-muted">{choice.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-4 rounded-[18px] border-2 border-dashed bg-tk-surface/80 px-6 py-10 text-center transition-colors",
            dragging ? "border-tk-brand bg-tk-brand-soft" : "border-tk-line",
          )}
        >
          <p className="text-lg font-semibold">Drop photos or PDFs here</p>
          <p id={hintId} className="max-w-[56ch] text-tk-muted">
            Up to 5 GB at a time, 200 MB a file. A photo is one page; a PDF counts each page. Lay
            receipts flat in good light and fit the whole page in the photo.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className={buttonPrimary}
            >
              <Camera aria-hidden className="size-5" />
              Scan with camera
            </button>
            <button
              type="button"
              onClick={() => pickerRef.current?.click()}
              className={buttonOutline}
            >
              <FolderOpen aria-hidden className="size-5" />
              Choose files
            </button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-describedby={hintId}
            onChange={(event) => event.target.files && addFiles(event.target.files)}
          />
          <input
            ref={pickerRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            className="sr-only"
            aria-describedby={hintId}
            onChange={(event) => event.target.files && addFiles(event.target.files)}
          />
        </div>

        {queue.length > 0 ? (
          <section aria-labelledby="to-upload-title" className="flex flex-col gap-2">
            <h2 id="to-upload-title" className="font-semibold">
              Files to upload
            </h2>
            <p className="text-sm text-tk-muted">
              Proceed on a file saves that file only: it is stored and waits to be read. Proceed All
              saves every file and reads them.
            </p>
            <ul className="flex flex-col gap-2">
              {queue.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-[14px] border border-tk-line bg-tk-surface p-3"
                >
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="size-14 shrink-0 rounded-[10px] object-cover"
                    />
                  ) : (
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[10px] bg-tk-surface-2 text-tk-muted">
                      <FileText aria-hidden className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.file.name}</p>
                    <p className="text-sm text-tk-muted">
                      {fileSize(item.file.size)}
                      {item.isPdf && item.pages
                        ? ` · ${item.pages} page${item.pages === 1 ? "" : "s"}`
                        : ""}{" "}
                      ·{" "}
                      <select
                        aria-label={`Type of ${item.file.name}`}
                        value={item.kind}
                        onChange={(event) =>
                          setQueue((current) =>
                            current.map((q) =>
                              q.id === item.id
                                ? { ...q, kind: event.target.value as DocumentKind }
                                : q,
                            ),
                          )
                        }
                        className="max-w-full rounded-[6px] bg-transparent font-medium text-tk-ink"
                      >
                        {KIND_CHOICES.map((choice) => (
                          <option key={choice.kind} value={choice.kind}>
                            {DOCUMENT_KIND_LABEL[choice.kind]}
                          </option>
                        ))}
                      </select>
                    </p>
                    {item.problem ? (
                      <p className="mt-1 text-sm text-tk-danger">
                        {FILE_PROBLEM_TEXT[item.problem]}
                      </p>
                    ) : item.checking ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-tk-muted">
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                        {item.isPdf ? "Counting pages…" : "Checking the photo…"}
                      </p>
                    ) : !fits(item) ? (
                      <p className="mt-1 text-sm text-tk-danger">
                        This file does not fit in the storage that is free.
                      </p>
                    ) : item.photoFlags.length ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-tk-warn">
                        <TriangleAlert aria-hidden className="size-4" />
                        This photo {item.photoFlags.map((f) => PHOTO_FLAG_TEXT[f]).join(" and ")}.
                        Retake it, or keep it and we will check it.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-tk-brand">Looks good</p>
                    )}
                    {!item.problem && !item.checking ? (
                      <button
                        type="button"
                        onClick={() => void saveOne(item)}
                        disabled={busy || !fits(item)}
                        title="Saves this file only. It is stored and waits to be read."
                        aria-label={`Proceed with ${item.file.name} only: save it without reading it`}
                        className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-[9px] bg-tk-brand px-3 text-sm font-semibold text-white transition-colors hover:bg-tk-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ArrowRight aria-hidden className="size-4" />
                        Proceed
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    disabled={busy}
                    aria-label={`Remove ${item.file.name}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-tk-muted hover:bg-tk-danger-soft hover:text-tk-danger"
                  >
                    <Trash2 aria-hidden className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {waiting.length > 0 ? (
          <section aria-labelledby="saved-title" className="flex flex-col gap-2">
            <h2 id="saved-title" className="font-semibold">
              Saved, waiting to be read
            </h2>
            <p className="text-sm text-tk-muted">
              These files are stored. Read one by one, or press Proceed All to read them all.
            </p>
            <ul className="flex flex-col gap-2">
              {waiting.map((doc) => {
                const pagesShort = !doc.inRun && quoteRun(doc.pageCount, quoteOptions).blocked;
                return (
                  <li
                    key={doc.id}
                    className="flex items-center gap-3 rounded-[14px] border border-tk-line bg-tk-surface p-3"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-tk-surface-2 text-tk-muted">
                      <FileText aria-hidden className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/documents/$documentId"
                        params={{ documentId: doc.id }}
                        search={clientAccountId ? { account: clientAccountId } : {}}
                        className="block truncate font-medium hover:underline"
                      >
                        {doc.fileName}
                      </Link>
                      <p className="text-sm text-tk-muted">
                        {fileSize(doc.bytes)} · {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
                        {doc.inRun ? " · its reading did not finish" : ""}
                      </p>
                      {pagesShort ? (
                        <p className="mt-1 text-sm text-tk-danger">
                          Not enough pages left to read this file.
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void readOne(doc)}
                      disabled={busy || pagesShort}
                      aria-label={`Read ${doc.fileName} only`}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-[9px] border border-tk-brand px-3 text-sm font-semibold text-tk-brand transition-colors hover:bg-tk-brand-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <BookOpenCheck aria-hidden className="size-4" />
                      Read
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {(stage.step === "reading" || stage.step === "done") && stage.documents.length > 0 ? (
          <section aria-labelledby="reading-title" className="flex flex-col gap-2">
            <h2 id="reading-title" className="font-semibold">
              {stage.step === "done" ? "Your documents are read" : "Reading your documents"}
            </h2>
            <ul className="flex flex-col gap-2">
              {stage.documents.map((document) => (
                <li
                  key={document.id}
                  className="rounded-[14px] border border-tk-line bg-tk-surface p-3 sm:p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <FileText aria-hidden className="size-4 shrink-0 text-tk-muted" />
                    {stage.step === "done" ? (
                      <Link
                        to="/app/documents/$documentId"
                        params={{ documentId: document.id }}
                        search={clientAccountId ? { account: clientAccountId } : {}}
                        className="min-w-0 truncate font-medium text-tk-brand hover:underline"
                      >
                        {document.fileName}
                      </Link>
                    ) : (
                      <span className="min-w-0 truncate font-medium">{document.fileName}</span>
                    )}
                  </div>
                  <ReadingProgress
                    status={document.status}
                    pages={document.pages}
                    pagesRead={document.pagesRead}
                    fileName={document.fileName}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <section
          aria-labelledby="run-summary-title"
          className="rounded-[18px] border border-tk-line bg-tk-surface p-5"
        >
          <h2 id="run-summary-title" className="font-semibold">
            Proceed All
          </h2>
          <p className="mt-1 text-sm text-tk-muted">
            Saves every file picked and reads everything that is saved and not read yet.
          </p>
          <div aria-live="polite" className="mt-3 flex flex-col gap-2 text-[15px]/[22px]">
            {nothingToDo ? (
              <p className="text-tk-muted">Add photos or PDFs to see how many pages they are.</p>
            ) : counting ? (
              <p className="flex items-center gap-2 text-tk-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Counting pages…
              </p>
            ) : (
              <>
                {message.map((line, index) => (
                  <p
                    key={line}
                    className={cn(
                      index > 0 &&
                        "rounded-[10px] border border-tk-accent/40 bg-tk-warn-soft px-3 py-2 text-[14px]/[20px]",
                    )}
                  >
                    {line}
                  </p>
                ))}
                {unfinished.length > 0 ? (
                  <p className="text-sm text-tk-muted">
                    {unfinished.length} saved file{unfinished.length === 1 ? "" : "s"} whose reading
                    did not finish will be read again, with no new pages used.
                  </p>
                ) : null}
                <dl className="mt-1 flex flex-col gap-2 border-t border-tk-line pt-3">
                  {totalPages > 0 && !quote.blocked ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-tk-muted">After this</dt>
                      <dd className="text-right text-sm">{pagesNote}</dd>
                    </div>
                  ) : null}
                  {account && batchBytes > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-tk-muted">Storage</dt>
                      <dd className="text-right text-sm">
                        {sizeText(batchBytes)} to save, {sizeText(room.free)} free
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3">
                    <dt className="text-tk-muted">Total</dt>
                    <dd className="text-right">
                      <span className="font-tk-mono text-lg font-medium tabular-nums">
                        {pesoText(quote.total)}
                      </span>
                      <span className="block text-sm text-tk-muted">{quote.summary}</span>
                    </dd>
                  </div>
                </dl>
              </>
            )}
            {tooBig ? (
              <p role="alert" className="text-sm text-tk-danger">
                These files add up to {fileSize(batchBytes)}. Upload up to 5 GB at a time.
              </p>
            ) : null}
            {!room.ok ? (
              <p role="alert" className="text-sm text-tk-danger">
                These files take {sizeText(batchBytes)} and only {sizeText(room.free)} of the{" "}
                {sizeText(room.limit)} storage is free. Remove some files here, or delete files you
                no longer need in Documents.
              </p>
            ) : null}
            {quote.blocked && ready.length > 0 ? (
              <p className="text-sm text-tk-muted">
                You can still save a file with its own Proceed button and read it later.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void proceedAll()}
            disabled={cannotProceedAll}
            className={`${buttonPrimary} mt-4 w-full scroll-mt-24`}
          >
            {stage.step === "working" ? (
              <>
                <Loader2 aria-hidden className="size-5 animate-spin" /> {stage.message}
              </>
            ) : stage.step === "reading" ? (
              <>
                <Loader2 aria-hidden className="size-5 animate-spin" /> Reading…
              </>
            ) : (
              "Proceed All"
            )}
          </button>
          <p className="mt-3 text-[13px]/[18px] text-tk-muted">
            {!PAYMENTS_LIVE
              ? `During launch, ${clientAccountId ? "each client's" : "your"} first ${PRICING.runPages} pages are read free, counted across all uploads. More pages (${pesoText(PRICING.extraPage)} each) and Premium are coming soon.`
              : `${
                  clientAccountId
                    ? `Your partner price: ${pesoText(PARTNER_RUN_PRICE)} for a run of ${PRICING.runPages} pages for this client, then ${pesoText(PRICING.extraPage)} a page.`
                    : `Your first ${PRICING.trialPages} pages are free. Then ${pesoText(PRICING.runPrice)} buys a run of ${PRICING.runPages} pages that lasts across uploads, then ${pesoText(PRICING.extraPage)} a page. Premium covers ${PRICING.premiumPages.toLocaleString("en-PH")} pages a month, then ${pesoText(PRICING.premiumExtraPage)} a page.`
                } Payment goes through Xendit (GCash, Maya or card); the final price is confirmed at checkout.`}
          </p>
        </section>

        {stage.step === "reading" ? (
          <div role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3">
            <p className="mb-2 font-medium text-tk-brand">All documents in this run</p>
            {stage.documents.length ? (
              <RunReadingProgress documents={stage.documents} />
            ) : (
              <ReadingProgress status="reading" pages={stage.pages} pagesRead={stage.pagesRead} />
            )}
            <p className="mt-2 text-sm text-tk-ink/80">
              You can leave this page. Reading carries on, and results appear in Documents.
            </p>
          </div>
        ) : null}
        {stage.step === "saved" ? (
          <p role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
            Saved. {stage.files === 1 ? "The file is" : `${stage.files} files are`} stored and
            waiting to be read: press Read on {stage.files === 1 ? "it" : "them"}, or Proceed All.
          </p>
        ) : null}
        {stage.step === "started" ? (
          <p role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
            Reading has started again. Results appear in Documents.
          </p>
        ) : null}
        {stage.step === "storage_not_connected" ? (
          <NotConnectedNotice title="File storage is not connected yet">
            Your files were checked here, but nothing was uploaded. Uploading turns on once the
            Cloudflare R2 storage and the database are connected.
          </NotConnectedNotice>
        ) : null}
        {stage.step === "payments_not_connected" ? (
          <NotConnectedNotice title="Payments are not connected yet">
            {stage.uploaded} file{stage.uploaded === 1 ? " was" : "s were"} uploaded. They will be
            read once you pay, after Takatax connects payments. Free-trial and Premium pages are
            read without paying.
          </NotConnectedNotice>
        ) : null}
        {stage.step === "reader_not_connected" ? (
          <NotConnectedNotice title="The AI reader is not connected yet">
            {stage.uploaded > 0
              ? `${stage.uploaded} file${stage.uploaded === 1 ? " was" : "s were"} uploaded and will be read once the reader's keys are added.`
              : "Your documents will be read once the reader's keys are added."}
          </NotConnectedNotice>
        ) : null}
        {stage.step === "done" ? (
          <p role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
            Done. {stage.read} read{stage.needsReview ? `, ${stage.needsReview} to check` : ""}.
          </p>
        ) : null}
        {stage.step === "error" ? (
          <p role="alert" className="rounded-[12px] bg-tk-danger-soft px-4 py-3 text-tk-danger">
            {stage.message}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
