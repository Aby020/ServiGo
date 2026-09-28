import { cn } from "@/lib/utils";

/**
 * Button styling lives in its own server-safe module rather than in
 * Button.tsx. `Button` and `ButtonLink` are Client Components (they carry
 * `onClick` / loading state), and React forbids *calling* a function exported
 * from a `"use client"` module on the server. Server-rendered pages such as
 * the home page need `buttonClasses()` to hand a class string to a plain
 * `<Link>`, so the pure class builder lives here and `Button.tsx` re-exports
 * it. This keeps a single source of truth for button styling.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-strong active:bg-primary-active",
  secondary:
    "bg-surface text-text border border-line hover:bg-surface-3 hover:border-line-strong",
  ghost: "text-text hover:bg-surface-3",
  accent: "bg-accent text-on-accent hover:bg-accent-strong active:bg-accent-active",
  danger: "bg-danger text-on-danger hover:opacity-90 active:opacity-80",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/**
 * Shared button surface class string. Exported so anchors and <Link>s can wear
 * button styles without rendering a <button>. There is deliberately no
 * polymorphic `as` prop; use `Button` for <button> and this for links.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium select-none",
    "transition-[background-color,color,border-color,opacity] duration-base ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    extra,
  );
}
