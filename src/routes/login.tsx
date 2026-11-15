import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AuthCard } from "@/components/site/form";
import { LoginForm } from "@/components/site/LoginForm";
import { SiteShell } from "@/components/site/SiteShell";
import { textLink } from "@/components/site/styles";
import { useAuth } from "@/lib/auth/use-auth";

const title = "Log in | Takatax";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: "Log in to your Takatax account." },
      { property: "og:title", content: title },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const auth = useAuth();

  // Someone who is already logged in goes straight to the app.
  useEffect(() => {
    if (auth.status === "signedIn") void navigate({ to: "/app", replace: true });
  }, [auth.status, navigate]);

  return (
    <SiteShell>
      <AuthCard title="Log in" subtitle="Welcome back.">
        <LoginForm onSignedIn={() => void navigate({ to: "/app" })} />
        <p className="mt-6 text-center text-tk-muted">
          New to Takatax?{" "}
          <Link to="/signup" className={textLink}>
            Create an account
          </Link>
        </p>
      </AuthCard>
    </SiteShell>
  );
}
