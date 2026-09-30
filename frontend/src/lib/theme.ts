/**
 * Theme persistence — mirrors the ResumeAI "Career Signal" model.
 *
 * The stored value is the user's *preference* (`light` | `dark` | `system`),
 * never the resolved OS value. Keeping the preference rather than the
 * resolution is what lets the page start honouring the OS setting and still
 * take an explicit override the moment the user makes one.
 *
 * `next-themes` owns the actual write to `<html>` and the pre-paint bootstrap
 * script it injects; this module only names the storage key and the
 * attribute shape, so the two never drift.
 *
 * next-themes applies the `class` (and optionally `data-theme`) strategy by
 * toggling the class on the document element. globals.css keys its dark
 * block off both `.dark` and `[data-theme='dark']`, so either strategy
 * resolves the same tokens.
 */

import type { ThemeProviderProps } from "next-themes";

export const THEME_STORAGE_KEY = "servigo.theme";

/** Light / dark / system — the cycle order the toggle steps through. */
export type ThemePreference = "light" | "dark" | "system";

const PREFERENCE_ORDER: ThemePreference[] = ["light", "dark", "system"];

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/** The preference after the current one (light → dark → system → light). */
export function nextPreference(current: ThemePreference): ThemePreference {
  const index = PREFERENCE_ORDER.indexOf(current);
  return PREFERENCE_ORDER[(index + 1) % PREFERENCE_ORDER.length];
}

/**
 * Shared provider props. `attribute="class"` matches the `.dark` selector
 * globals.css keys off; `enableSystem` is what backs the "system" state.
 * `disableTransitionOnChange` is deliberately omitted — it would kill the
 * 180ms token transition the design system's `duration-base` relies on.
 */
export const themeProviderProps: Pick<
  ThemeProviderProps,
  "attribute" | "defaultTheme" | "enableSystem" | "storageKey" | "themes"
> = {
  attribute: "class",
  defaultTheme: "system",
  enableSystem: true,
  storageKey: THEME_STORAGE_KEY,
  themes: ["light", "dark", "system"],
};
