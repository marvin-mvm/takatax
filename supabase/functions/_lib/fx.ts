// Exchange rates for documents printed in another currency: pesos for one unit of the currency
// on the document's date. The rules (which sources, in what order) are in
// _shared/parser/currency.ts; this file only makes the network call.
//
// Both sources are public and need no key: the European Central Bank's reference rates through
// api.frankfurter.dev, and the currency-api data set on cdn.jsdelivr.net.
import { type ExchangeRate, lookupRate } from "../_shared/parser/currency.ts";

const TIMEOUT_MS = 8_000;
/** Rates already fetched in this run: a batch of receipts from one day asks only once. */
const fetched = new Map<string, Promise<ExchangeRate | null>>();

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Exchange rate source answered ${response.status}`);
  return await response.json();
}

/** The peso rate of `currency` for a document dated `date` (the latest rate without a date). */
export function pesoRate(currency: string, date: string | null): Promise<ExchangeRate | null> {
  const key = `${currency}|${date ?? "latest"}`;
  let rate = fetched.get(key);
  if (!rate) {
    const today = new Date().toISOString().slice(0, 10);
    rate = lookupRate(fetchJson, currency, date, today).then((found) => {
      // Do not remember a failure: the next document may be luckier.
      if (!found) fetched.delete(key);
      else console.log(`Exchange rate: 1 ${currency} = ₱${found.rate} on ${found.date}`);
      return found;
    });
    fetched.set(key, rate);
  }
  return rate;
}
