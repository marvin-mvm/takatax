import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AppUserContext } from "@/components/app/app-user";
import { SiteShell, headerButton } from "@/components/site/SiteShell";
import { supabase } from "@/integrations/supabase/client";
import { isPartner, roleOf } from "@/lib/data/repository";
import type { AccountRole } from "@/lib/data/types";
import { useAuth } from "@/lib/auth/use-auth";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ title: "Your account | Takatax" }, { name: "robots", content: "noindex" }],
  }),
  component: AppLayout,
});

// The router marks the current tab with data-status="active".
const tab =
  "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-[15px] font-medium text-tk-muted transition-colors hover:text-tk-ink data-[status=active]:border-tk-brand data-[status=active]:text-tk-ink";

/** The section tabs under the header: taxpayers and partners see different screens. */
function AppNav({ role, userId }: { role: AccountRole; userId: string }) {
  return (
    <nav aria-label="Account" className="border-b border-tk-line bg-tk-surface">
      <div className="mx-auto flex max-w-[1120px] gap-1 relative overflow-x-auto px-2 sm:px-4">
        {isPartner(role) ? (
          <>
            <Link to="/app" activeOptions={{ exact: true }} className={tab}>
              Clients
            </Link>
            <Link to="/community" className={tab}>
              Community
            </Link>
            <Link to="/bookkeepers/$partnerId" params={{ partnerId: userId }} className={tab}>
              My public profile
            </Link>
          </>
        ) : (
          <>
            <Link to="/app" activeOptions={{ exact: true }} className={tab}>
              Tracker
            </Link>
            <Link to="/app/upload" className={tab}>
              Upload
            </Link>
            <Link to="/app/documents" className={tab}>
              Documents
            </Link>
            <Link to="/app/cor" className={tab}>
              My COR
            </Link>
            <Link to="/bookkeepers" className={tab}>
              Find a bookkeeper
            </Link>
            <Link to="/community" className={tab}>
              Community
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

/** Every /app screen: signed-in users only, with the section tabs and Log out. */
function AppLayout() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  // True once the user has pressed Log out, so the guard below does not also redirect them.
  const leaving = useRef(false);

  useEffect(() => {
    if (auth.status === "signedOut" && !leaving.current) {
      void navigate({ to: "/login", replace: true });
    }
  }, [auth.status, navigate]);

  const signOut = async () => {
    leaving.current = true;
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      void navigate({ to: "/", replace: true });
    }
  };

  if (auth.status !== "signedIn") {
    return (
      <SiteShell>
        <p role="status" className="px-4 py-24 text-center text-tk-muted">
          Loading your account…
        </p>
      </SiteShell>
    );
  }

  const role = roleOf(auth.user);
  return (
    <AppUserContext.Provider value={{ user: auth.user, role }}>
      <SiteShell
        subnav={<AppNav role={role} userId={auth.user.id} />}
        headerAction={
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className={headerButton}
          >
            {signingOut ? "Logging out…" : "Log out"}
          </button>
        }
      >
        <div className="mx-auto max-w-[1120px] px-4 pt-8 pb-24 sm:px-6">
          <Outlet />
        </div>
      </SiteShell>
    </AppUserContext.Provider>
  );
}
