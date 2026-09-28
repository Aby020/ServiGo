"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  User,
  Wrench,
  Zap,
} from "lucide-react";
import { clearTokens } from "@/lib/auth";
import type { UserProfile } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { href: "/dashboard/customer", label: "Dashboard", icon: LayoutDashboard, roles: ["customer"] },
  { href: "/dashboard/staff", label: "Dashboard", icon: LayoutDashboard, roles: ["staff"] },
  { href: "/dashboard/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { href: "/bookings", label: "My Bookings", icon: CalendarCheck, roles: ["customer", "staff", "admin"] },
  { href: "/services", label: "Services", icon: Wrench, roles: ["customer", "staff", "admin"] },
  { href: "/ev", label: "EV Charging", icon: Zap, roles: ["customer", "staff", "admin"] },
  { href: "/profile", label: "Profile", icon: User, roles: ["customer", "staff", "admin"] },
];

interface SidebarProps {
  user?: UserProfile;
}

/** Sidebar component for authenticated app layout. */
export function Sidebar({ user }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const role = user?.role;

  const links = sidebarLinks.filter((l) => !role || l.roles.includes(role));
  // De-duplicate dashboard link (keep the one matching the role)
  const dashLinks = links.filter((l) => l.label === "Dashboard");
  const otherLinks = links.filter((l) => l.label !== "Dashboard");
  const dashLink = dashLinks.find((l) => role && l.roles.includes(role)) ?? dashLinks[0];
  const filteredLinks = dashLink ? [dashLink, ...otherLinks] : otherLinks;

  function handleLogout() {
    clearTokens();
    router.push("/login");
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface py-6">
      {/* Logo */}
      <Link
        href="/"
        className="mb-6 flex items-center gap-2 px-5 font-display text-lg font-bold text-primary"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-on-primary"
          aria-hidden="true"
        >
          <Wrench size={15} />
        </span>
        ServiGo
      </Link>

      {/* User info */}
      {user && (
        <div className="mx-3 mb-4 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-sm">
          <div className="font-semibold leading-tight text-ink">
            {user.first_name || user.username}
          </div>
          <Badge tone="primary" size="sm" className="mt-1.5 capitalize">
            {user.role}
          </Badge>
        </div>
      )}

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Dashboard">
        {filteredLinks.map((l) => {
          const Icon = l.icon;
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href + l.label}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                "transition-colors duration-base ease-out",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-text hover:bg-surface-3 hover:text-ink",
              )}
            >
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              {l.label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-line px-3 pt-4">
        <button
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-danger transition-colors duration-base ease-out hover:bg-danger-soft"
        >
          <LogOut size={16} className="shrink-0" aria-hidden="true" />
          Logout
        </button>
      </div>
    </aside>
  );
}
