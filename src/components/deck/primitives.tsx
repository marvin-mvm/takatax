import { Fragment, useContext, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { SlideMetaContext } from "./slide-meta";

const twoDigits = (value: number) => String(value).padStart(2, "0");

interface SlideProps {
  id: string;
  /** Small label above the title, for example "Phase 1 · Validate and define". */
  eyebrow: string;
  /** Short tag on the right of the eyebrow row, for example "Step 3 of 7". */
  tag?: string;
  title: ReactNode;
  /** The straight answer, in one or two sentences. */
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** One page of the deck: a white card with a title, a straight answer and supporting content. */
export function Slide({ id, eyebrow, tag, title, lead, children, className }: SlideProps) {
  const { number, total } = useContext(SlideMetaContext);

  return (
    <section
      id={id}
      data-slide
      aria-labelledby={`${id}-title`}
      className={cn(
        "deck-slide tk-slide-gradient flex scroll-mt-20 flex-col rounded-[20px] border border-tk-line",
        "px-5 py-8 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_4px_16px_rgb(0_0_0/0.04)]",
        "sm:px-10 sm:py-12 lg:min-h-[620px] lg:px-14 lg:py-14",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-tk-brand">
          {eyebrow}
        </p>
        {tag ? <Pill>{tag}</Pill> : null}
      </div>
      <h2
        id={`${id}-title`}
        className="mt-4 max-w-[24ch] text-[28px]/[34px] font-bold tracking-tight text-balance lg:text-[36px]/[44px]"
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 max-w-[62ch] text-lg/7 text-tk-ink text-pretty lg:text-xl/8">{lead}</p>
      ) : null}
      {children ? <div className="mt-8 flex-1 lg:mt-10">{children}</div> : null}
      <div className="mt-10 flex items-center justify-between font-tk-mono text-xs text-tk-muted">
        <span>Takatax</span>
        <span>
          {twoDigits(number)} / {twoDigits(total)}
        </span>
      </div>
    </section>
  );
}

/** A citation in the form (Primary, 1, 2); each number links to the Sources slide. */
export function Cite({ source, refs }: { source: string; refs: number[] }) {
  return (
    <span className="text-[0.82em] whitespace-nowrap text-tk-muted">
      ({source}
      {refs.map((ref) => (
        <Fragment key={ref}>
          ,{" "}
          <a
            href={`#ref-${ref}`}
            className="underline decoration-tk-line underline-offset-2 hover:text-tk-brand hover:decoration-tk-brand"
          >
            {ref}
          </a>
        </Fragment>
      ))}
      )
    </span>
  );
}

type PillTone = "neutral" | "brand" | "warn";

const pillTones: Record<PillTone, string> = {
  neutral: "bg-tk-surface-2 text-tk-muted",
  brand: "bg-tk-brand-soft text-tk-brand",
  warn: "bg-tk-warn-soft text-tk-warn",
};

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: PillTone }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[13px] font-medium",
        pillTones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A headline figure with a one-line label. Figures use the tabular mono face. */
export function Stat({
  value,
  label,
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[14px] border border-tk-line bg-tk-surface/80 p-5", className)}>
      <p className="font-tk-mono text-[28px]/9 font-medium tracking-tight tabular-nums lg:text-[32px]/10">
        {value}
      </p>
      <p className="mt-2 text-[15px]/[22px] text-tk-muted text-pretty">{label}</p>
    </div>
  );
}

/** A short list with brand dots. Each item reads "Bold start. Then one plain sentence." */
export function Points({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col gap-3", className)}>{children}</ul>;
}

export function Point({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3 text-base/6 text-pretty">
      <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-tk-brand" />
      <span>
        {title ? <strong className="font-semibold">{title} </strong> : null}
        <span className="text-tk-muted">{children}</span>
      </span>
    </li>
  );
}

/** A small titled block used inside slides. */
export function Block({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-tk-muted">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}
