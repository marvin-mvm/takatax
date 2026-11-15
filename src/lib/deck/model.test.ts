import { describe, expect, it } from "vitest";

import {
  DEFAULT_INPUTS,
  MICRO_ENTERPRISES,
  aiCostPerDocument,
  customersAtMonth,
  runModel,
  type ModelInputs,
} from "./model";

const withInputs = (changes: Partial<ModelInputs>): ModelInputs => ({
  ...DEFAULT_INPUTS,
  ...changes,
});

describe("aiCostPerDocument", () => {
  it("matches the feasibility study for the three-step reader", () => {
    // Worst case: half of documents re-read. Best case: one in five.
    expect(aiCostPerDocument("pipeline", 50)).toBeCloseTo(0.319, 3);
    expect(aiCostPerDocument("pipeline", 20)).toBeCloseTo(0.2296, 4);
  });

  it("ignores the re-read share when a single model reads everything", () => {
    expect(aiCostPerDocument("flash", 50)).toBe(0.17);
    expect(aiCostPerDocument("pro", 0)).toBe(0.62);
  });

  it("orders the readers from cheapest to most expensive", () => {
    const flash = aiCostPerDocument("flash", 50);
    const pipeline = aiCostPerDocument("pipeline", 50);
    const pro = aiCostPerDocument("pro", 50);
    expect(flash).toBeLessThan(pipeline);
    expect(pipeline).toBeLessThan(pro);
  });
});

describe("customersAtMonth", () => {
  it("reaches the year-1 share at month 12 and the final share in the last month", () => {
    expect(Math.round(customersAtMonth(12, DEFAULT_INPUTS))).toBe(
      Math.round(MICRO_ENTERPRISES * 0.001),
    );
    expect(Math.round(customersAtMonth(36, DEFAULT_INPUTS))).toBe(
      Math.round(MICRO_ENTERPRISES * 0.01),
    );
  });

  it("ramps evenly through year 1 and never shrinks on the default plan", () => {
    expect(customersAtMonth(6, DEFAULT_INPUTS)).toBeCloseTo(
      customersAtMonth(12, DEFAULT_INPUTS) / 2,
      6,
    );
    for (let month = 1; month <= 36; month++) {
      expect(customersAtMonth(month, DEFAULT_INPUTS)).toBeGreaterThanOrEqual(
        customersAtMonth(month - 1, DEFAULT_INPUTS),
      );
    }
  });

  it("follows a longer plan to its own last month", () => {
    const fiveYears = withInputs({ years: 5, finalSharePct: 2 });
    expect(Math.round(customersAtMonth(60, fiveYears))).toBe(Math.round(MICRO_ENTERPRISES * 0.02));
  });
});

describe("runModel", () => {
  it("returns one result per year with the target customer counts", () => {
    const result = runModel(DEFAULT_INPUTS);
    expect(result.years).toHaveLength(3);
    expect(result.years[0]?.customers).toBe(1_127);
    expect(result.years[2]?.customers).toBe(11_271);
    expect(result.totals.customers).toBe(11_271);
  });

  it("keeps every year's books consistent", () => {
    for (const year of runModel(DEFAULT_INPUTS).years) {
      const { revenue, costs } = year;
      expect(revenue.parser + revenue.storage + revenue.ads + revenue.subscriptions).toBeCloseTo(
        revenue.total,
        4,
      );
      expect(
        costs.ai + costs.cloud + costs.fees + costs.marketing + costs.team + costs.fixed,
      ).toBeCloseTo(costs.total, 4);
      expect(revenue.total - costs.total - year.businessTax - year.incomeTax).toBeCloseTo(
        year.netProfit,
        4,
      );
    }
  });

  it("prices a simple case by hand", () => {
    // One year, no Premium, no partners' discount effects on the regular line:
    // customers ramp 1/12..12/12 of 1,127, so the average month holds 6.5/12 of them.
    const result = runModel(
      withInputs({
        years: 1,
        premiumSharePct: 0,
        runsPerYear: 12,
        includeAds: false,
        includeSubscriptions: false,
      }),
    );
    let regularRuns = 0;
    let partnerRuns = 0;
    let storageMonths = 0;
    for (let month = 1; month <= 12; month++) {
      const customers = Math.round((MICRO_ENTERPRISES * 0.001 * month) / 12);
      regularRuns += customers;
      storageMonths += (customers * 50) / 900;
      partnerRuns += (1_608 * month) / 36;
    }
    expect(result.years[0]?.revenue.parser).toBeCloseTo(regularRuns * 199 + partnerRuns * 149, 4);
    expect(result.years[0]?.revenue.storage).toBeCloseTo(storageMonths * 250, 4);
    expect(result.years[0]?.revenue.ads).toBe(0);
    expect(result.years[0]?.revenue.subscriptions).toBe(0);
  });

  it("charges 3% percentage tax under ₱3M of revenue and VAT above it", () => {
    const years = runModel(DEFAULT_INPUTS).years;
    const small = years.find((year) => year.revenue.total <= 3_000_000);
    const large = years.find((year) => year.revenue.total > 3_000_000);
    expect(small?.businessTaxKind).toBe("3% percentage tax");
    expect(small?.businessTax).toBeCloseTo((small?.revenue.total ?? 0) * 0.03, 4);
    expect(large?.businessTaxKind).toBe("VAT");
  });

  it("charges no income tax in a loss-making year", () => {
    const result = runModel(withInputs({ fixedMonthly: 2_000_000 }));
    expect(result.years[0]?.netProfit).toBeLessThan(0);
    expect(result.years[0]?.incomeTax).toBe(0);
  });

  it("moves in the expected direction when an input changes", () => {
    const base = runModel(DEFAULT_INPUTS).totals;
    expect(runModel(withInputs({ runPrice: 249 })).totals.revenue.total).toBeGreaterThan(
      base.revenue.total,
    );
    expect(runModel(withInputs({ reader: "pro" })).totals.netProfit).toBeLessThan(base.netProfit);
    expect(runModel(withInputs({ reader: "flash" })).totals.netProfit).toBeGreaterThan(
      base.netProfit,
    );
    expect(runModel(withInputs({ finalSharePct: 2 })).totals.customers).toBeGreaterThan(
      base.customers,
    );
    expect(runModel(withInputs({ includeAds: false })).totals.revenue.ads).toBe(0);
  });

  it("stays profitable on the default plan from year 2", () => {
    const years = runModel(DEFAULT_INPUTS).years;
    expect(years[1]?.netProfit).toBeGreaterThan(0);
    expect(years[2]?.netProfit).toBeGreaterThan(years[1]?.netProfit ?? 0);
  });
});
