import { describe, expect, it } from "vitest";

import {
  estimateProgress,
  expectedSeconds,
  observedPace,
  timeLeftText,
  type ProgressInput,
} from "./reading-progress";

const T0 = 1_000_000;
const reading = (over: Partial<ProgressInput>): ProgressInput => ({
  phase: "reading",
  pages: 1,
  pagesRead: 0,
  startedAt: T0,
  lastChangeAt: T0,
  observedSecondsPerPage: null,
  now: T0,
  ...over,
});

describe("expectedSeconds", () => {
  it("is about 10 seconds for a photo and grows with PDF pages read 20 at a time", () => {
    expect(expectedSeconds(1)).toBe(10);
    expect(expectedSeconds(20)).toBe(18); // one round of 4 groups
    expect(expectedSeconds(40)).toBe(32); // two rounds
    expect(expectedSeconds(250)).toBeGreaterThan(expectedSeconds(40));
  });
});

describe("estimateProgress", () => {
  it("is empty while waiting and full when done", () => {
    expect(estimateProgress(reading({ phase: "waiting" }))).toEqual({
      fraction: 0,
      secondsLeft: null,
    });
    expect(estimateProgress(reading({ phase: "done", pagesRead: 0 }))).toEqual({
      fraction: 1,
      secondsLeft: 0,
    });
  });

  it("moves a photo along over its typical time but never shows done early", () => {
    const at = (seconds: number) =>
      estimateProgress(reading({ now: T0 + seconds * 1000 })).fraction;
    expect(at(0)).toBe(0);
    expect(at(3)).toBeGreaterThan(0.2);
    expect(at(10)).toBeGreaterThan(0.7);
    expect(at(10)).toBeLessThan(0.97);
    expect(at(600)).toBeLessThanOrEqual(0.97);
    // Always moving forward.
    expect(at(5)).toBeGreaterThan(at(4));
  });

  it("does not run past the pages being read right now", () => {
    // 100 pages, 20 read; the next 20 are in flight, so the bar stays under 40%.
    const late = estimateProgress(
      reading({ pages: 100, pagesRead: 20, observedSecondsPerPage: 0.7, now: T0 + 600_000 }),
    );
    expect(late.fraction).toBeGreaterThan(0.39);
    expect(late.fraction).toBeLessThanOrEqual(0.4);
    // And starts from the real 20% right after the update.
    const fresh = estimateProgress(
      reading({ pages: 100, pagesRead: 20, observedSecondsPerPage: 0.7, now: T0 }),
    );
    expect(fresh.fraction).toBeCloseTo(0.2, 5);
  });

  it("estimates time left from the pace seen so far", () => {
    const estimate = estimateProgress(
      reading({ pages: 100, pagesRead: 40, observedSecondsPerPage: 1, now: T0 + 10_000 }),
    );
    expect(estimate.secondsLeft).toBe(50); // 60 pages at 1 s, 10 s already spent
  });
});

describe("observedPace", () => {
  it("is the seconds per page over the whole span", () => {
    expect(
      observedPace([
        { at: T0, pagesRead: 0 },
        { at: T0 + 14_000, pagesRead: 20 },
        { at: T0 + 30_000, pagesRead: 40 },
      ]),
    ).toBe(0.75);
  });

  it("is unknown until the pages go up", () => {
    expect(observedPace([{ at: T0, pagesRead: 0 }])).toBeNull();
    expect(
      observedPace([
        { at: T0, pagesRead: 5 },
        { at: T0 + 5000, pagesRead: 5 },
      ]),
    ).toBeNull();
  });
});

describe("timeLeftText", () => {
  it("reads naturally", () => {
    expect(timeLeftText(null)).toBe("");
    expect(timeLeftText(3)).toBe("a few seconds left");
    expect(timeLeftText(42)).toBe("about 40 sec left");
    expect(timeLeftText(150)).toBe("about 3 min left");
  });
});
