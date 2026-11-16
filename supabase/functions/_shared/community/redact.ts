/**
 * Blurs personal details in community posts before they are saved: TIN-like numbers, phone
 * numbers, email addresses and peso amounts. Runs in the browser (so the poster sees the result)
 * and again in the database trigger or edge function (so it cannot be skipped).
 *
 * Names are not detected; the post box asks people not to include them.
 */

export const REDACTED = "•••";

const RULES: { kind: RedactionKind; pattern: RegExp; replace: string }[] = [
  { kind: "email", pattern: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g, replace: `[email ${REDACTED}]` },
  // TIN: 9 digits, often grouped 3-3-3, with an optional 3 to 5 digit branch code.
  {
    kind: "tin",
    pattern: /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}(?:[\s-]?\d{3,5})?\b/g,
    replace: `[TIN ${REDACTED}]`,
  },
  // Philippine mobile and landline numbers: 09XX XXX XXXX, +63 9XX..., (02) 8XXX XXXX.
  {
    kind: "phone",
    pattern:
      /(?:\+?63[\s-]?|\b0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\(0\d{1,2}\)\s?\d{3,4}[\s-]?\d{4}\b/g,
    replace: `[phone ${REDACTED}]`,
  },
  // Peso amounts: ₱12,000, PHP 12000.50, P 1,500
  {
    kind: "amount",
    pattern: /(?:₱|\bPHP\s?|\bP(?=\s?\d))\s?\d[\d,]*(?:\.\d{1,2})?/gi,
    replace: `₱${REDACTED}`,
  },
];

export type RedactionKind = "email" | "tin" | "phone" | "amount";

export interface RedactionResult {
  text: string;
  /** What was blurred, so the post box can tell the user. */
  found: RedactionKind[];
}

export function redactPersonalInfo(text: string): RedactionResult {
  const found = new Set<RedactionKind>();
  let result = text;
  for (const rule of RULES) {
    result = result.replace(rule.pattern, () => {
      found.add(rule.kind);
      return rule.replace;
    });
  }
  return { text: result, found: [...found] };
}
