import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

/** What the sign-up form sends. Checked in the browser before anything goes to Supabase. */
export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(120, "Keep your name under 120 characters."),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
});

/** What the login form sends. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(72, "Use 72 characters or fewer."),
});

export type SignUpValues = z.infer<typeof signUpSchema>;
export type LoginValues = z.infer<typeof loginSchema>;
