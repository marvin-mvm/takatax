import { describe, expect, it } from "vitest";

import { corSaveProblem, errorParts } from "./save-problem";

describe("errorParts", () => {
  it("reads a Supabase error object, which is not an Error", () => {
    const error = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "accounts_tin_key"',
    };
    expect(error instanceof Error).toBe(false);
    expect(errorParts(error)).toEqual({ code: "23505", message: error.message });
  });

  it("reads an Error and anything else", () => {
    expect(errorParts(new Error("boom"))).toEqual({ code: "", message: "boom" });
    expect(errorParts("text")).toEqual({ code: "", message: "text" });
    expect(errorParts(null)).toEqual({ code: "", message: "" });
  });
});

describe("corSaveProblem", () => {
  it("names a TIN that already has an account", () => {
    expect(
      corSaveProblem({
        code: "23505",
        message: 'duplicate key value violates unique constraint "accounts_tin_key"',
      }),
    ).toMatch(/TIN already belongs to another Takatax account/);
  });

  it("names a bad date, a missing COR and a bad choice", () => {
    expect(
      corSaveProblem({ code: "22007", message: "invalid input syntax for type date" }),
    ).toMatch(/registration date/);
    expect(corSaveProblem({ code: "42501", message: "COR not found" })).toMatch(
      /could not be found/,
    );
    expect(
      corSaveProblem({
        code: "22P02",
        message: 'invalid input value for enum public.income_tax_option: "x"',
      }),
    ).toMatch(/income tax option/);
  });

  it("shows the database's reason for anything else", () => {
    expect(corSaveProblem({ code: "XX000", message: "something broke" })).toBe(
      "We could not save your COR: something broke",
    );
    expect(corSaveProblem({})).toMatch(/Please check the fields/);
  });
});
