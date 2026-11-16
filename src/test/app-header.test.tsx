import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/app";

const auth = vi.hoisted(() => ({
  state: {
    status: "signedIn",
    user: {
      id: "u1",
      email: "maria@example.com",
      user_metadata: { full_name: "Maria Santos", account_type: "taxpayer" },
    },
  } as unknown,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("@/lib/auth/use-auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth/use-auth")>()),
  useAuth: () => auth.state,
}));
vi.mock("@/lib/data/queries", () => ({
  useConversations: () => ({ data: undefined }),
  useIsAdmin: () => ({ data: false }),
}));
// No router in this test: links render as plain links and the page inside is a placeholder.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ children, to, className, title }: Record<string, unknown>) => (
    <a href={to as string} className={className as string} title={title as string}>
      {children as ReactNode}
    </a>
  ),
  Outlet: () => <p>The page</p>,
  useLocation: () => ({ pathname: "/app" }),
  useNavigate: () => vi.fn(),
}));

const Layout = (Route as unknown as { component: ComponentType }).component;

afterEach(cleanup);

describe("the /app header", () => {
  it('greets the user by first name, as a link to the account settings, in place of "Log out"', () => {
    render(<Layout />);

    const header = screen.getByRole("banner");
    const greeting = within(header).getByRole("link", { name: "Hi Maria" });
    expect(greeting).toHaveAttribute("href", "/app/settings");
    expect(within(header).queryByRole("button", { name: /Log out/ })).not.toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Pricing" })).toBeInTheDocument();
  });

  it("scrolls away with the page on a phone and stays in view on wider screens", () => {
    render(<Layout />);

    const classes = screen.getByRole("banner").className.split(/\s+/);
    expect(classes).toContain("md:sticky");
    expect(classes).not.toContain("sticky");
    expect(classes).not.toContain("fixed");
  });

  it("falls back to the start of the email when no name was given", () => {
    auth.state = {
      status: "signedIn",
      user: { id: "u2", email: "juan.cruz@example.com", user_metadata: {} },
    };
    render(<Layout />);
    expect(screen.getByRole("link", { name: "Hi juan.cruz" })).toBeInTheDocument();
  });

  it("keeps the plan out of the tabs: it is on the account settings page", () => {
    render(<Layout />);

    const tabs = within(screen.getByRole("navigation", { name: "Account" }));
    expect(tabs.queryByRole("link", { name: "Plan" })).not.toBeInTheDocument();
    expect(tabs.getByRole("link", { name: "Documents" })).toBeInTheDocument();
  });
});
