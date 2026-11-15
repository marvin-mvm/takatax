import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { supabase } from "@/integrations/supabase/client";
import { NETWORK_MESSAGE, authErrorMessage } from "@/lib/auth/errors";
import { signUpSchema, type SignUpValues } from "@/lib/auth/schemas";

import { Field, FormError } from "./form";
import { buttonOutline, buttonPrimary } from "./styles";

interface SignUpFormProps {
  /** Called when the new account is logged in straight away. */
  onSignedIn: () => void;
  /** Called from the "check your email" step. */
  onGoToLogin: () => void;
}

export function SignUpForm({ onSignedIn, onGoToLogin }: SignUpFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [emailToConfirm, setEmailToConfirm] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { full_name: values.fullName },
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });
      if (error) {
        setFormError(authErrorMessage(error));
      } else if (data.session) {
        onSignedIn();
      } else if (data.user?.identities?.length === 0) {
        // Supabase answers like this, without an error, when the email is already taken.
        setFormError(authErrorMessage({ code: "user_already_exists" }));
      } else {
        // The project asks new users to confirm their email before the first login.
        setEmailToConfirm(values.email);
      }
    } catch {
      setFormError(NETWORK_MESSAGE);
    }
  });

  if (emailToConfirm) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="flex size-11 items-center justify-center rounded-full bg-tk-brand-soft text-tk-brand">
          <MailCheck aria-hidden className="size-5" strokeWidth={1.75} />
        </span>
        <h2 className="text-xl font-semibold">Check your email</h2>
        <p className="text-tk-muted text-pretty">
          We sent a link to <strong className="font-semibold text-tk-ink">{emailToConfirm}</strong>.
          Open it to confirm your account, then log in.
        </p>
        <button type="button" onClick={onGoToLogin} className={buttonOutline}>
          Go to log in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {formError ? <FormError>{formError}</FormError> : null}
      <Field
        label="Your name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Field
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register("password")}
      />
      <button type="submit" disabled={isSubmitting} className={`${buttonPrimary} mt-2`}>
        {isSubmitting ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
