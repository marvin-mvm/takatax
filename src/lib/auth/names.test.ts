import { describe, expect, it } from "vitest";

import { firstNameOf } from "./names";

describe("firstNameOf", () => {
  it("takes the first word of a full name", () => {
    expect(firstNameOf("Marvin Mata")).toBe("Marvin");
    expect(firstNameOf("  Juan   Dela Cruz ")).toBe("Juan");
    expect(firstNameOf("Cher")).toBe("Cher");
  });

  it("keeps the next word after a short form or an initial", () => {
    expect(firstNameOf("Ma. Cristina Santos")).toBe("Ma. Cristina");
    expect(firstNameOf("J. Rizal")).toBe("J. Rizal");
    expect(firstNameOf("J Rizal")).toBe("J Rizal");
  });

  it("leaves a short form alone when nothing follows it", () => {
    expect(firstNameOf("Ma.")).toBe("Ma.");
    expect(firstNameOf("")).toBe("");
  });
});
