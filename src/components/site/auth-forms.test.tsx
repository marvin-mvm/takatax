import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./LoginForm";
import { SignUpForm } from "./SignUpForm";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
}));

// The forms talk to Supabase through this one module, so the tests replace it.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  auth.signUp.mockReset();
  auth.signInWithPassword.mockReset();
});

afterEach(cleanup);

describe("SignUpForm", () => {
  const fillIn = () => {
    type("Your name", " Maria Santos ");
    type("Email", "Maria@Example.com");
    type("Password", "correct horse");
  };

  it("shows what is wrong and sends nothing when the form is empty", async () => {
    render(<SignUpForm onSignedIn={vi.fn()} onGoToLogin={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("creates the account and continues when Supabase logs the user in", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null });
    const onSignedIn = vi.fn();
    render(<SignUpForm onSignedIn={onSignedIn} onGoToLogin={vi.fn()} />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "maria@example.com",
      password: "correct horse",
      options: {
        data: { full_name: "Maria Santos", account_type: "taxpayer" },
        emailRedirectTo: `${window.location.origin}/app`,
      },
    });
  });

  it("signs a bookkeeper up as a partner", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null });
    render(<SignUpForm onSignedIn={vi.fn()} onGoToLogin={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Bookkeeper"));
    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(auth.signUp).toHaveBeenCalledOnce());
    expect(auth.signUp.mock.calls[0]?.[0].options.data).toEqual({
      full_name: "Maria Santos",
      account_type: "bookkeeper",
    });
  });

  it("asks the user to check their email when the project needs confirmation", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", identities: [{ id: "i1" }] }, session: null },
      error: null,
    });
    const onSignedIn = vi.fn();
    const onGoToLogin = vi.fn();
    render(<SignUpForm onSignedIn={onSignedIn} onGoToLogin={onGoToLogin} />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText("maria@example.com")).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Go to log in" }));
    expect(onGoToLogin).toHaveBeenCalledOnce();
  });

  it("says so when the email already has an account", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", identities: [] }, session: null },
      error: null,
    });
    render(<SignUpForm onSignedIn={vi.fn()} onGoToLogin={vi.fn()} />);

    fillIn();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This email already has an account. Log in instead.",
    );
  });
});

describe("LoginForm", () => {
  it("logs in with the typed email and password", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: {} }, error: null });
    const onSignedIn = vi.fn();
    render(<LoginForm onSignedIn={onSignedIn} />);

    type("Email", " Maria@Example.com");
    type("Password", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "maria@example.com",
      password: "correct horse",
    });
  });

  it("explains a wrong password and stays on the form", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const onSignedIn = vi.fn();
    render(<LoginForm onSignedIn={onSignedIn} />);

    type("Email", "maria@example.com");
    type("Password", "wrong password");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("reports a dropped connection in plain words", async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<LoginForm onSignedIn={vi.fn()} />);

    type("Email", "maria@example.com");
    type("Password", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server.");
  });
});
