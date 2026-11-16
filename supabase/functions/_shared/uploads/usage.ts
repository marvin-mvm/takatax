/**
 * What an account has used of its tier: the pages the AI read and the storage its files take.
 * The Documents tab and the account settings page show both as "used / limit". Every limit
 * comes from PRICING, so a change there shows on the screens too.
 *
 * - Standard: a run reads up to 80 pages, and every upload starts a new run, so the pages
 *   counted are the latest run's. Storage: 300 MB.
 * - Premium: 300 pages in the Premium month (the window create-checkout prices by). Storage:
 *   15 GB.
 */

import { PRICING } from "./rules.ts";

export type Tier = "standard" | "premium";

/** Sizes are counted the way the screens print file sizes: 1 MB is 1,000,000 bytes. */
export const MB = 1_000_000;
export const GB = 1_000 * MB;

const DAY = 86_400_000;

/** Premium while its month is running, Standard otherwise. */
export function tierOf(premiumUntil: string | null | undefined, now: number = Date.now()): Tier {
  if (!premiumUntil) return "standard";
  return Date.parse(premiumUntil) > now ? "premium" : "standard";
}

/**
 * When the Premium month being counted began, in milliseconds: the day Premium started, or 30
 * days ago when it has been running for longer.
 */
export function premiumWindowStart(
  premiumStartedAt: string | null | undefined,
  premiumUntil: string,
  now: number = Date.now(),
): number {
  return Math.max(Date.parse(premiumStartedAt || premiumUntil) || 0, now - 30 * DAY);
}

/** Pages a tier reads before extra pages cost more: a Standard run's, a Premium month's. */
export function pageLimit(tier: Tier): number {
  return tier === "premium" ? PRICING.premiumPages : PRICING.runPages;
}

/** The storage that comes with a tier, in bytes. */
export function storageLimit(tier: Tier): number {
  return tier === "premium" ? PRICING.premiumStorageGb * GB : PRICING.freeStorageMb * MB;
}

export interface Meter {
  used: number;
  limit: number;
  /** What is left before the limit, never below zero. */
  left: number;
  /** What went over the limit. */
  over: number;
  /** 0 to 100, for the bar. */
  percent: number;
  /** "near" from 80% of the limit, "full" at the limit and over. */
  level: "ok" | "near" | "full";
}

export function meter(used: number, limit: number): Meter {
  const amount = Number.isFinite(used) ? Math.max(used, 0) : 0;
  const top = Math.max(limit, 0);
  const share = top > 0 ? amount / top : amount > 0 ? 1 : 0;
  return {
    used: amount,
    limit: top,
    left: Math.max(top - amount, 0),
    over: Math.max(amount - top, 0),
    percent: Math.min(Math.round(share * 100), 100),
    level: share >= 1 ? "full" : share >= 0.8 ? "near" : "ok",
  };
}

const oneDecimal = (value: number) =>
  (Math.round(value * 10) / 10).toLocaleString("en-PH", { maximumFractionDigits: 1 });

/** 85_000 -> "85 KB"; 8_240_000 -> "8.2 MB"; 240_000_000 -> "240 MB"; 1_500_000_000 -> "1.5 GB". */
export function sizeText(bytes: number): string {
  const amount = Number.isFinite(bytes) ? Math.max(bytes, 0) : 0;
  if (amount === 0) return "0 MB";
  // 999.96 MB would round to "1,000 MB": show it as 1 GB.
  if (Math.round((amount / MB) * 10) / 10 >= 1_000) return `${oneDecimal(amount / GB)} GB`;
  if (amount >= MB) return `${oneDecimal(amount / MB)} MB`;
  return `${Math.max(1, Math.round(amount / 1_000))} KB`;
}
