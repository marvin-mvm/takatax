import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { supabase } from "@/integrations/supabase/client";
import { NETWORK_MESSAGE, authErrorMessage } from "@/lib/auth/errors";
import { loginSchema, type LoginValues } from "@/lib/auth/schemas";

import { Field, FormError } from "./form";
import { buttonPrimary } from "./styles";

interface LoginFormProps {
  /** Called once Supabase has accepted the email and password. */
  onSignedIn: () => void;
}

export function LoginForm({ onSignedIn }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) setFormError(authErrorMessage(error));
      else onSignedIn();
    } catch {
      setFormError(NETWORK_MESSAGE);
    }
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {formError ? <FormError>{formError}</FormError> : null}
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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <button type="submit" disabled={isSubmitting} className={`${buttonPrimary} mt-2`}>
        {isSubmitting ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
