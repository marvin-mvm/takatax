const whole = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 12450 -> "₱12,450"; with `exact`, "₱12,450.00". Negative amounts get a minus sign. */
export function peso(amount: number, exact = false): string {
  const sign = amount < 0 ? "−" : "";
  const value = Math.abs(amount);
  return `${sign}₱${exact ? cents.format(value) : whole.format(Math.round(value))}`;
}

/** 1536000 -> "1.5 MB" */
export function fileSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}
