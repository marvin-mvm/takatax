import { describe, expect, it } from "vitest";

import { loginSchema, signUpSchema } from "./schemas";

describe("signUpSchema", () => {
  it("accepts a valid sign-up and tidies the name and email", () => {
    const result = signUpSchema.safeParse({
      fullName: "  Maria Santos ",
      email: "  Maria@Example.COM ",
      password: "correct horse",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      fullName: "Maria Santos",
      email: "maria@example.com",
      password: "correct horse",
    });
  });

  it("rejects a missing name, a bad email and a short password", () => {
    const result = signUpSchema.safeParse({
      fullName: " ",
      email: "not-an-email",
      password: "short",
    });

    expect(result.success).toBe(false);
    const messages = result.error?.flatten().fieldErrors;
    expect(messages?.fullName).toEqual(["Enter your name."]);
    expect(messages?.email).toEqual(["Enter a valid email address."]);
    expect(messages?.password).toEqual(["Use at least 8 characters."]);
  });

  it("rejects a password longer than Supabase stores", () => {
    const result = signUpSchema.safeParse({
      fullName: "Maria Santos",
      email: "maria@example.com",
      password: "x".repeat(73),
    });

    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("asks for both fields", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });

    expect(result.success).toBe(false);
    const messages = result.error?.flatten().fieldErrors;
    expect(messages?.email?.[0]).toBe("Enter your email address.");
    expect(messages?.password?.[0]).toBe("Enter your password.");
  });

  it("does not apply the sign-up length rule to an existing password", () => {
    expect(loginSchema.safeParse({ email: "maria@example.com", password: "short" }).success).toBe(
      true,
    );
  });
});
