/**
 * How far along a document's reading looks, between the real updates the reader sends.
 *
 * The readers report pages done in steps: a photo all at once, a PDF a group of up to 5 pages at
 * a time (4 groups in parallel on Trigger.dev, 3 per step in Supabase). Showing only those steps
 * makes the bar sit still, then jump. So the bar moves on its own between them, at the pace the
 * reading has actually had so far (or a typical pace before the first update), slowing as it
 * nears the pages being read right now. It never passes those pages, and it never shows 100%
 * until the reader says the document is done.
 */

/** Typical reading pace, used until the document's own pace is known. */
export const READING_PACE = {
  /** Fetching the file and the first call, before any page is done. */
  startSeconds: 4,
  /** One photo or a one-page PDF: one call, sometimes a second model to check it. */
  onePageSeconds: 10,
  /** One group of up to 5 PDF pages, one call. */
  groupSeconds: 14,
  pagesPerGroup: 5,
  /** Groups read at the same time. */
  parallelGroups: 4,
} as const;

/** Pages the reader works on at once. */
const PAGES_IN_FLIGHT = READING_PACE.pagesPerGroup * READING_PACE.parallelGroups;

/** The bar stops here until the reader says the document is done. */
const MAX_BEFORE_DONE = 0.97;

/** Seconds a document of `pages` pages usually takes, before anything is known about it. */
export function expectedSeconds(pages: number): number {
  if (pages <= 1) return READING_PACE.onePageSeconds;
  const groups = Math.ceil(pages / READING_PACE.pagesPerGroup);
  const rounds = Math.ceil(groups / READING_PACE.parallelGroups);
  return READING_PACE.startSeconds + rounds * READING_PACE.groupSeconds;
}

export interface ProgressInput {
  /** "waiting": in line; "reading": being read; "done": finished (read, to check, or not counted). */
  phase: "waiting" | "reading" | "done";
  pages: number;
  /** The latest real pages-done from the reader. */
  pagesRead: number;
  /** When the reading was first seen (ms). */
  startedAt: number;
  /** When pagesRead last went up (ms); startedAt before the first update. */
  lastChangeAt: number;
  /** Seconds per page seen so far, once at least one update has arrived; null before. */
  observedSecondsPerPage: number | null;
  now: number;
}

export interface ProgressEstimate {
  /** 0 to 1, for the bar's width. */
  fraction: number;
  /** About how long is left; null when unknown (waiting) and 0 when done. */
  secondsLeft: number | null;
}

export function estimateProgress(input: ProgressInput): ProgressEstimate {
  const pages = Math.max(input.pages, 1);
  if (input.phase === "done") return { fraction: 1, secondsLeft: 0 };
  if (input.phase === "waiting") return { fraction: 0, secondsLeft: null };

  const read = Math.min(Math.max(input.pagesRead, 0), pages);
  const secondsPerPage = input.observedSecondsPerPage ?? expectedSeconds(pages) / pages;
  const inFlight = Math.min(pages - read, PAGES_IN_FLIGHT);
  const real = read / pages;
  const ceiling = Math.min((read + inFlight) / pages, MAX_BEFORE_DONE);
  if (ceiling <= real) {
    return { fraction: Math.min(real, MAX_BEFORE_DONE), secondsLeft: 1 };
  }

  // The pages in flight usually take this long; the bar eases towards them.
  const chunkSeconds =
    input.observedSecondsPerPage !== null
      ? Math.max(secondsPerPage * inFlight, 2)
      : read === 0
        ? Math.min(expectedSeconds(pages), expectedSeconds(inFlight))
        : expectedSeconds(inFlight);
  const sinceUpdate = Math.max(0, (input.now - input.lastChangeAt) / 1000);
  const eased = 1 - Math.exp(-sinceUpdate / (chunkSeconds * 0.6));
  const fraction = real + (ceiling - real) * eased;

  const remaining = (pages - read) * secondsPerPage - sinceUpdate;
  return { fraction, secondsLeft: Math.max(Math.round(remaining), 1) };
}

/**
 * Seconds per page from the updates seen so far (oldest first), or null with fewer than two
 * that differ. Uses the whole span, so one slow group does not swing it.
 */
export function observedPace(samples: { at: number; pagesRead: number }[]): number | null {
  if (samples.length < 2) return null;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const pages = last.pagesRead - first.pagesRead;
  const seconds = (last.at - first.at) / 1000;
  if (pages <= 0 || seconds <= 0) return null;
  return seconds / pages;
}

/** "about 2 min left", "about 40 sec left", "a few seconds left". */
export function timeLeftText(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds <= 5) return "a few seconds left";
  if (seconds < 60) return `about ${Math.round(seconds / 5) * 5} sec left`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} min left`;
}
