import { describe, expect, it } from "vitest";

import { FALLBACK_MESSAGE, NETWORK_MESSAGE, authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("explains a wrong email or password", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe(
      "Wrong email or password.",
    );
  });

  it("tells an unconfirmed user to confirm their email", () => {
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(/Confirm your email/);
  });

  it("points an existing user to the login page", () => {
    expect(authErrorMessage({ code: "user_already_exists" })).toMatch(/Log in instead/);
    expect(authErrorMessage({ code: "email_exists" })).toMatch(/Log in instead/);
  });

  it("recognises a network failure", () => {
    expect(authErrorMessage({ name: "AuthRetryableFetchError", status: 0 })).toBe(NETWORK_MESSAGE);
    expect(authErrorMessage({ message: "Failed to fetch" })).toBe(NETWORK_MESSAGE);
  });

  it("falls back to a general message and never shows a raw error", () => {
    expect(authErrorMessage({ code: "something_new", message: "PGRST301: JWT expired" })).toBe(
      FALLBACK_MESSAGE,
    );
    expect(authErrorMessage(null)).toBe(FALLBACK_MESSAGE);
  });
});
