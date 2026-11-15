import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth/use-auth";

import { buttonOutline } from "./styles";

function Logo() {
  return (
    <span
      aria-hidden
      className="flex size-8 items-center justify-center rounded-[9px] bg-tk-brand font-tk-mono text-base font-medium text-tk-surface"
    >
      ₱
    </span>
  );
}

/** The top bar: the brand on the left, Pricing and the login link in the top right corner. */
function SiteHeader({ action }: { action?: ReactNode }) {
  const auth = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-tk-line bg-tk-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Logo />
          Takatax
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-3">
          <Link
            to="/pricing"
            className="rounded-[10px] px-3 py-2 font-medium text-tk-muted hover:text-tk-ink"
            activeProps={{ className: "text-tk-ink" }}
          >
            Pricing
          </Link>
          {action ??
            (auth.status === "signedIn" ? (
              <Link to="/app" className={buttonOutline}>
                Open app
              </Link>
            ) : (
              <Link to="/login" className={buttonOutline}>
                Log in
              </Link>
            ))}
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-tk-line">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-3 px-4 py-8 text-sm text-tk-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-[60ch] text-pretty">
          Takatax computes figures from your documents. It is not tax advice, and it does not file
          with the BIR.
        </p>
        <nav aria-label="Footer" className="flex gap-5">
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
}

/** The frame every public page shares: brand colours and fonts, header, content, footer. */
export function SiteShell({ children, headerAction }: SiteShellProps) {
  return (
    <div className="tk-theme flex min-h-screen flex-col bg-tk-bg font-tk-sans text-tk-ink antialiased">
      <SiteHeader action={headerAction} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
