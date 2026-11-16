import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MB } from "@shared/uploads/usage.ts";
import type { AccountUsage } from "@/lib/data/types";

import { UsageMeters } from "./UsageMeters";

const queries = vi.hoisted(() => ({ useUsage: vi.fn() }));
vi.mock("@/lib/data/queries", () => queries);
// The card only needs its link to render; there is no router in this test.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children?: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const usage = (changes: Partial<AccountUsage> = {}): AccountUsage => ({
  accountId: "11111111-1111-4111-8111-111111111111",
  tier: "standard",
  premiumUntil: null,
  pagesUsed: 75,
  pagesReadInAll: 90,
  storageBytes: 240 * MB,
  files: 61,
  ...changes,
});
const loaded = (data: AccountUsage) => queries.useUsage.mockReturnValue({ data: { data } });

afterEach(cleanup);

describe("UsageMeters", () => {
  it("shows pages and storage as used / limit, each with a bar", () => {
    loaded(usage());
    render(<UsageMeters userId="u1" />);

    expect(screen.getByRole("heading", { name: /Your usage/ })).toHaveTextContent("Standard");
    expect(screen.getByText("75 / 80 pages")).toBeInTheDocument();
    expect(screen.getByText("240 MB / 300 MB")).toBeInTheDocument();

    const pages = screen.getByRole("meter", { name: "AI doc parsing" });
    expect(pages).toHaveAttribute("aria-valuenow", "94");
    expect(pages).toHaveAttribute("aria-valuetext", "75 of 80 pages");
    const storage = screen.getByRole("meter", { name: "Doc storage" });
    expect(storage).toHaveAttribute("aria-valuenow", "80");
    expect(storage).toHaveAttribute("aria-valuetext", "240 MB of 300 MB");
  });

  it("asks for the signed-in user's usage", () => {
    loaded(usage());
    render(<UsageMeters userId="u1" />);
    expect(queries.useUsage).toHaveBeenCalledWith("u1");
  });

  it("counts a Premium account's month and its 15 GB", () => {
    loaded(usage({ tier: "premium", premiumUntil: "2026-12-14T04:00:00Z", pagesUsed: 120 }));
    render(<UsageMeters userId="u1" />);

    expect(screen.getByRole("heading", { name: /Your usage/ })).toHaveTextContent("Premium");
    expect(screen.getByText("120 / 300 pages")).toBeInTheDocument();
    expect(screen.getByText("240 MB / 15 GB")).toBeInTheDocument();
  });

  it("draws a sliver for one page and nothing for none", () => {
    loaded(usage({ pagesUsed: 1, storageBytes: 0, files: 0 }));
    render(<UsageMeters userId="u1" />);

    const bar = (name: string) =>
      screen.getByRole("meter", { name }).firstElementChild as HTMLElement;
    expect(bar("AI doc parsing").style.width).toBe("2%");
    expect(bar("Doc storage").style.width).toBe("0%");
  });

  it("links to the account settings page only when asked to", () => {
    loaded(usage());
    const { unmount } = render(<UsageMeters userId="u1" settingsLink />);
    expect(screen.getByRole("link", { name: "Account settings" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
    unmount();

    render(<UsageMeters userId="u1" />);
    expect(screen.queryByRole("link", { name: "Account settings" })).not.toBeInTheDocument();
  });

  it("says it is loading, and stays out of the way when the usage cannot be loaded", () => {
    queries.useUsage.mockReturnValue({ data: undefined, isError: false });
    const { unmount } = render(<UsageMeters userId="u1" />);
    expect(within(screen.getByRole("status")).getByText("Loading your usage…")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    unmount();

    queries.useUsage.mockReturnValue({ data: undefined, isError: true });
    const { container } = render(<UsageMeters userId="u1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
