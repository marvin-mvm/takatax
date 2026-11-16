/** Shared class names for the public site's buttons and links. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand";

export const buttonPrimary = `inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-tk-brand px-5 text-base font-semibold text-tk-surface transition-colors hover:bg-tk-brand/90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

export const buttonOutline = `inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-tk-line bg-tk-surface px-4 text-base font-semibold text-tk-ink transition-colors hover:border-tk-brand ${focusRing}`;

/** The button that goes ahead with deleting or removing something. */
export const buttonDanger =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-tk-danger px-5 text-base font-semibold text-tk-surface transition-colors hover:bg-tk-danger/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-danger";

/** The one big call to action on the landing and pricing pages. */
export const buttonStart = `inline-flex min-h-16 items-center justify-center gap-3 rounded-[16px] bg-tk-brand px-14 text-xl font-bold text-tk-surface shadow-[0_8px_24px_rgb(14_122_90/0.28)] transition-[background-color,transform] hover:bg-tk-brand/90 active:scale-[0.98] ${focusRing}`;

export const textLink = `font-semibold text-tk-brand underline-offset-4 hover:underline ${focusRing}`;
