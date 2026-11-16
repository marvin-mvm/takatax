import { createFileRoute } from "@tanstack/react-router";

import { Deck } from "@/components/deck/Deck";

const title = "Takatax pitch deck";
const description =
  "Idea validation, the one-page PRD, a what-if revenue model, the architecture and the build plan for Takatax: AI for your BIR figures and tax monitoring.";

export const Route = createFileRoute("/deck")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "author", content: "Takatax" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Deck,
});
