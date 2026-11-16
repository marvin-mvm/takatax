/**
 * Trigger.dev: the background jobs that read documents (see trigger/read-run.ts).
 *
 * Deploy with `npx trigger.dev@4.8.3 deploy` after `npx trigger.dev@4.8.3 login`.
 * MISSING: set TRIGGER_PROJECT_REF to your project ref (Trigger.dev dashboard -> Project
 * settings, for example "proj_abc123"), or write it in place of the fallback below.
 */

import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env["TRIGGER_PROJECT_REF"] ?? "proj_replace_with_your_project_ref",
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
