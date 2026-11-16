/**
 * Trigger.dev: the background jobs that read documents (see trigger/read-run.ts) and a `ping`
 * task to check the connection.
 *
 * Local test: `npx trigger.dev@4.8.3 login`, then `npx trigger.dev@4.8.3 dev`.
 * Production: `npx trigger.dev@4.8.3 deploy`.
 * The CLI version matches the SDK in package.json (4.8.3).
 */

import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env["TRIGGER_PROJECT_REF"] ?? "proj_afhlvwluvvvtblfsplyn",
  runtime: "node",
  dirs: ["./trigger"],
  // The default small machine (0.5 vCPU, 0.5 GB) is enough: the job mostly waits for the
  // model. read-documents asks for a bigger one when a run holds large PDFs.
  machine: "small-1x",
  maxDuration: 3_600,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2 },
  },
});
