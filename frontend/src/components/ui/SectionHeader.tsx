"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeUp } from "@/components/motion";

interface SectionHeaderProps {
  /** Short mono eyebrow, e.g. "Categories". */
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  /** Optional right-hand slot — usually a "Browse all →" link. */
  action?: React.ReactNode;
}

/**
 * The editorial section header used by every band: a mono eyebrow with a
 * hairline rule, a display headline, and optional supporting copy. The
 * `mt-14` gap after this block is the layout's most-repeated number.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  action,
}: SectionHeaderProps) {
  const heading = (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}
    >
      <p
        className={cn(
          "flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary",
          align === "center" && "justify-center",
        )}
      >
        <span aria-hidden="true" className="h-px w-6 bg-primary" />
        {eyebrow}
      </p>
      <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-text-soft sm:text-lg">
          {description}
        </p>
      )}
    </motion.div>
  );

  if (!action) return heading;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      {heading}
      <div className="shrink-0">{action}</div>
    </div>
  );
}
