import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The Takatax mark: a receipt with a check, on a rounded green square. The same drawing as
 * public/logo.svg (the favicon), public/favicon.ico and public/apple-touch-icon.png; change
 * them together. Square, so it scales to any size: set the size with a class such as size-8.
 *
 * `outlined` adds a thin white ring, for use on the green site header.
 */
export function BrandMark({
  className,
  outlined = false,
}: {
  className?: string;
  outlined?: boolean;
}) {
  // A unique gradient id per mark, so several marks on one page never clash.
  const gradient = `tk-tile-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      className={cn("shrink-0 rounded-[22%]", outlined && "ring-[1.5px] ring-white/90", className)}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12916b" />
          <stop offset="1" stopColor="#0b6249" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradient})`} />
      <path
        fill="#fff"
        d="M19.5 10h25a4.5 4.5 0 0 1 4.5 4.5V54l-4.25-3.25-4.25 3.25-4.25-3.25L32 54l-4.25-3.25L23.5 54l-4.25-3.25L15 54V14.5a4.5 4.5 0 0 1 4.5-4.5z"
      />
      <rect x="23" y="16.5" width="18" height="4" rx="2" fill="#f2a93b" />
      <path
        d="M23 32.5l6.5 6.5 12-14.5"
        fill="none"
        stroke="#0f7a5a"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
