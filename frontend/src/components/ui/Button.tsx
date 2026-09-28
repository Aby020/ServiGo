"use client";

import Link, { type LinkProps } from "next/link";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button-variants";

/* Re-exported so `import { buttonClasses, Button } from "./Button"` keeps
   working. The implementation itself lives in button-variants.ts, which has no
   "use client" directive and can therefore also be called from a Server
   Component. */
export { buttonClasses };
export type { ButtonSize, ButtonVariant };

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Show an inline spinner and disable the button. */
  loading?: boolean;
  /** Block-level button filling its container width. */
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, cn(fullWidth && "w-full", className))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : leadingIcon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends Omit<LinkProps, "className" | "children"> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

/**
 * A <Link> that wears button styles. It is the *only* sanctioned way to put
 * `leadingIcon` / `trailingIcon` on a link — Next's own `LinkProps` does not
 * carry those, so a bare `<Link leadingIcon=…>` will not type-check.
 */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, cn(fullWidth && "w-full", className))}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </Link>
  );
}
