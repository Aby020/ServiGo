import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  /**
   * Semantic element. Defaults to `div`; pass `section`, `header`, `footer`
   * when the container carries meaning.
   */
  as?: ElementType;
}

/**
 * The single width authority for every public page: `max-w-7xl` plus the
 * responsive gutter ladder. Every section uses this so the left and right
 * edges never jump between the hero and the sections below it.
 */
export function Container({ children, className, as: Tag = "div" }: ContainerProps) {
  return (
    <Tag className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </Tag>
  );
}
