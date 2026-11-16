import { describe, expect, it } from "vitest";

import { mapWithConcurrency } from "./pool";

describe("mapWithConcurrency", () => {
  it("keeps results in order and never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1, 10], 2, async (ms, index) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return index * 10;
    });
    expect(results).toEqual([0, 10, 20, 30, 40]);
    expect(most).toBe(2);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
