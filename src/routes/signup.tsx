import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AuthCard } from "@/components/site/form";
import { SignUpForm } from "@/components/site/SignUpForm";
import { SiteShell } from "@/components/site/SiteShell";
import { textLink } from "@/components/site/styles";
import { useAuth } from "@/lib/auth/use-auth";

const title = "Create your account | Takatax";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: "Create a free Takatax account with your email." },
      { property: "og:title", content: title },
    ],
  }),
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  // Someone who is already logged in goes straight to the app.
  useEffect(() => {
    if (auth.status === "signedIn") void navigate({ to: "/app", replace: true });
  }, [auth.status, navigate]);

  return (
    <SiteShell>
      <AuthCard title="Create your account" subtitle="Free to start. No card needed.">
        <SignUpForm
          onSignedIn={() => void navigate({ to: "/app" })}
          onGoToLogin={() => void navigate({ to: "/login" })}
        />
        <p className="mt-6 text-center text-tk-muted">
          Already have an account?{" "}
          <Link to="/login" className={textLink}>
            Log in
          </Link>
        </p>
      </AuthCard>
    </SiteShell>
  );
}
