/**
 * A "(?)" beside a label. Hover it, tab to it or tap it to read a short explanation in the
 * Takatax theme, in place of the browser's own tooltip.
 */

import * as Tooltip from "@radix-ui/react-tooltip";
import { CircleHelp, Info } from "lucide-react";
import { useState } from "react";

export function Hint({
  label,
  text,
  icon = "help",
}: {
  /** What the mark is for, read by screen readers: "About Parsed Records". */
  label: string;
  /** The explanation shown. */
  text: string;
  icon?: "help" | "info";
}) {
  const [open, setOpen] = useState(false);
  const Icon = icon === "info" ? Info : CircleHelp;
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root open={open} onOpenChange={setOpen}>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            // A tap has no hover, so a click opens it too (and keeps it open on a desktop).
            onClick={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            className="inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full text-tk-muted transition-colors hover:text-tk-brand focus-visible:text-tk-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-brand"
          >
            <Icon aria-hidden className="size-4" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            collisionPadding={12}
            className="tk-theme z-50 max-w-[260px] rounded-[10px] bg-tk-ink px-3 py-2 text-left font-tk-sans text-[13px]/[18px] font-normal text-pretty text-tk-surface shadow-[0_8px_24px_rgb(0_0_0/0.2)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
          >
            {text}
            <Tooltip.Arrow className="fill-tk-ink" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
