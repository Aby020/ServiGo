import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** `flat` — a plain surface. `raised` — adds the `shadow-sm` lift. */
  elevation?: "flat" | "raised" | "floating";
  /** Optional top bar, split from the body by its own `border-b`. */
  header?: ReactNode;
  as?: "div" | "article" | "section" | "li";
}

/**
 * The canonical bordered surface (`border-line · bg-surface`). Every card,
 * list and form block in the app uses it so they read as one system. Depth
 * comes from stepping the surface ladder (`surface-2` inside `surface`),
 * not from stacking shadows.
 */
export function Card({
  children,
  className,
  elevation = "flat",
  header,
  as: Tag = "div",
}: CardProps) {
  const elevationClass =
    elevation === "raised"
      ? "shadow-sm"
      : elevation === "floating"
        ? "shadow-lg"
        : "";

  return (
    <Tag
      className={cn(
        "rounded-lg border border-line bg-surface",
        elevationClass,
        className,
      )}
    >
      {header !== undefined && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {header}
        </div>
      )}
      {children}
    </Tag>
  );
}
