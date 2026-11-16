import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The plan and the payments are on the account settings page now. This address still works
 * because old links and the payment provider's return links point here: it passes `paid` on.
 */
export const Route = createFileRoute("/app/plan")({
  validateSearch: (search: Record<string, unknown>): { paid?: string } =>
    typeof search["paid"] === "string" ? { paid: search["paid"] } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/app/settings", search, replace: true });
  },
});
