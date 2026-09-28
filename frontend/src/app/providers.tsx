"use client";

import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

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
        Global reduced-motion kill switch. `reducedMotion="user"` makes
        Framer Motion short-circuit every animation to a plain fade for
        anyone who has asked their OS for less motion — no component needs
        to check the preference itself. The CSS half of the switch (which
        also catches CSS-driven transitions) lives in globals.css.
      */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  );
}
