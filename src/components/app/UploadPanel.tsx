/**
 * Upload and scan: pick or photograph documents, check each photo in the browser (blur,
 * darkness, glare), show the price, then upload to Cloudflare R2 and start the AI reader.
 *
 * The storage and reader steps call edge functions that are not connected yet; the screen says
 * so and keeps the files listed here. See docs/MISSING_PIECES.md.
 */

import { Camera, FileText, FolderOpen, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@shared/parser/schema.ts";
import {
  ACCEPT_ATTRIBUTE,
  FILE_PROBLEM_TEXT,
  type FileProblem,
  PRICING,
  checkFile,
  quoteRun,
} from "@shared/uploads/rules.ts";
import { buttonOutline, buttonPrimary } from "@/components/site/styles";
import { supabase } from "@/integrations/supabase/client";
import { fileSize, peso } from "@/lib/money";
import { startReading } from "@/lib/services/reader";
import { putToStorage, requestUploadSlots } from "@/lib/services/uploads";
import { PHOTO_FLAG_TEXT, type PhotoFlag, preparePhoto } from "@/lib/uploads/photo-prep";
import { cn } from "@/lib/utils";

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
  previewUrl: string | null;
  problem: FileProblem | null;
  photoFlags: PhotoFlag[];
  prepared: { blob: Blob; mimeType: string } | null;
  checking: boolean;
}

type Stage =
  | { step: "idle" }
  | { step: "working"; message: string }
  | { step: "storage_not_connected" }
  | { step: "reader_not_connected"; uploaded: number }
  | { step: "done"; read: number; needsReview: number }
  | { step: "error"; message: string };

export function UploadPanel({ initialKind }: { initialKind: DocumentKind }) {
  const [kind, setKind] = useState<DocumentKind>(initialKind);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [stage, setStage] = useState<Stage>({ step: "idle" });
  const [dragging, setDragging] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

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
      return {
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        kind,
        previewUrl: !problem && file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        problem,
        photoFlags: [],
        prepared: null,
        checking: !problem,
      };
    });
    setQueue((current) => [...current, ...added]);
    setStage({ step: "idle" });
    // Check photos one at a time so a phone stays responsive with many of them.
    void (async () => {
      for (const item of added) {
        if (item.problem) continue;
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

  const ready = queue.filter((q) => !q.problem);
  const quote = quoteRun(ready.length, { trialAvailable: true });
  const busy = stage.step === "working" || ready.some((q) => q.checking);

  const upload = async () => {
    if (!ready.length) return;
    setStage({ step: "working", message: "Preparing your account…" });

    // MISSING: needs the migration applied (ensure_my_account). Payment (PayMongo or Xendit)
    // goes here too, before anything is read, once checkout exists.
    const { data: accountId, error } = await supabase.rpc("ensure_my_account" as never);
    const account = typeof accountId === "string" ? accountId : "";
    if (error || !account) {
      setStage({ step: "storage_not_connected" });
      return;
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

    setStage({ step: "working", message: "Reading your documents…" });
    const result = await startReading(
      account,
      slots.data.slots.map((s) => s.documentId),
    );
    if (!result.ok) {
      setStage(
        result.reason === "not_connected"
          ? { step: "reader_not_connected", uploaded }
          : { step: "error", message: result.message },
      );
      return;
    }
    setStage({ step: "done", read: result.data.read, needsReview: result.data.needsReview });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-5">
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
          <p id={hintId} className="max-w-[52ch] text-tk-muted">
            Up to 10 MB each. Lay the receipt flat in good light, and fit the whole page in the
            photo.
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
                    {fileSize(item.file.size)} ·{" "}
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
                      <Loader2 aria-hidden className="size-4 animate-spin" /> Checking the photo…
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
        <div className="rounded-[18px] border border-tk-line bg-tk-surface p-5">
          <h2 className="font-semibold">This run</h2>
          <dl className="mt-3 flex flex-col gap-2 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt className="text-tk-muted">Documents</dt>
              <dd className="font-tk-mono tabular-nums">{ready.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-tk-muted">Price</dt>
              <dd className="font-tk-mono font-medium tabular-nums">{peso(quote.total)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-sm text-tk-muted">{quote.summary}</p>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={busy || ready.length === 0}
            className={`${buttonPrimary} mt-4 w-full`}
          >
            {stage.step === "working" ? (
              <>
                <Loader2 aria-hidden className="size-5 animate-spin" /> {stage.message}
              </>
            ) : quote.total > 0 ? (
              `Pay ${peso(quote.total)} and read`
            ) : (
              "Upload and read"
            )}
          </button>
          <p className="mt-3 text-[13px]/[18px] text-tk-muted">
            Your first {PRICING.trialDocuments} documents are free. Then ₱{PRICING.runPrice} reads
            up to {PRICING.runDocuments}; extra documents are ₱{PRICING.extraDocument} each. No
            parse, no fee.
          </p>
        </div>

        {stage.step === "storage_not_connected" ? (
          <NotConnectedNotice title="File storage is not connected yet">
            Your files were checked here, but nothing was uploaded. Uploading turns on once the
            Cloudflare R2 storage and the database are connected.
          </NotConnectedNotice>
        ) : null}
        {stage.step === "reader_not_connected" ? (
          <NotConnectedNotice title="The AI reader is not connected yet">
            {stage.uploaded} file{stage.uploaded === 1 ? " was" : "s were"} uploaded and will be
            read once the AI key is added.
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
