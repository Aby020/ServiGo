"use client";

import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { themeProviderProps } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per app mount, not recreated on every render
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000, // 1 min
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        Theme. Sits above everything so the class it writes to <html> is in
        place before any themed markup paints. next-themes injects a blocking
        inline script into <head> that applies the stored preference before
        first paint — that is what prevents a flash of the light theme on a
        dark-mode reload, and it is why the provider is not a replacement for
        but a complement to the inline bootstrap.
      */}
      <ThemeProvider {...themeProviderProps}>
        {/*
          Global reduced-motion kill switch. `reducedMotion="user"` makes
          Framer Motion short-circuit every animation to a plain fade for
          anyone who has asked their OS for less motion — no component needs
          to check the preference itself. The CSS half of the switch (which
          also catches CSS-driven transitions) lives in globals.css.
        */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
