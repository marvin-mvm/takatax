/**
 * A document's reading progress bar. Real pages-done come from the reader (every few seconds);
 * between them the bar moves at the reading's own pace (src/lib/reading-progress.ts), so it
 * neither sits still nor jumps, and it reaches 100% only when the reader says the document is
 * done.
 */

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DocumentStatus } from "@/lib/data/types";
import {
  estimateProgress,
  expectedSeconds,
  observedPace,
  timeLeftText,
  type ProgressInput,
} from "@/lib/reading-progress";
import type { RunDocumentProgress } from "@/lib/services/uploads";
import { cn } from "@/lib/utils";

const DONE_LABEL: Partial<Record<DocumentStatus, string>> = {
  accepted: "Read",
  needs_review: "Read · please check",
  rejected: "Read · not a tax document",
};

function phaseOf(status: DocumentStatus): ProgressInput["phase"] {
  if (status === "accepted" || status === "needs_review" || status === "rejected") return "done";
  return status === "reading" ? "reading" : "waiting";
}

interface Track {
  startedAt: number;
  lastChangeAt: number;
  samples: { at: number; pagesRead: number }[];
}

export function ReadingProgress({
  status,
  pages,
  pagesRead,
  fileName,
  compact = false,
  className,
}: {
  status: DocumentStatus;
  pages: number;
  pagesRead: number;
  /** For screen readers: which document this bar is for. */
  fileName?: string;
  /** A thin bar with a short label, for tables. */
  compact?: boolean;
  className?: string;
}) {
  const phase = phaseOf(status);
  const track = useRef<Track | null>(null);
  const [shown, setShown] = useState(phase === "done" ? 1 : 0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Start timing when reading starts; note each real update the reader sends.
  useEffect(() => {
    if (phase !== "reading") {
      track.current = null;
      setShown(phase === "done" ? 1 : 0);
      setSecondsLeft(phase === "done" ? 0 : null);
      return;
    }
    const now = Date.now();
    if (!track.current) {
      track.current = { startedAt: now, lastChangeAt: now, samples: [{ at: now, pagesRead }] };
      return;
    }
    const last = track.current.samples.at(-1);
    if (last && pagesRead > last.pagesRead) {
      track.current.lastChangeAt = now;
      track.current.samples.push({ at: now, pagesRead });
    }
  }, [phase, pagesRead]);

  // While reading, move the bar a few times a second (never backwards).
  useEffect(() => {
    if (phase !== "reading") return;
    const tick = () => {
      const t = track.current;
      if (!t) return;
      const estimate = estimateProgress({
        phase,
        pages,
        pagesRead,
        startedAt: t.startedAt,
        lastChangeAt: t.lastChangeAt,
        observedSecondsPerPage: observedPace(t.samples),
        now: Date.now(),
      });
      setShown((previous) => Math.max(previous, estimate.fraction));
      setSecondsLeft(estimate.secondsLeft);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [phase, pages, pagesRead]);

  const percent = Math.round(shown * 100);
  const label =
    phase === "done"
      ? (DONE_LABEL[status] ?? "Read")
      : phase === "waiting"
        ? status === "waiting_for_storage"
          ? "Not uploaded yet"
          : compact
            ? "In line to be read"
            : "In line to be read. It starts as soon as the one before it is done."
        : pages > 1
          ? `Reading · ${pagesRead.toLocaleString("en-PH")} of ${pages.toLocaleString("en-PH")} pages`
          : "Reading…";
  const timeLeft = phase === "reading" ? timeLeftText(secondsLeft) : "";

  return (
    <div className={cn("min-w-0", compact ? "w-full min-w-[150px] max-w-[220px]" : "", className)}>
      {!compact ? (
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium",
              phase === "done" ? "text-tk-brand" : "text-tk-ink",
            )}
          >
            {phase === "reading" ? (
              <Loader2 aria-hidden className="size-4 animate-spin text-tk-brand" />
            ) : phase === "done" ? (
              <Check aria-hidden className="size-4" />
            ) : null}
            {label}
          </span>
          {timeLeft ? <span className="text-tk-muted">{timeLeft}</span> : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={fileName ? `Reading ${fileName}` : "Reading progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={[label, timeLeft].filter(Boolean).join(", ")}
        className={cn("overflow-hidden rounded-full bg-tk-surface-2", compact ? "h-1.5" : "h-2.5")}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-linear",
            phase === "done" && status === "needs_review" ? "bg-tk-warn" : "bg-tk-brand",
          )}
          style={{ width: `${phase === "waiting" ? 0 : Math.max(percent, 2)}%` }}
        />
      </div>
      {compact ? (
        <p className="mt-1 truncate text-[12px] text-tk-muted" title={timeLeft || undefined}>
          {label}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The whole run's bar. Documents are read one after another, and a photo and a 200-page PDF read
 * at very different speeds, so each document counts by how long it takes to read (not by its
 * pages), and the time left is what each unfinished document still needs.
 */
export function RunReadingProgress({ documents }: { documents: RunDocumentProgress[] }) {
  const tracks = useRef(new Map<string, Track>());
  const [shown, setShown] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Note when each document starts reading and each real update.
  useEffect(() => {
    const now = Date.now();
    for (const document of documents) {
      const phase = phaseOf(document.status);
      const track = tracks.current.get(document.id);
      if (phase !== "reading") {
        tracks.current.delete(document.id);
        continue;
      }
      if (!track) {
        tracks.current.set(document.id, {
          startedAt: now,
          lastChangeAt: now,
          samples: [{ at: now, pagesRead: document.pagesRead }],
        });
      } else if (document.pagesRead > (track.samples.at(-1)?.pagesRead ?? 0)) {
        track.lastChangeAt = now;
        track.samples.push({ at: now, pagesRead: document.pagesRead });
      }
    }
  }, [documents]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      let total = 0;
      let done = 0;
      let left = 0;
      for (const document of documents) {
        const weight = expectedSeconds(document.pages);
        total += weight;
        const phase = phaseOf(document.status);
        if (phase === "done") {
          done += weight;
          continue;
        }
        const track = tracks.current.get(document.id);
        if (phase === "reading" && track) {
          const estimate = estimateProgress({
            phase,
            pages: document.pages,
            pagesRead: document.pagesRead,
            startedAt: track.startedAt,
            lastChangeAt: track.lastChangeAt,
            observedSecondsPerPage: observedPace(track.samples),
            now,
          });
          done += weight * estimate.fraction;
          left += estimate.secondsLeft ?? weight;
        } else {
          left += weight;
        }
      }
      setShown((previous) => Math.max(previous, total ? Math.min(done / total, 0.99) : 0));
      setSecondsLeft(Math.round(left));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [documents]);

  const finished = documents.filter((d) => phaseOf(d.status) === "done").length;
  const pages = documents.reduce((sum, d) => sum + d.pages, 0);
  const pagesRead = documents.reduce((sum, d) => sum + d.pagesRead, 0);
  const percent = Math.round(shown * 100);
  const label = `${finished} of ${documents.length} document${documents.length === 1 ? "" : "s"} read · ${pagesRead.toLocaleString("en-PH")} of ${pages.toLocaleString("en-PH")} pages`;
  const timeLeft = timeLeftText(secondsLeft);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-tk-ink">
          <Loader2 aria-hidden className="size-4 animate-spin text-tk-brand" />
          {label}
        </span>
        {timeLeft ? <span className="text-tk-muted">{timeLeft}</span> : null}
      </div>
      <div
        role="progressbar"
        aria-label="Reading this run"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={[label, timeLeft].filter(Boolean).join(", ")}
        className="h-2.5 overflow-hidden rounded-full bg-tk-surface-2"
      >
        <div
          className="h-full rounded-full bg-tk-brand transition-[width] duration-300 ease-linear"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}
