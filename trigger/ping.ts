/**
 * A tiny task to check that Trigger.dev is connected: run it from the dashboard's Test page.
 * It needs no keys and touches nothing.
 */

import { logger, task } from "@trigger.dev/sdk";

export const ping = task({
  id: "ping",
  maxDuration: 30,
  run: async (payload: { message?: string }) => {
    logger.info("Ping", { message: payload.message ?? "hello" });
    return { ok: true, at: new Date().toISOString(), message: payload.message ?? "hello" };
  },
});
