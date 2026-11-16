import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth/use-auth";

const headerLink =
  "rounded-[10px] px-3 py-2 text-[15px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** A light button for the solid green header. */
export const headerButton =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-white px-4 text-[15px] font-semibold text-tk-brand transition-colors hover:bg-tk-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-70";

function Logo() {
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-[8px] bg-tk-surface"
    >
      <svg viewBox="0 0 48 48" className="size-7" fill="none">
        <path
          d="M12 6h24v32l-4-3-4 3-4-3-4 3-4-3-4 3V6Z"
          className="fill-tk-brand"
        />
        <path
          d="M18 15h12M18 21h12"
          stroke="var(--tk-surface)"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
        <path
          d="m22 31 5 5 13-14"
          className="stroke-tk-accent"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
      </svg>
    </span>
  );
}

/**
 * The top bar, in solid brand green: the brand on the left; Community, Bookkeepers and Pricing;
 * and the login link in the top right corner.
 */
function SiteHeader({ action }: { action?: ReactNode }) {
  const auth = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-tk-brand text-white shadow-[0_1px_0_rgb(0_0_0/0.08)]">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-2 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Logo />
          Takatax
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <Link to="/community" className={`${headerLink} hidden md:inline-flex`}>
            Community
          </Link>
          <Link to="/bookkeepers" className={`${headerLink} hidden md:inline-flex`}>
            Bookkeepers
          </Link>
          <Link to="/pricing" className={headerLink}>
            Pricing
          </Link>
          <span className="ml-1">
            {action ??
              (auth.status === "signedIn" ? (
                <Link to="/app" className={headerButton}>
                  Open app
                </Link>
              ) : (
                <Link to="/login" className={headerButton}>
                  Log in
                </Link>
              ))}
          </span>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-tk-line bg-tk-surface/60">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-4 px-4 py-8 text-sm text-tk-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-[60ch] text-pretty">
          Takatax computes figures from your documents. It is not tax advice, it does not file with
          the BIR, and it never handles payments between you and your bookkeeper.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/community" className="hover:text-tk-ink">
            Community
          </Link>
          <Link to="/bookkeepers" className="hover:text-tk-ink">
            Bookkeepers
          </Link>
          <Link to="/pricing" className="hover:text-tk-ink">
            Pricing
          </Link>
          <Link to="/deck" className="hover:text-tk-ink">
            Pitch deck
          </Link>
          <Link to="/login" className="hover:text-tk-ink">
            Log in
          </Link>
        </nav>
      </div>
    </footer>
  );
}

interface SiteShellProps {
  children: ReactNode;
  /** Replaces the login link in the top right corner, for example with a Log out button. */
  headerAction?: ReactNode;
  /** A second bar under the header, for example the app's section tabs. */
  subnav?: ReactNode;
}

/** The frame every page shares: brand colours and fonts, header, content, footer. */
export function SiteShell({ children, headerAction, subnav }: SiteShellProps) {
  return (
    <div className="tk-theme tk-page-gradient flex min-h-screen flex-col font-tk-sans text-tk-ink antialiased">
      <SiteHeader action={headerAction} />
      {subnav}
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
