"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  User,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { clearTokens } from "@/lib/auth";
import type { UserProfile, UserRole } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

interface SidebarLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/**
 * Navigation is defined per role, not filtered from one shared list.
 *
 * A `roles: [...]` array on a single list has to be *additive* — every link
 * is visible to every role unless someone remembers to exclude it — and that
 * default is exactly how "My Bookings" ended up in the technician's sidebar
 * pointing at a page that is not theirs. Writing the three sets out whole
 * makes the absence deliberate: if a technician should not see something, it
 * is simply not in their array, and a reader can confirm that in one glance
 * instead of auditing a union of exclusions.
 *
 * It also means each role's dashboard is the first item under a name that
 * describes what it is, so the sidebar no longer needs the de-duplication
 * dance that three identically-labelled "Dashboard" links forced.
 */
const NAV_BY_ROLE: Record<UserRole, SidebarLink[]> = {
  customer: [
    { href: "/dashboard/customer", label: "Dashboard", icon: LayoutDashboard },
    { href: "/bookings", label: "My Bookings", icon: CalendarCheck },
    { href: "/ev", label: "EV Charging", icon: Zap },
    { href: "/services", label: "Services", icon: Wrench },
    { href: "/dashboard/profile", label: "Profile", icon: User },
  ],
  staff: [
    // The dispatch queue is the technician's home: unassigned jobs, their own
    // jobs, and completed history, all on one screen.
    { href: "/dashboard/staff", label: "Dispatch queue", icon: ClipboardList },
    { href: "/dashboard/profile", label: "Profile", icon: User },
  ],
  admin: [
    { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/dashboard/admin/staff", label: "Staff management", icon: Users },
    { href: "/dashboard/admin/bookings", label: "Bookings audit", icon: CalendarCheck },
    { href: "/dashboard/admin/metrics", label: "Platform metrics", icon: BarChart3 },
    { href: "/dashboard/profile", label: "Profile", icon: User },
  ],
};

/**
 * Links shown before the profile has resolved.
 *
 * Empty rather than a default set. Rendering the customer's menu for a
 * fraction of a second and then swapping it for the technician's is a
 * visible flash of the wrong navigation; rendering nothing until the role is
 * known is not.
 */
const NAV_PENDING: SidebarLink[] = [];

interface SidebarProps {
  user?: UserProfile;
}

/** Sidebar component for authenticated app layout. */
export function Sidebar({ user }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const role = user?.role;

  const links = role ? NAV_BY_ROLE[role] : NAV_PENDING;

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
        {links.map((l) => {
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

      {/*
        Dashboard routes sit behind the sidebar rather than the public
        navbar, so the toggle lives here too — otherwise the theme would be
        reachable everywhere except the half of the app where a user spends
        most of their time.
      */}
      <div className="border-t border-line px-3 pt-4">
        <div className="flex items-center justify-between gap-3 px-3 py-1">
          <span className="text-xs font-medium text-muted">Appearance</span>
          <ThemeToggle className="shrink-0" />
        </div>
      </div>
    </aside>
  );
}
