/**
 * The words and figures of the two usage meters, "AI doc parsing" and "Doc storage", shown on
 * the Documents tab and on the account settings page. The counting rules and the limits are in
 * `@shared/uploads/usage.ts`; this file only turns them into what the screen says.
 */

import { PAYMENTS_LIVE, PRICING, pesoText } from "@shared/uploads/rules.ts";
import {
  type Meter,
  type Tier,
  meter,
  pageLimit,
  sizeText,
  storageLimit,
} from "@shared/uploads/usage.ts";
import type { AccountUsage } from "@/lib/data/types";
import { shortDay } from "@/lib/time";

export interface MeterView {
  /** What is measured: "AI doc parsing". */
  title: string;
  /** Used and limit: "75 / 80 pages". */
  figure: string;
  /** The same for screen readers: "75 of 80 pages". */
  spoken: string;
  /** One or two short sentences under the bar. */
  note: string;
  meter: Meter;
  /** The bar's colour: green, amber when nearly full, red when full. */
  tone: "brand" | "warn" | "danger";
}

export interface UsageView {
  tier: Tier;
  /** "Standard" or "Premium". */
  tierLabel: string;
  pages: MeterView;
  storage: MeterView;
}

export const TIER_LABEL: Record<Tier, string> = { standard: "Standard", premium: "Premium" };

const count = (value: number) => value.toLocaleString("en-PH");
const plural = (value: number, one: string, many = `${one}s`) =>
  `${count(value)} ${value === 1 ? one : many}`;

function pagesView(usage: AccountUsage, paymentsLive: boolean): MeterView {
  const measured = meter(usage.pagesUsed, pageLimit(usage.tier));
  const figure = `${count(measured.used)} / ${count(measured.limit)} pages`;
  const spoken = `${count(measured.used)} of ${plural(measured.limit, "page")}`;
  const base = { title: "AI doc parsing", figure, spoken, meter: measured };

  if (usage.tier === "premium") {
    const until = usage.premiumUntil ? ` Premium runs until ${shortDay(usage.premiumUntil)}.` : "";
    return {
      ...base,
      note:
        measured.over > 0
          ? `${plural(measured.over, "page")} over this month's ${count(measured.limit)}, at ${pesoText(PRICING.premiumExtraPage)} each.${until}`
          : `${plural(measured.left, "page")} left this Premium month.${until}`,
      tone: measured.level === "ok" ? "brand" : "warn",
    };
  }

  // Standard: every upload is its own run, so the bar is the latest run's and never a warning.
  const perRun = paymentsLive
    ? `Each upload starts a new run: ${pesoText(PRICING.runPrice)} for up to ${count(measured.limit)} pages, then ${pesoText(PRICING.extraPage)} a page.`
    : `Each upload starts a new run of up to ${count(measured.limit)} pages, free during launch.`;
  if (usage.pagesUsed === 0 && usage.pagesReadInAll === 0) {
    return { ...base, note: `Nothing read yet. ${perRun}`, tone: "brand" };
  }
  const soFar =
    usage.pagesReadInAll > 0 ? ` ${plural(usage.pagesReadInAll, "page")} read so far.` : "";
  return { ...base, note: `Your latest run. ${perRun}${soFar}`, tone: "brand" };
}

function storageView(usage: AccountUsage, paymentsLive: boolean): MeterView {
  const measured = meter(usage.storageBytes, storageLimit(usage.tier));
  const used = sizeText(measured.used);
  const limit = sizeText(measured.limit);
  const files = usage.files > 0 ? `${plural(usage.files, "file")} stored.` : "No files stored yet.";
  let note = `${files} ${sizeText(measured.left)} free.`;
  if (measured.level === "near") note = `${files} Almost full: ${sizeText(measured.left)} free.`;
  if (measured.level === "full") {
    note =
      usage.tier === "premium"
        ? `${files} Storage is full.`
        : `${files} Storage is full. Premium${paymentsLive ? "" : " (coming soon)"} comes with ${PRICING.premiumStorageGb} GB.`;
  }
  return {
    title: "Doc storage",
    figure: `${used} / ${limit}`,
    spoken: `${used} of ${limit}`,
    note,
    meter: measured,
    tone: measured.level === "full" ? "danger" : measured.level === "near" ? "warn" : "brand",
  };
}

/** What the two meters say for this account. */
export function usageView(
  usage: AccountUsage,
  options: { paymentsLive?: boolean } = {},
): UsageView {
  const paymentsLive = options.paymentsLive ?? PAYMENTS_LIVE;
  return {
    tier: usage.tier,
    tierLabel: TIER_LABEL[usage.tier],
    pages: pagesView(usage, paymentsLive),
    storage: storageView(usage, paymentsLive),
  };
}
