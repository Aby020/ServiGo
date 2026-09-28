"use client";

import {
  motion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

/**
 * Element props for the wrappers below. `HTMLMotionProps<"div">` is the
 * library's own element-prop type; it is used instead of
 * `ComponentProps<typeof motion.div>` because the latter resolves poorly
 * under React 19 and drops `className` from the accepted props.
 */
type MotionDivProps = HTMLMotionProps<"div">;

/* ════════════════════════════════════════════════════════════════════════
   Reusable motion variants.
   ------------------------------------------------------------------------
   Every animation in ServiGo comes from this file. Nothing is animated ad
   hoc, so the whole product shares one vocabulary: subtle distances (8–24px),
   short durations, and a single ease-out curve.

   Reduced motion is NOT handled per-variant — see <MotionProvider> in
   providers.tsx, which sets `reducedMotion="user"` app-wide. Every variant
   below then collapses to a single dissolve without any component knowing.
   ════════════════════════════════════════════════════════════════════════ */

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Fade + rise. For blocks (cards, headings) entering a viewport. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};

/** Fade only. For elements already in layout that simply need to appear. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35, ease: EASE_OUT } },
};

/**
 * Container that staggers its children. Pair children with `staggerChild`
 * (or `fadeUp`) and give each child `initial="hidden" whileInView="visible"`.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

/** Child of `staggerContainer` — same curve as fadeUp, no own delay. */
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASE_OUT },
  },
};

/**
 * Route-level enter for the page wrapper. Kept short so navigation feels
 * crisp rather than slow-motion.
 */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_OUT },
  },
};

/**
 * Subtle lift on hover — reserved for interactive cards, never for buttons.
 * 2px is the ceiling; anything larger reads as a toy bounce.
 */
export const hoverLift: Variants = {
  rest: { y: 0 },
  hover: { y: -2, transition: { duration: 0.18, ease: EASE_OUT } },
};

/* ════════════════════════════════════════════════════════════════════════
   Components
   ════════════════════════════════════════════════════════════════════════ */

/**
 * The single page-transition wrapper. Exactly one per page — a second nested
 * MotionPage would double the entrance delay and break the stagger timing.
 */
export function MotionPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A `staggerContainer` that fires on mount — for above-the-fold heroes. */
export function StaggerGroup({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & MotionDivProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * A `staggerContainer` that fires when scrolled into view, once.
 * This is what every below-the-fold grid should use.
 */
export function StaggerOnView({
  children,
  className,
  amount = 0.15,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Fraction of the element that must be visible to trigger. */
  amount?: number;
} & MotionDivProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** A single staggered child of StaggerGroup / StaggerOnView. */
export function StaggerItem({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & MotionDivProps) {
  return (
    <motion.div variants={staggerChild} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

/** Lightweight fade-in for individual elements with an explicit delay. */
export function MotionFadeIn({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay, ease: EASE_OUT }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * The interactive-card hover recipe: a -2px lift, a border that warms toward
 * the accent, and a shadow that deepens by exactly one step. Centralized so
 * every card in the product hovers identically.
 */
export function HoverCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={hoverLift}
      initial="rest"
      whileHover="hover"
      animate="rest"
      whileTap={{ y: 0 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
