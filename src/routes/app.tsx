import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AppUserContext } from "@/components/app/app-user";
import { SiteShell, headerButton } from "@/components/site/SiteShell";
import { supabase } from "@/integrations/supabase/client";
import { useConversations, useIsAdmin } from "@/lib/data/queries";
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

/** "Messages", with the number of unread conversations. */
function MessagesTab({ role, userId }: { role: AccountRole; userId: string }) {
  const query = useConversations(userId, role);
  const unread = query.data?.source === "live" ? query.data.data.filter((c) => c.unread).length : 0;
  return (
    <Link to="/app/messages" className={tab}>
      Messages
      {unread > 0 ? (
        <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-tk-brand px-1.5 text-[12px] font-semibold text-white">
          {unread}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
    </Link>
  );
}

/** The section tabs under the header: taxpayers and partners see different screens. */
function AppNav({ role, userId }: { role: AccountRole; userId: string }) {
  const admin = useIsAdmin(userId).data === true;
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    navRef.current
      ?.querySelector('[data-status="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <nav ref={navRef} aria-label="Account" className="border-b border-tk-line bg-tk-surface">
      <div className="relative mx-auto flex max-w-[1120px] gap-1 overflow-x-auto px-2 sm:px-4">
        {isPartner(role) ? (
          <>
            <Link to="/app" activeOptions={{ exact: true }} className={tab}>
              Clients
            </Link>
            <MessagesTab role={role} userId={userId} />
            <Link to="/app/profile" className={tab}>
              My profile
            </Link>
            <Link to="/community" className={tab}>
              Community
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
            <MessagesTab role={role} userId={userId} />
            <Link to="/app/access" className={tab}>
              Access
            </Link>
            <Link to="/app/plan" className={tab}>
              Plan
            </Link>
            <Link to="/bookkeepers" className={tab}>
              Find a bookkeeper
            </Link>
            <Link to="/community" className={tab}>
              Community
            </Link>
          </>
        )}
        {admin ? (
          <Link to="/app/admin" className={tab}>
            Staff
          </Link>
        ) : null}
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
