const wholeNumber = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

/** 11271 -> "11,271" */
export function formatNumber(value: number): string {
  return wholeNumber.format(Math.round(value));
}

/** 1234567 -> "₱1,234,567" */
export function formatPesos(value: number): string {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "−" : ""}₱${wholeNumber.format(Math.abs(rounded))}`;
}

/** 28474499 -> "₱28.5M"; 58890 -> "₱59K"; 950 -> "₱950" */
export function formatPesosCompact(value: number): string {
  const sign = value < 0 ? "−" : "";
  const amount = Math.abs(value);
  if (amount >= 999_950) return `${sign}₱${trimZero((amount / 1_000_000).toFixed(1))}M`;
  if (amount >= 1_000) return `${sign}₱${Math.round(amount / 1_000)}K`;
  return `${sign}₱${Math.round(amount)}`;
}

/** 0.283 -> "28%" */
export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}
