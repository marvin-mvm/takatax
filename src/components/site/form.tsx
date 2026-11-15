import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Shown under the input until there is an error. */
  hint?: string;
  error?: string | undefined;
}

/** A labelled input. The label sits above, the hint below, and an error replaces the hint. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, id, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "mt-1.5 block min-h-11 w-full rounded-[10px] border bg-tk-surface px-3 text-base text-tk-ink placeholder:text-tk-muted/70",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-brand",
          error ? "border-tk-danger" : "border-tk-line",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={messageId} className="mt-1.5 text-sm text-tk-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-sm text-tk-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** A message about the whole form, for example a wrong password. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-[10px] bg-tk-danger-soft px-3 py-2.5 text-sm font-medium text-tk-danger"
    >
      {children}
    </p>
  );
}

/** The centred card that holds a sign-up or login form. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-12 sm:py-16">
      <div className="rounded-[20px] border border-tk-line bg-tk-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_4px_16px_rgb(0_0_0/0.04)] sm:p-8">
        <h1 className="text-[28px]/[34px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-tk-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
