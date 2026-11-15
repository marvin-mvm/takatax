/** The parts of a Supabase auth error this app reads. */
export interface AuthErrorLike {
  code?: string | undefined;
  message?: string | undefined;
  name?: string | undefined;
  status?: number | undefined;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  email_not_confirmed: "Confirm your email first. We sent you a link when you signed up.",
  user_already_exists: "This email already has an account. Log in instead.",
  email_exists: "This email already has an account. Log in instead.",
  weak_password: "Choose a stronger password.",
  signup_disabled: "Sign-ups are closed right now.",
  email_address_invalid: "That email address was not accepted. Try another one.",
  email_address_not_authorized: "We cannot send email to that address yet. Try another one.",
  over_email_send_rate_limit: "Too many emails sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many tries. Wait a minute and try again.",
  user_banned: "This account is suspended. Contact support.",
};

export const NETWORK_MESSAGE =
  "We could not reach the server. Check your connection and try again.";
export const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/** Turns a Supabase auth error into one plain sentence that says what to do next. */
export function authErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return FALLBACK_MESSAGE;
  if (error.code && error.code in MESSAGES) return MESSAGES[error.code] ?? FALLBACK_MESSAGE;
  const isNetworkError =
    error.name === "AuthRetryableFetchError" ||
    error.status === 0 ||
    /failed to fetch|network|load failed/i.test(error.message ?? "");
  return isNetworkError ? NETWORK_MESSAGE : FALLBACK_MESSAGE;
}
