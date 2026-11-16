import type { User } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

import type { AccountRole } from "@/lib/data/types";

export interface AppUser {
  user: User;
  role: AccountRole;
}

/** The signed-in user, provided by the /app layout to every screen inside it. */
export const AppUserContext = createContext<AppUser | null>(null);

export function useAppUser(): AppUser {
  const value = useContext(AppUserContext);
  if (!value) throw new Error("useAppUser must be used inside the /app layout");
  return value;
}
