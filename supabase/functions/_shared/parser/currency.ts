/**
 * Money printed in another currency. The reader transcribes amounts as printed, with their
 * currency; this turns them into pesos at the exchange rate of the document's date and keeps what
 * was printed, so a $250 receipt is never counted as ₱250.
 *
 * Pure: the network call that fetches a rate is passed in, like the model calls in pipeline.ts.
 */

import type { ReadResult } from "./pipeline.ts";
import type { ExtractedDocument } from "./schema.ts";

export const PESO = "PHP";

const SIGNS: Record<string, string> = {
  "₱": "PHP",
  P: "PHP",
  PHP: "PHP",
  PESO: "PHP",
  PESOS: "PHP",
  $: "USD",
  US$: "USD",
  USD: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  S$: "SGD",
  A$: "AUD",
  C$: "CAD",
  HK$: "HKD",
};

/** "$", "US$", "usd" -> "USD"; "₱", "Php" -> "PHP"; null when it is not a currency. */
export function currencyCode(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!text) return null;
  const known = SIGNS[text];
  if (known) return known;
  return /^[A-Z]{3}$/.test(text) ? text : null;
}

/** The currency a document's amounts were printed in. With no sign, a document is in pesos. */
export function currencyOf(doc: Pick<ExtractedDocument, "currency">): string {
  return doc.currency ?? PESO;
}

/** True when the amounts are still in another currency: not pesos, and not converted. */
export function isUnconverted(doc: Pick<ExtractedDocument, "currency" | "converted">): boolean {
  return currencyOf(doc) !== PESO && !doc.converted;
}

/** One currency's price in pesos on a day. */
export interface ExchangeRate {
  /** Pesos for one unit of the currency. */
  rate: number;
  /** The day the rate is for, "YYYY-MM-DD" (the last working day on or before the one asked). */
  date: string;
  /** Who published it. */
  source: string;
}

/** What a document's amounts were before they were turned into pesos. */
export interface Conversion {
  currency: string;
  rate: number;
  rateDate: string;
  source: string;
  totalAmount: number | null;
  vatAmount: number | null;
  incomePayment: number | null;
  taxWithheld: number | null;
}

const toCentavo = (amount: number) => Math.round(amount * 100) / 100;

/** The document with its amounts in pesos, and the printed amounts kept in `converted`. */
export function convertDocument(doc: ExtractedDocument, rate: ExchangeRate): ExtractedDocument {
  const pesos = (amount: number | null) => (amount === null ? null : toCentavo(amount * rate.rate));
  return {
    ...doc,
    totalAmount: pesos(doc.totalAmount),
    vatAmount: pesos(doc.vatAmount),
    incomePayment: pesos(doc.incomePayment),
    taxWithheld: pesos(doc.taxWithheld),
    converted: {
      currency: currencyOf(doc),
      rate: rate.rate,
      rateDate: rate.date,
      source: rate.source,
      totalAmount: doc.totalAmount,
      vatAmount: doc.vatAmount,
      incomePayment: doc.incomePayment,
      taxWithheld: doc.taxWithheld,
    },
  };
}

/** " (USD 8.40 at ₱63.954)" for a converted document, "" otherwise. Shown with its record. */
export function conversionNote(doc: Pick<ExtractedDocument, "converted">): string {
  const c = doc.converted;
  if (!c) return "";
  const printed = c.totalAmount ?? c.incomePayment;
  const amount = printed === null ? "" : ` ${printed.toFixed(2)}`;
  return ` (${c.currency}${amount} at ₱${Math.round(c.rate * 10_000) / 10_000})`;
}

/** Fetches a URL and returns its JSON. The only network call; passed in by the reader. */
export type FetchJson = (url: string) => Promise<unknown>;

interface RateSource {
  name: string;
  url: string;
  /** The rate in the source's reply, or null when it is not there. */
  read(body: unknown): { rate: number; date: string } | null;
}

function rateFrom(rate: unknown, date: unknown, fallbackDate: string) {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : "";
  return { rate, date: day || fallbackDate };
}

/** The first day the rate sources cover. */
const EARLIEST = "1999-01-04";

/**
 * Where to ask for a currency's peso rate, best first: the rate of the document's date from two
 * public sources that need no key, then their latest rate as a last resort. A missing date, or
 * one in the future, asks for the latest rate.
 */
export function rateSources(currency: string, date: string | null, today: string): RateSource[] {
  const code = currency.toUpperCase();
  const lower = currency.toLowerCase();
  const frankfurter = (when: string): RateSource => ({
    name: "European Central Bank (Frankfurter)",
    url: `https://api.frankfurter.dev/v1/${when}?base=${code}&symbols=${PESO}`,
    read: (body) => {
      const reply = body as { rates?: Record<string, unknown>; date?: unknown } | null;
      return rateFrom(reply?.rates?.[PESO], reply?.date, when === "latest" ? today : when);
    },
  });
  const currencyApi = (when: string): RateSource => ({
    name: "currency-api (fawazahmed0)",
    url: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${when}/v1/currencies/${lower}.min.json`,
    read: (body) => {
      const reply = body as Record<string, unknown> | null;
      const rates = reply?.[lower] as Record<string, unknown> | undefined;
      return rateFrom(rates?.["php"], reply?.["date"], when === "latest" ? today : when);
    },
  });
  const latest = [frankfurter("latest"), currencyApi("latest")];
  const dated = date !== null && date >= EARLIEST && date <= today;
  return dated ? [frankfurter(date), currencyApi(date), ...latest] : latest;
}

/** A currency's peso rate for a document dated `date`, or null when no source could give one. */
export async function lookupRate(
  fetchJson: FetchJson,
  currency: string,
  date: string | null,
  today: string,
): Promise<ExchangeRate | null> {
  if (!/^[A-Za-z]{3}$/.test(currency)) return null;
  for (const source of rateSources(currency, date, today)) {
    try {
      const found = source.read(await fetchJson(source.url));
      if (found) return { ...found, source: source.name };
    } catch {
      // This source is down or does not know the currency: try the next one.
    }
  }
  return null;
}

/** Finds a currency's peso rate for a date. Given to convertReading by the reader. */
export type RateLookup = (currency: string, date: string | null) => Promise<ExchangeRate | null>;

/**
 * A reading with every foreign-currency document turned into pesos. A document whose rate could
 * not be found keeps its printed amounts, is flagged, and sends the reading to review; it gets
 * no ledger rows (see ledger.ts), so a foreign amount is never counted as pesos.
 */
export async function convertReading(result: ReadResult, lookup: RateLookup): Promise<ReadResult> {
  const documents: ExtractedDocument[] = [];
  let missed = false;
  for (const doc of result.documents) {
    if (!isUnconverted(doc)) {
      documents.push(doc);
      continue;
    }
    const rate = await lookup(currencyOf(doc), doc.date ?? doc.periodTo).catch(() => null);
    if (rate) documents.push(convertDocument(doc, rate));
    else {
      missed = true;
      documents.push(doc);
    }
  }
  if (!missed) return { ...result, documents };
  return {
    ...result,
    documents,
    status: "needs_review",
    flags: [...new Set([...result.flags, "currency_not_converted" as const])],
  };
}
