/**
 * Upload and scan: pick or photograph documents, check each photo in the browser (blur,
 * darkness, glare), count every PDF's pages, and show what the run will cost before anything
 * is uploaded: "You uploaded 10 JPG and 2 PDF files with 50 total combined pages." Proceed then
 * uploads to Cloudflare R2, pays (or uses the free trial or Premium) and starts the reader.
 *
 * Steps after Proceed: ensure the account -> signed upload links -> PUT each file to R2 ->
 * confirm-upload -> create-checkout (free: read now; paid: the payment provider, then back here with ?run=)
 * -> read-documents, which starts a Trigger.dev job -> progress from the run's row.
 * Each step that needs a key says so plainly when it is missing. See docs/MISSING_PIECES.md.
 */

import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, FileText, FolderOpen, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@shared/parser/schema.ts";
import {
  ACCEPT_ATTRIBUTE,
  FILE_PROBLEM_TEXT,
  type FileProblem,
  MAX_BATCH_BYTES,
  PRICING,
  batchMessage,
  checkFile,
  quoteRun,
} from "@shared/uploads/rules.ts";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { supabase } from "@/integrations/supabase/client";
import { usePlan } from "@/lib/data/queries";
import { loadRunProgress } from "@/lib/data/repository";
import { fileSize, peso } from "@/lib/money";
import { checkoutRun } from "@/lib/services/payments";
import { startReading } from "@/lib/services/reader";
import { confirmUploads, putToStorage, requestUploadSlots } from "@/lib/services/uploads";
import { countPdfPages } from "@/lib/uploads/pdf-pages";
import { PHOTO_FLAG_TEXT, type PhotoFlag, preparePhoto } from "@/lib/uploads/photo-prep";
import { cn } from "@/lib/utils";

import { useAppUser } from "./app-user";
import { NotConnectedNotice } from "./ui";

const KIND_CHOICES: { kind: DocumentKind; label: string; hint: string }[] = [
  { kind: "expense_receipt", label: "Receipts and purchases", hint: "What you paid suppliers" },
  { kind: "sales_invoice", label: "Sales and collections", hint: "Invoices you issued" },
  { kind: "form_2307", label: "Withholding (2307)", hint: "From clients who withheld tax" },
  { kind: "cor", label: "COR (Form 2303)", hint: "Your registration" },
  { kind: "unknown", label: "Not sure", hint: "The AI will sort it" },
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
  | { step: "reading"; pages: number; pagesRead: number }
  | { step: "storage_not_connected" }
  | { step: "payments_not_connected"; uploaded: number }
  | { step: "reader_not_connected"; uploaded: number }
  | { step: "done"; read: number; needsReview: number }
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

  // ---- What the person is about to run: pages, limit and price ------------------------------
  const ready = queue.filter((q) => !q.problem);
  const counting = ready.some((q) => q.checking);
  const images = ready.filter((q) => !q.isPdf);
  const pdfs = ready.filter((q) => q.isPdf);
  const pdfPages = pdfs.reduce((sum, q) => sum + (q.pages ?? 0), 0);
  const totalPages = images.length + pdfPages;
  const batchBytes = ready.reduce((sum, q) => sum + (q.prepared?.blob.size ?? q.file.size), 0);
  const tooBig = batchBytes > MAX_BATCH_BYTES;
  const premiumLeft = clientAccountId ? null : (plan.data?.data.premiumPagesLeft ?? null);
  // An estimate for the message; create-checkout works out the real price on the server.
  const quote = quoteRun(totalPages, {
    partner: Boolean(clientAccountId),
    trialAvailable: !clientAccountId && plan.data?.data.trialUsed !== true,
    ...(premiumLeft !== null ? { premiumRemaining: premiumLeft } : {}),
  });
  const message =
    ready.length && !counting
      ? batchMessage(
          {
            images: images.length,
            allJpeg: images.every((q) => isJpeg(q.file)),
            pdfs: pdfs.length,
            pdfPages,
          },
          quote,
        )
      : [];
  const busy = stage.step === "working" || stage.step === "reading";

  // ---- Reading: start the Trigger.dev job, then follow its progress -------------------------
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

    // The job runs on Trigger.dev and writes its progress to the run. Follow it while this
    // screen is open; leaving is fine, reading carries on.
    while (mounted.current) {
      const progress = await loadRunProgress(runId);
      if (progress) {
        if (progress.status === "complete" || progress.status === "review") {
          setStage({ step: "done", read: progress.read, needsReview: progress.needsReview });
          void queryClient.invalidateQueries({ queryKey: ["workspace"] });
          void queryClient.invalidateQueries({ queryKey: ["plan"] });
          return;
        }
        setStage({ step: "reading", pages: progress.pages, pagesRead: progress.pagesRead });
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

  /** Proceed: upload, confirm, price on the server, pay if needed, then read. */
  const proceed = async () => {
    if (!ready.length || counting || tooBig) return;
    setStage({ step: "working", message: "Preparing the account…" });

    // A partner uploads into their client's account; a taxpayer into their own (created now if
    // this is their first upload).
    let account = clientAccountId ?? "";
    if (!account) {
      const { data: accountId, error } = await supabase.rpc("ensure_my_account" as never);
      account = typeof accountId === "string" ? accountId : "";
      if (error || !account) {
        setStage({ step: "storage_not_connected" });
        return;
      }
    }

    setStage({ step: "working", message: "Getting upload links…" });
    const slots = await requestUploadSlots(
      account,
      ready.map((q) => ({
        clientId: q.id,
        fileName: q.file.name,
        mimeType: q.prepared?.mimeType ?? q.file.type,
        bytes: q.prepared?.blob.size ?? q.file.size,
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
      return;
    }

    let uploaded = 0;
    for (const slot of slots.data.slots) {
      const item = ready.find((q) => q.id === slot.clientId);
      if (!item) continue;
      setStage({ step: "working", message: `Uploading ${uploaded + 1} of ${ready.length}…` });
      if (
        await putToStorage(
          slot,
          item.prepared?.blob ?? item.file,
          item.prepared?.mimeType ?? item.file.type,
        )
      )
        uploaded++;
    }

    setStage({ step: "working", message: "Checking the uploads…" });
    const confirmed = await confirmUploads(
      account,
      slots.data.slots.map((s) => s.documentId),
    );
    if (!confirmed.ok || confirmed.data.arrived.length === 0) {
      setStage(
        confirmed.ok
          ? { step: "error", message: "None of the files reached storage. Please try again." }
          : confirmed.reason === "not_connected"
            ? { step: "storage_not_connected" }
            : { step: "error", message: confirmed.message },
      );
      return;
    }
    setQueue([]);

    setStage({ step: "working", message: "Working out the price…" });
    const checkout = await checkoutRun(account, confirmed.data.arrived);
    if (!checkout.ok) {
      setStage(
        checkout.reason === "not_connected"
          ? { step: "payments_not_connected", uploaded }
          : { step: "error", message: checkout.message },
      );
      return;
    }
    if (checkout.data.checkoutUrl) {
      setStage({ step: "working", message: "Opening the payment page…" });
      window.location.assign(checkout.data.checkoutUrl);
      return;
    }
    if (checkout.data.runId) await readRun(checkout.data.runId, uploaded);
  };

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
          <ul className="flex flex-col gap-2" aria-label="Files to upload">
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
                      className="rounded-[6px] bg-transparent font-medium text-tk-ink"
                    >
                      {KIND_CHOICES.map((choice) => (
                        <option key={choice.kind} value={choice.kind}>
                          {DOCUMENT_KIND_LABEL[choice.kind]}
                        </option>
                      ))}
                    </select>
                  </p>
                  {item.problem ? (
                    <p className="mt-1 text-sm text-tk-danger">{FILE_PROBLEM_TEXT[item.problem]}</p>
                  ) : item.checking ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-tk-muted">
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                      {item.isPdf ? "Counting pages…" : "Checking the photo…"}
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
        ) : null}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <section
          aria-labelledby="run-summary-title"
          className="rounded-[18px] border border-tk-line bg-tk-surface p-5"
        >
          <h2 id="run-summary-title" className="font-semibold">
            This run
          </h2>
          <div aria-live="polite" className="mt-3 flex flex-col gap-2 text-[15px]/[22px]">
            {ready.length === 0 ? (
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
                <dl className="mt-1 flex justify-between gap-3 border-t border-tk-line pt-3">
                  <dt className="text-tk-muted">Total</dt>
                  <dd className="text-right">
                    <span className="font-tk-mono text-lg font-medium tabular-nums">
                      {peso(quote.total)}
                    </span>
                    <span className="block text-sm text-tk-muted">{quote.summary}</span>
                  </dd>
                </dl>
              </>
            )}
            {tooBig ? (
              <p role="alert" className="text-sm text-tk-danger">
                These files add up to {fileSize(batchBytes)}. Upload up to 5 GB at a time.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void proceed()}
            disabled={busy || counting || tooBig || ready.length === 0}
            className={`${buttonPrimary} mt-4 w-full`}
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
              "Proceed"
            )}
          </button>
          <p className="mt-3 text-[13px]/[18px] text-tk-muted">
            {clientAccountId
              ? `Your partner price: ₱${Math.round(PRICING.runPrice * (1 - PRICING.partnerDiscount))} for up to ${PRICING.runPages} pages for this client, then ₱${PRICING.extraPage} a page.`
              : `Your first ${PRICING.trialPages} pages are free. Then ₱${PRICING.runPrice} reads up to ${PRICING.runPages} pages (Premium: ${PRICING.premiumPages.toLocaleString("en-PH")} a month), then ₱${PRICING.extraPage} a page.`}{" "}
            Payment goes through our payment partner; the final price is confirmed at checkout.
          </p>
        </section>

        {stage.step === "reading" ? (
          <div role="status" className="rounded-[12px] bg-tk-brand-soft px-4 py-3 text-tk-brand">
            <p className="font-medium">
              Reading {stage.pagesRead.toLocaleString("en-PH")} of{" "}
              {stage.pages.toLocaleString("en-PH")} pages…
            </p>
            <div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-tk-brand transition-[width]"
                style={{
                  width: `${stage.pages ? Math.min((stage.pagesRead / stage.pages) * 100, 100) : 5}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm text-tk-ink/80">
              You can leave this page. Reading carries on, and results appear in Documents.
            </p>
          </div>
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
              : "Your paid run will be read once the reader's keys are added."}
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
