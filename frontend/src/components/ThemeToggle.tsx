"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  nextPreference,
  THEME_LABELS,
  type ThemePreference,
} from "@/lib/theme";

/** One icon per preference state — the icon always shows the *active* state. */
const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Light / dark / system toggle.
 *
 * Hydration safety is the whole subtlety here. The server has no way to know
 * which theme is stored, so it always renders the `system` placeholder. If we
 * read the real preference during the first render, the server HTML and the
 * first client render would disagree and React would report a mismatch. So
 * the component mounts showing `system` and swaps to the true preference in
 * an effect — one extra frame, no mismatch, and no flash of the wrong icon.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Before mount, report `system`: it is the one value the server can render
  // without knowing anything about localStorage or the OS.
  const active: ThemePreference = mounted
    ? ((theme as ThemePreference) || "system")
    : "system";
  const next = nextPreference(active);
  const Icon = ICONS[active];
  const label = `Theme: ${THEME_LABELS[active]}. Click to switch to ${THEME_LABELS[next]}.`;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-text-soft transition-colors duration-base ease-out hover:bg-surface-3 hover:text-ink ${className}`}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
