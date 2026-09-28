import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

const controlClasses =
  "w-full rounded-md border border-line bg-surface px-3 text-sm text-ink " +
  "placeholder:text-muted transition-[border-color,box-shadow] duration-base ease-out " +
  "hover:border-line-strong " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const fieldWrapperClasses = "flex flex-col gap-1.5";

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(fieldWrapperClasses, className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-medium tracking-wide text-text-soft"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  /** Icon or adornment pinned inside the left edge of the control. */
  leadingIcon?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  id,
  className,
  ...rest
}: InputProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        {leadingIcon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          >
            {leadingIcon}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          className={cn(
            controlClasses,
            "h-10",
            leadingIcon && "pl-9",
            error && "border-danger focus:border-danger focus:ring-danger/25",
          )}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function Select({ label, hint, error, id, className, ...rest }: SelectProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          controlClasses,
          "h-10 cursor-pointer pr-8",
          error && "border-danger focus:border-danger focus:ring-danger/25",
        )}
        {...rest}
      />
    </FieldShell>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
}

export function Textarea({ label, hint, error, id, className, ...rest }: TextareaProps) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          controlClasses,
          "min-h-24 resize-y py-2.5 leading-relaxed",
          error && "border-danger focus:border-danger focus:ring-danger/25",
        )}
        {...rest}
      />
    </FieldShell>
  );
}
