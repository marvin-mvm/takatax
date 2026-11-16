/** Small building blocks shared by the signed-in screens. */

import { Link } from "@tanstack/react-router";
import { Info, Star } from "lucide-react";
import type { ReactNode } from "react";

import type { DataSource, DocumentStatus } from "@/lib/data/types";
import { DOCUMENT_STATUS_LABEL } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px]/[34px] font-bold tracking-tight text-balance sm:text-[32px]/[38px]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-[65ch] text-tk-muted text-pretty">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

/** A white card on the gradient background. */
export function Card({
  children,
  className,
  as: Tag = "section",
  "aria-labelledby": labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  /** The id of the card's heading, so the section is announced by its name. */
  "aria-labelledby"?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cn(
        "rounded-[18px] border border-tk-line bg-tk-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_rgb(0_0_0/0.04)] sm:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** Says plainly when the screen shows the built-in example instead of the user's own data. */
export function SampleDataNotice({
  source,
  what = "an example business",
}: {
  source: DataSource;
  what?: string;
}) {
  if (source !== "sample") return null;
  return (
    <p
      role="note"
      className="flex items-start gap-2.5 rounded-[12px] border border-tk-accent/40 bg-tk-warn-soft px-4 py-3 text-sm/5 text-tk-ink"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-tk-warn" />
      <span>
        <strong className="font-semibold">Sample data.</strong> You are seeing {what} while the
        database is being connected. Your own figures will appear here once your documents are read.
      </span>
    </p>
  );
}

/** Explains that a feature is built but waiting for a key or a connection. */
export function NotConnectedNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-[12px] border border-tk-line bg-tk-surface-2 px-4 py-3 text-sm/5 text-tk-ink"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-tk-muted">{children}</p>
    </div>
  );
}

const STATUS_TONE: Record<DocumentStatus, string> = {
  waiting_for_storage: "bg-tk-surface-2 text-tk-muted",
  waiting_for_reader: "bg-tk-surface-2 text-tk-muted",
  reading: "bg-tk-surface-2 text-tk-muted",
  accepted: "bg-tk-brand-soft text-tk-brand",
  needs_review: "bg-tk-warn-soft text-tk-warn",
  rejected: "bg-tk-danger-soft text-tk-danger",
};

export function StatusPill({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium",
        STATUS_TONE[status],
      )}
    >
      {DOCUMENT_STATUS_LABEL[status]}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium",
        tone === "brand" && "bg-tk-brand-soft text-tk-brand",
        tone === "warn" && "bg-tk-warn-soft text-tk-warn",
        tone === "neutral" && "bg-tk-surface-2 text-tk-muted",
      )}
    >
      {children}
    </span>
  );
}

/** Five stars, filled to the rating, with the number for screen readers and sighted users. */
export function Stars({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={cn(
              "size-4",
              rating >= n - 0.25 ? "fill-tk-accent text-tk-accent" : "fill-tk-line text-tk-line",
            )}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="font-tk-mono text-sm font-medium tabular-nums">{rating.toFixed(1)}</span>
      {count !== undefined ? (
        <span className="text-sm text-tk-muted">
          ({count} review{count === 1 ? "" : "s"})
        </span>
      ) : null}
      <span className="sr-only">{rating.toFixed(1)} out of 5 stars</span>
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[18px] border-2 border-dashed border-tk-line bg-tk-surface/70 px-6 py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children ? <p className="mt-2 max-w-[52ch] text-tk-muted text-pretty">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-semibold text-tk-brand hover:underline">
      ← {children}
    </Link>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" className="py-16 text-center text-tk-muted">
      {label}
    </p>
  );
}
