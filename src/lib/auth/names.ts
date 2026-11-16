/**
 * The first name to greet someone by, from the full name they signed up with:
 * "Maria Santos" -> "Maria". A short form or an initial is not a name by itself, so the next
 * word is kept with it: "Ma. Cristina Santos" -> "Ma. Cristina", "J Rizal" -> "J Rizal".
 */
export function firstNameOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  const next = words[1];
  if (next && (first.endsWith(".") || first.length === 1)) return `${first} ${next}`;
  return first;
}
