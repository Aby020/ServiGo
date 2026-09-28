"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import type { UserProfile } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { MotionPage } from "@/components/motion";
import { Container } from "@/components/ui/Container";

interface DashboardShellProps {
  expectedRole: "customer" | "staff" | "admin";
  title: string;
  children: (user: UserProfile) => React.ReactNode;
}

const ROLE_REDIRECT: Record<string, string> = {
  customer: "/dashboard/customer",
  staff: "/dashboard/staff",
  admin: "/dashboard/admin",
};

/**
 * Reusable protected dashboard shell.
 * - Fetches user via getValidAccessToken (handles refresh automatically).
 * - Redirects to /login if unauthenticated.
 * - Redirects to the correct dashboard if the user's role doesn't match.
 */
export function DashboardShell({ expectedRole, title, children }: DashboardShellProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthenticatedUser().then((u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      if (u.role !== expectedRole) {
        router.replace(ROLE_REDIRECT[u.role] ?? "/login");
        return;
      }
      setUser(u);
      setLoading(false);
    });
  }, [expectedRole, router]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--header-h))] items-center justify-center bg-bg">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  }

  if (!user) return null;

  return (
    <MotionPage>
      <div className="flex min-h-[calc(100dvh-var(--header-h))] bg-bg">
        <Sidebar user={user} />
        <div className="flex-1 overflow-auto">
          <Container className="py-10">
            <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            {children(user)}
          </Container>
        </div>
      </div>
    </MotionPage>
  );
}
