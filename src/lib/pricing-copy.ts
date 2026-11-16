/**
 * The price list in words, for the pages and screens that state prices. Every figure comes from
 * the pricing rules the checkout enforces (`PRICING` in `@shared/uploads/rules.ts`), so the site
 * and the server can never disagree: change a price there and every page follows.
 */

import { PARTNER_RUN_PRICE, PRICING, pesoText } from "@shared/uploads/rules.ts";

const count = (value: number) => value.toLocaleString("en-PH");

export const PRICE = {
  /** A Standard run, for example "₱149". */
  run: pesoText(PRICING.runPrice),
  /** Pages a Standard run includes, for example "80". */
  runPages: count(PRICING.runPages),
  /** Each page over a Standard run's limit, for example "₱3.50". */
  extraPage: pesoText(PRICING.extraPage),
  /** A Premium month, for example "₱649". */
  premium: pesoText(PRICING.premiumMonthly),
  /** Pages a Premium month includes, for example "300". */
  premiumPages: count(PRICING.premiumPages),
  /** Each page over a Premium month's limit, for example "₱2.65". */
  premiumExtraPage: pesoText(PRICING.premiumExtraPage),
  /** Storage that comes with Premium, for example "15 GB". */
  premiumStorage: `${PRICING.premiumStorageGb} GB`,
  /** A client run for a bookkeeper, CPA or tax lawyer, for example "₱112". */
  partnerRun: pesoText(PARTNER_RUN_PRICE),
  /** The partner discount, for example "25%". */
  partnerDiscount: `${Math.round(PRICING.partnerDiscount * 100)}%`,
  /** Pages the free trial covers, for example "10". */
  trialPages: count(PRICING.trialPages),
  /** The storage add-on, for example "₱250 for 5 GB a month". */
  storageAddOn: `${pesoText(PRICING.storageAddOnMonthly)} for ${PRICING.storageAddOnGb} GB a month`,
  /** Storage every account gets free, for example "300 MB". */
  freeStorage: `${PRICING.freeStorageMb} MB`,
} as const;

/**
 * The most a full Standard run costs in AI, for example "₱26": every page at the reader's highest
 * blended cost of ₱0.32 a page.
 */
export const RUN_AI_COST_AT_MOST = pesoText(Math.ceil(PRICING.runPages * 0.32));

/** How pages are counted, for the places that need to say it. */
export const PAGE_RULE = "a photo is one page; a PDF counts each page";
