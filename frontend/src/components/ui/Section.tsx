import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container } from "./Container";

interface SectionProps {
  children: ReactNode;
  className?: string;
  /** `default` — page ground. `raised` — one step up the surface ladder. */
  tone?: "default" | "raised";
  /** Draw the `border-b` hairline that separates adjacent bands. */
  bordered?: boolean;
  /** Semantic id, so in-page anchors can target the section. */
  id?: string;
  /** Skip the `Container` wrapper when the section lays out its own grid. */
  bleed?: boolean;
  /** `lg` is the default; use `xl` for hero-scale bands. */
  size?: "lg" | "xl";
}

const SIZING = {
  lg: "py-16 sm:py-24 lg:py-28",
  xl: "py-16 sm:py-24 lg:py-32",
} as const;

/**
 * A vertical band with the shared section rhythm
 * (`py-16 sm:py-24 lg:py-28`) and an optional hairline separator. Alternating
 * the ground between `bg` and `surface-2` is what gives the page its
 * structure — it separates content without needing extra borders everywhere.
 */
export function Section({
  children,
  className,
  tone = "default",
  bordered = true,
  id,
  bleed = false,
  size = "lg",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        tone === "raised" ? "bg-surface-2" : "bg-bg",
        bordered && "border-b border-line",
        // Any section that is an anchor target gets a scroll offset, so a
        // hash jump clears the sticky navbar instead of tucking the heading
        // underneath it.
        id && "scroll-mt-16",
        SIZING[size],
        className,
      )}
    >
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}
