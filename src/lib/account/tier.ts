/**
 * What the account settings page says about the current tier: its name, a short tag and what it
 * includes, one line each. Every figure comes from the price list (`PRICING`).
 */

import { PARTNER_RUN_PRICE, PAYMENTS_LIVE, PRICING, pesoText } from "@shared/uploads/rules.ts";
import { type Tier, sizeText, storageLimit } from "@shared/uploads/usage.ts";
import type { AccountRole } from "@/lib/data/types";
import { shortDay } from "@/lib/time";

import { TIER_LABEL } from "./usage";

export interface TierSummary {
  /** "Standard" or "Premium". */
  name: string;
  /** A short label beside the name: "Free during launch", "Active until Dec 14, 2026". */
  tag: string | null;
  /** What the tier includes, one short line each. */
  points: string[];
}

const count = (value: number) => value.toLocaleString("en-PH");

export function tierSummary(input: {
  role: AccountRole;
  tier: Tier;
  premiumUntil: string | null;
  trialUsed: boolean;
  paymentsLive?: boolean;
}): TierSummary {
  const paymentsLive = input.paymentsLive ?? PAYMENTS_LIVE;
  const runPages = count(PRICING.runPages);
  const extraPage = pesoText(PRICING.extraPage);

  // A bookkeeper, CPA or tax lawyer has no documents of their own: they run their clients'.
  if (input.role !== "taxpayer") {
    return {
      name: TIER_LABEL.standard,
      tag: paymentsLive ? "Partner price" : "Free during launch",
      points: [
        paymentsLive
          ? `${pesoText(PARTNER_RUN_PRICE)} a client run (${Math.round(PRICING.partnerDiscount * 100)}% off ${pesoText(PRICING.runPrice)}) for up to ${runPages} pages, then ${extraPage} a page.`
          : `Client runs of up to ${runPages} pages are free during launch.`,
        "On a client's account you get that client's tier, Standard or Premium.",
        "Pages and storage are counted on each client's account.",
      ],
    };
  }

  if (input.tier === "premium") {
    return {
      name: TIER_LABEL.premium,
      tag: input.premiumUntil ? `Active until ${shortDay(input.premiumUntil)}` : "Active",
      points: [
        `${count(PRICING.premiumPages)} pages read a month, then ${pesoText(PRICING.premiumExtraPage)} a page.`,
        `${sizeText(storageLimit("premium"))} of document storage.`,
        "Deleting a file keeps its parsed records.",
        "It does not renew by itself.",
      ],
    };
  }

  const storage = `${sizeText(storageLimit("standard"))} of document storage.`;
  if (!paymentsLive) {
    return {
      name: TIER_LABEL.standard,
      tag: "Free during launch",
      points: [
        `Every run of up to ${runPages} pages is free, as often as you need.`,
        `Pages over ${runPages} (${extraPage} each) and Premium are coming soon.`,
        storage,
      ],
    };
  }
  return {
    name: TIER_LABEL.standard,
    tag: "Pay per run",
    points: [
      `${pesoText(PRICING.runPrice)} a run for up to ${runPages} pages, then ${extraPage} a page.`,
      input.trialUsed
        ? `Free trial used: your first ${PRICING.trialPages} pages were read free.`
        : `Free trial: your first ${PRICING.trialPages} pages are read free.`,
      storage,
    ],
  };
}
