/**
 * The two usage meters of an account, "AI doc parsing" and "Doc storage", each as used / limit
 * with a bar: "75 / 80 pages", "240 MB / 300 MB". Shown on the Documents tab and on the account
 * settings page. The wording is in `@/lib/account/usage`, the limits in `@shared/uploads/usage`.
 */

import { Link } from "@tanstack/react-router";
import { HardDrive, ScanText } from "lucide-react";
import type { ReactNode } from "react";

import { textLink } from "@/components/site/styles";
import { type MeterView, usageView } from "@/lib/account/usage";
import { useUsage } from "@/lib/data/queries";
import { cn } from "@/lib/utils";

import { Card, Tag } from "./ui";

const BAR_TONE: Record<MeterView["tone"], string> = {
  brand: "bg-tk-brand",
  warn: "bg-tk-warn",
  danger: "bg-tk-danger",
};

function UsageMeter({ view, icon }: { view: MeterView; icon: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="flex items-center gap-2 font-medium">
          {icon}
          {view.title}
        </p>
        <p className="font-tk-mono text-[15px] font-medium tabular-nums">{view.figure}</p>
      </div>
      <div
        role="meter"
        aria-label={view.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.meter.percent}
        aria-valuetext={view.spoken}
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-tk-surface-2"
      >
        <div
          className={cn("h-full rounded-full", BAR_TONE[view.tone])}
          // A sliver shows as soon as anything is used, so 1 of 80 is not an empty bar.
          style={{ width: `${view.meter.used > 0 ? Math.max(view.meter.percent, 2) : 0}%` }}
        />
      </div>
      <p className="mt-1.5 text-sm/5 text-tk-muted text-pretty">{view.note}</p>
    </div>
  );
}

export function UsageMeters({
  userId,
  settingsLink = false,
}: {
  userId: string;
  /** Adds a link to the account settings page (off on that page itself). */
  settingsLink?: boolean;
}) {
  const query = useUsage(userId);
  // The Documents tab works without the meters: say nothing if they cannot be loaded.
  if (query.isError) return null;

  const view = query.data ? usageView(query.data.data) : null;
  return (
    <Card aria-labelledby="usage-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="usage-title" className="flex items-center gap-2 font-semibold">
          Your usage
          {view ? <Tag tone="brand">{view.tierLabel}</Tag> : null}
        </h2>
        {settingsLink ? (
          <Link to="/app/settings" className={`${textLink} text-sm`}>
            Account settings
          </Link>
        ) : null}
      </div>
      {view ? (
        <div className="grid gap-5 md:grid-cols-2 md:gap-8">
          <UsageMeter
            view={view.pages}
            icon={<ScanText aria-hidden className="size-[18px] text-tk-brand" />}
          />
          <UsageMeter
            view={view.storage}
            icon={<HardDrive aria-hidden className="size-[18px] text-tk-brand" />}
          />
        </div>
      ) : (
        <p role="status" className="py-3 text-sm text-tk-muted">
          Loading your usage…
        </p>
      )}
    </Card>
  );
}
