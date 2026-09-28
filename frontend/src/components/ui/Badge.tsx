import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "energy"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  /** Small leading dot — used for "live"/status chips. */
  dot?: boolean;
  size?: "sm" | "md";
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-text-soft border-line-strong",
  primary: "bg-primary-soft text-primary border-primary/30",
  accent: "bg-accent-soft text-accent-strong border-accent/30",
  energy: "bg-energy-soft text-energy border-energy/30",
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  info: "bg-info-soft text-info border-info/30",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-text-muted",
  primary: "bg-primary",
  accent: "bg-accent",
  energy: "bg-energy",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/**
 * A compact status chip. Tones are always a `-soft` background with a
 * matching 30%-opacity border and full-strength text — never a bare
 * saturated fill, which would out-shout the card it sits in.
 */
export function Badge({
  children,
  tone = "neutral",
  className,
  dot = false,
  size = "sm",
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium whitespace-nowrap",
        size === "sm" ? "gap-1.5 px-2 py-0.5 text-[11px]" : "gap-2 px-2.5 py-1 text-xs",
        toneClasses[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone])}
        />
      )}
      {children}
    </span>
  );
}
