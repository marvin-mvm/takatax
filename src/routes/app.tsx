import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Calculator, FileText, Upload, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SiteShell } from "@/components/site/SiteShell";
import { buttonOutline } from "@/components/site/styles";
import { supabase } from "@/integrations/supabase/client";
import { displayName, useAuth } from "@/lib/auth/use-auth";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [{ title: "Your account | Takatax" }, { name: "robots", content: "noindex" }],
  }),
  component: AppPage,
});

const NEXT_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: FileText,
    title: "Add your COR",
    text: "Upload BIR Form 2303 to set up your tax profile.",
  },
  {
    icon: Upload,
    title: "Upload your documents",
    text: "Receipts, invoices and 2307s. Your first 10 are free.",
  },
  {
    icon: Calculator,
    title: "See your figures",
    text: "Your returns, line by line, ready to file.",
  },
];

function AppPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  // True once the user has pressed Log out, so the guard below does not also redirect them.
  const leaving = useRef(false);

  // This page is for logged-in users only. Everyone else is sent to the login page.
  useEffect(() => {
    if (auth.status === "signedOut" && !leaving.current) {
      void navigate({ to: "/login", replace: true });
    }
  }, [auth.status, navigate]);

  // Logs out of this browser only, then goes back to the landing page.
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

  return (
    <SiteShell
      headerAction={
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className={buttonOutline}
        >
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      }
    >
      <section className="mx-auto max-w-[1080px] px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-[32px]/[38px] font-bold tracking-tight text-balance sm:text-[40px]/[46px]">
          Welcome, {displayName(auth.user)}.
        </h1>
        <p className="mt-3 max-w-[60ch] text-lg/7 text-tk-muted text-pretty">
          Your account is ready. The steps below are still being built, so nothing here can be used
          yet.
        </p>

        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {NEXT_STEPS.map(({ icon: Icon, title, text }, index) => (
            <li
              key={title}
              className="rounded-[20px] border-2 border-dashed border-tk-line bg-tk-surface-2 p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-[10px] bg-tk-surface text-tk-muted">
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <span className="rounded-full bg-tk-surface px-3 py-1 text-[13px] font-medium text-tk-muted">
                  Coming soon
                </span>
              </div>
              <h2 className="mt-4 text-lg font-semibold">
                <span className="font-tk-mono text-base text-tk-muted">{index + 1}.</span> {title}
              </h2>
              <p className="mt-1 text-tk-muted text-pretty">{text}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-tk-muted">
          Signed in as <strong className="font-semibold text-tk-ink">{auth.user.email}</strong>.
        </p>
      </section>
    </SiteShell>
  );
}
