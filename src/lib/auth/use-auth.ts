import type { Session, User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AuthState =
  { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User };

const toState = (session: Session | null): AuthState =>
  session ? { status: "signedIn", user: session.user } : { status: "signedOut" };

/**
 * The visitor's login state. It starts as "loading" on the server and on the first render
 * in the browser, because the session lives in the browser's storage.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState(toState(data.session));
      })
      .catch(() => {
        if (active) setState({ status: "signedOut" });
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState(toState(session));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** The name to greet a user by: the name they signed up with, else the start of their email. */
export function displayName(user: Pick<User, "email" | "user_metadata">): string {
  const fullName: unknown = user.user_metadata["full_name"];
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  return user.email?.split("@")[0] ?? "there";
}
