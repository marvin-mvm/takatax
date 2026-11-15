import { describe, expect, it } from "vitest";

import { redactPersonalInfo } from "./redact.ts";

describe("redactPersonalInfo", () => {
  it("blurs TINs, phone numbers, emails and peso amounts", () => {
    const { text, found } = redactPersonalInfo(
      "My TIN is 123-456-789-000, call 0917 123 4567 or juan@example.com. I earned ₱450,000 and PHP 1200.50.",
    );
    expect(text).toBe(
      "My TIN is [TIN •••], call [phone •••] or [email •••]. I earned ₱••• and ₱•••.",
    );
    expect(found.sort()).toEqual(["amount", "email", "phone", "tin"]);
  });

  it("leaves ordinary text, years and form numbers alone", () => {
    const question = "Do I file 2551Q for Q1 2026 if I chose the 8% option?";
    expect(redactPersonalInfo(question)).toEqual({ text: question, found: [] });
  });
});
