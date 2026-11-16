import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    ["/pricing", "/pricing"],
    ["/signup", "/signup"],
    ["/login", "/login"],
    ["/app", "/app/"],
    ["/app/upload", "/app/upload"],
    ["/app/documents", "/app/documents/"],
    ["/app/documents/doc-1", "/app/documents/$documentId"],
    ["/app/cor", "/app/cor"],
    ["/app/clients/acct-1", "/app/clients/$accountId"],
    ["/app/messages", "/app/messages/"],
    ["/app/messages/chat-1", "/app/messages/$conversationId"],
    ["/app/access", "/app/access"],
    ["/app/settings", "/app/settings"],
    // The old address of the plan: it sends the browser on to the account settings.
    ["/app/plan", "/app/plan"],
    ["/app/profile", "/app/profile"],
    ["/app/admin", "/app/admin"],
    ["/sitemap.xml", "/sitemap.xml"],
    ["/robots.txt", "/robots.txt"],
    ["/community", "/community/"],
    ["/community/new", "/community/new"],
    ["/community/post-1", "/community/$postId"],
    ["/bookkeepers", "/bookkeepers/"],
    ["/bookkeepers/partner-1", "/bookkeepers/$partnerId"],
  ])("matches a page for %s", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes(path);

    expect(matches.at(-1)?.routeId).toBe(routeId);
  });

  it("sends the old plan address on to the account settings, with what the payment page sent", async () => {
    const router = createRouter({
      routeTree,
      context: { queryClient: new QueryClient() },
      history: createMemoryHistory({ initialEntries: ["/app/plan?paid=premium"] }),
    });

    await router.load();

    expect(router.state.location.pathname).toBe("/app/settings");
    expect(router.state.location.search).toEqual({ paid: "premium" });
  });

  it("matches the pitch deck at /deck", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/deck");

    expect(matches.at(-1)?.routeId).toBe("/deck");
  });
});
