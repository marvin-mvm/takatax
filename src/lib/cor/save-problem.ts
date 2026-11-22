/**
 * Why confirming a COR failed, in words the owner can act on.
 *
 * Supabase returns a database error as a plain object ({ code, message, details, hint }), not as
 * an `Error`, so the code and message are read from either shape.
 */

/** The error's code and message, from an `Error`, a Supabase error object or anything else. */
export function errorParts(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : "",
      message: typeof message === "string" ? message : "",
    };
  }
  return { code: "", message: typeof error === "string" ? error : "" };
}

export function corSaveProblem(error: unknown): string {
  const { code, message } = errorParts(error);
  // 23505: a unique column. The only one confirm_cor writes is the TIN.
  if (code === "23505" || /duplicate|unique/i.test(message)) {
    return "This TIN already belongs to another Takatax account. Each TIN can have one account: log in to that account, or ask its owner to invite you.";
  }
  // 22007 / 22008: a date the database cannot read.
  if (code === "22007" || code === "22008" || /date\/time|type date/i.test(message)) {
    return "The registration date is not a valid date. Pick it again from the date box.";
  }
  if (code === "42501" || /COR not found/i.test(message)) {
    return "This COR could not be found on your account, or you no longer have access to it. Reload the page and try again.";
  }
  if (code === "22P02" || /invalid input value for enum/i.test(message)) {
    return "One of the choices is not valid. Pick the income tax option again.";
  }
  return message
    ? `We could not save your COR: ${message}`
    : "We could not save your COR. Please check the fields and try again.";
}
