import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PAYMENTS_LIVE } from "@shared/uploads/rules.ts";
import { AppUserContext } from "@/components/app/app-user";
import type { AccountRole, AccountUsage, PlanStatus } from "@/lib/data/types";

import { Route } from "@/routes/app/settings";

const search = vi.hoisted(() => ({ current: {} as { paid?: string } }));
const queries = vi.hoisted(() => ({ usePlan: vi.fn(), useUsage: vi.fn() }));
vi.mock("@/lib/data/queries", () => queries);
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/services/payments", () => ({
  checkoutPremiumMonth: vi.fn(),
  checkoutUnpaidRun: vi.fn(),
}));
// No router in this test: the page only needs its links and the `paid` search value.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ ...options, useSearch: () => search.current }),
  Link: ({ children, to, className }: { children?: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const Page = (Route as unknown as { component: ComponentType }).component;

const user = {
  id: "u1",
  email: "maria@example.com",
  user_metadata: { full_name: "Maria Santos" },
} as unknown as User;

const plan = (changes: Partial<PlanStatus> = {}): PlanStatus => ({
  accountId: "11111111-1111-4111-8111-111111111111",
  trialUsed: false,
  premiumUntil: null,
  premiumPagesLeft: null,
  payments: [],
  ...changes,
});
const usage: AccountUsage = {
  accountId: "11111111-1111-4111-8111-111111111111",
  tier: "standard",
  premiumUntil: null,
  pagesUsed: 75,
  pagesReadInAll: 90,
  storageBytes: 240_000_000,
  files: 61,
};

const signOut = vi.fn();
const show = (role: AccountRole = "taxpayer", signingOut = false) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppUserContext.Provider value={{ user, role, signOut, signingOut }}>
        <Page />
      </AppUserContext.Provider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  search.current = {};
  signOut.mockReset();
  queries.usePlan.mockReturnValue({ data: { data: plan(), source: "live" } });
  queries.useUsage.mockReturnValue({ data: { data: usage, source: "live" } });
});

afterEach(cleanup);

describe("Account settings", () => {
  it("shows who is signed in, with Log out", () => {
    show();

    expect(screen.getByRole("heading", { level: 1, name: "Account settings" })).toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Your details" });
    expect(within(details).getByText("Maria Santos")).toBeInTheDocument();
    expect(within(details).getByText("maria@example.com")).toBeInTheDocument();
    expect(within(details).getByText("Taxpayer")).toBeInTheDocument();

    fireEvent.click(within(details).getByRole("button", { name: "Log out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("locks Log out once it is pressed", () => {
    show("taxpayer", true);
    expect(screen.getByRole("button", { name: "Logging out…" })).toBeDisabled();
  });

  it("shows the current tier, the usage meters and the transaction history", () => {
    show();

    const tier = screen.getByRole("region", { name: "Current tier" });
    expect(within(tier).getByText("Standard")).toBeInTheDocument();
    expect(within(tier).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);

    expect(screen.getByText("75 / 80 pages")).toBeInTheDocument();
    expect(screen.getByText("240 MB / 300 MB")).toBeInTheDocument();
    // The meters are on this page, so they do not link to it.
    expect(screen.queryByRole("link", { name: "Account settings" })).not.toBeInTheDocument();

    const history = screen.getByRole("region", { name: "Transaction history" });
    expect(within(history).getByText(/No transactions yet\./)).toBeInTheDocument();
  });

  it("names Premium and until when it is active", () => {
    queries.usePlan.mockReturnValue({
      data: { data: plan({ premiumUntil: "2999-12-14T04:00:00Z" }), source: "live" },
    });
    show();

    const tier = screen.getByRole("region", { name: "Current tier" });
    expect(within(tier).getByText("Premium")).toBeInTheDocument();
    expect(within(tier).getByText("Active until Dec 14, 2999")).toBeInTheDocument();
  });

  it("lists every payment, newest first as loaded", () => {
    queries.usePlan.mockReturnValue({
      data: {
        data: plan({
          payments: [
            {
              id: "p2",
              runId: null,
              purpose: "premium_month",
              amount: 649,
              status: "paid",
              createdAt: "2026-11-16T04:00:00Z",
            },
            {
              id: "p1",
              runId: "r1",
              purpose: "run",
              amount: 149,
              status: "pending",
              createdAt: "2026-11-02T04:00:00Z",
            },
          ],
        }),
        source: "live",
      },
    });
    show();

    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Nov 16, 2026");
    expect(rows[0]).toHaveTextContent("Premium, 30 days");
    expect(rows[0]).toHaveTextContent("₱649.00");
    expect(rows[0]).toHaveTextContent("Paid");
    expect(rows[1]).toHaveTextContent("Standard run");
    expect(rows[1]).toHaveTextContent("₱149.00");
    expect(within(rows[1] as HTMLElement).getByRole("button", { name: "Pay now" })).toBeEnabled();
  });

  it("gives a professional their own page: no meters, no Premium offer, a link to the profile", () => {
    queries.usePlan.mockReturnValue({ data: { data: plan({ accountId: "" }), source: "live" } });
    show("cpa");

    expect(
      within(screen.getByRole("region", { name: "Your details" })).getByText("CPA"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit my public profile" })).toHaveAttribute(
      "href",
      "/app/profile",
    );
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Premium/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("Pages and storage are counted on each client's account."),
    ).toBeInTheDocument();
  });

  it("offers Premium only once payments are live", () => {
    show();
    const premium = screen.getByRole("region", { name: /Premium/ });
    const button = within(premium).getByRole("button");
    if (PAYMENTS_LIVE) expect(button).toBeEnabled();
    else {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Coming soon");
    }
  });

  it("thanks the person who comes back from the payment page", () => {
    search.current = { paid: "premium" };
    show();
    expect(screen.getByText(/Your payment is being confirmed/)).toBeInTheDocument();
  });

  it("says so while loading and when the account cannot be loaded", () => {
    queries.usePlan.mockReturnValue({ isPending: true });
    const { unmount } = show();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your account…");
    unmount();

    queries.usePlan.mockReturnValue({ isError: true });
    show();
    expect(screen.getByText("We could not load your account.")).toBeInTheDocument();
  });
});
