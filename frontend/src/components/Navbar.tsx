"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, LogOut, Menu, X, Wrench } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { buttonClasses } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSession, homeForRole } from "@/lib/session";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/services", label: "Services" },
  { href: "/ev", label: "EV Charging" },
  { href: "/about", label: "About" },
];

/**
 * Placeholder shown while the session is still resolving.
 *
 * The real action group is `md:flex`; this reserves a same-height box so the
 * bar never reflows when the real links swap in. It is `aria-hidden`, and it
 * is a plain `<div>` rather than a link or button, so there is nothing
 * focusable or clickable in the brief window where it is on screen.
 */
function AuthActionsPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-8 w-[8.75rem] shrink-0 animate-pulse rounded-md bg-surface-3", className)}
    />
  );
}

/** Guest state — offer both the low-key and the high-emphasis entry point. */
function GuestActions() {
  return (
    <>
      <Link
        href="/login"
        className="inline-flex h-8 items-center rounded-md px-3.5 text-sm font-medium text-text transition-colors duration-base ease-out hover:bg-surface-3"
      >
        Sign in
      </Link>
      <Link href="/signup" className={buttonClasses("primary", "sm")}>
        Sign up
      </Link>
    </>
  );
}

/** Authenticated state — where this user actually belongs, plus an escape hatch. */
function AuthedActions({
  userName,
  dashboardHref,
  onLogout,
}: {
  userName: string;
  dashboardHref: string;
  onLogout: () => void;
}) {
  return (
    <>
      <span
        className="max-w-[9rem] truncate text-sm font-medium text-text-soft"
        title={userName}
      >
        {userName}
      </span>
      <Link href={dashboardHref} className={buttonClasses("secondary", "sm")}>
        <LayoutDashboard size={15} aria-hidden="true" />
        Dashboard
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-text transition-colors duration-base ease-out hover:bg-surface-3"
      >
        <LogOut size={15} aria-hidden="true" />
        Log out
      </button>
    </>
  );
}

/**
 * The one and only public navbar.
 *
 * It is rendered once by the app shell (`app/layout.tsx`) and is never
 * duplicated inside a page — that duplication is what produced the previous
 * "two navs" problem, where a light shell bar sat directly above a dark
 * page-local bar with a different height, border and palette.
 *
 * Because every token here is a role (`bg-bg/85`, `border-line`,
 * `text-ink`), the bar reads identically over the hero, over the raised
 * category band, and over the deeper service sections.
 */
export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFor, setOpenFor] = useState(pathname);
  const { status, user, logout } = useSession();
  // A guest is only "loading" while their own /me/ request is in flight. A
  // visitor with no tokens is a settled guest, so the landing page renders
  // "Sign in / Sign up" in the server HTML and never flashes a skeleton.
  const showAuthActions = status !== "loading";

  // Route changes dismiss the mobile panel. This is derived state, so it is
  // reconciled during render rather than in an effect — that way the panel
  // never paints for a frame on the new route. (React's documented
  // "adjusting state when props change" pattern.)
  if (openFor !== pathname) {
    setOpenFor(pathname);
    if (mobileOpen) setMobileOpen(false);
  }

  const close = useCallback(() => setMobileOpen(false), []);

  // Close on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, close]);

  const isActive = (href: string) => {
    // A hash link is a scroll target on the home page, not a route of its
    // own — it should never claim `aria-current`, which would otherwise fight
    // the Home link that owns "/" and make two items look selected at once.
    if (href.includes("#")) return false;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  /**
   * Hash navigation needs a hand when the user is *already* on the target
   * page: Next's router treats "/#how-it-works" from "/" as a no-op, so the
   * browser never scrolls and the click looks broken. We handle same-page
   * hash links manually, and let Next.js handle cross-page navigation
   * (it will scroll to the hash after navigation completes).
   */
  const goTo = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      // Always dismiss the mobile panel first
      close();

      // Special case: Home link when already on home should scroll to top
      if (href === "/" && pathname === "/") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // Handle hash links (e.g., /#how-it-works)
      const [path, hash] = href.split("#");
      if (hash) {
        // If we're already on the target page, scroll manually
        if (path === pathname) {
          e.preventDefault();
          const target = document.getElementById(hash);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            window.history.replaceState(null, "", `#${hash}`);
          }
          return;
        }
        // Otherwise, let Next.js navigate and scroll after route change
      }

      // For all other links (including /about), just close the menu
      // and let Next.js handle navigation normally
    },
    [pathname, close],
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-bg/85 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-4">
        {/* Brand */}
        <Link
          href="/"
          aria-label="ServiGo home"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-on-primary">
            <Wrench size={16} strokeWidth={2.5} aria-hidden="true" />
          </span>
          ServiGo
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={(e) => goTo(e, l.href)}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={cn(
                "text-sm font-medium transition-colors duration-base ease-out",
                isActive(l.href) ? "text-primary" : "text-text-soft hover:text-ink",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          {/* Theme toggle leads the action group, matching ResumeAI's nav. */}
          <ThemeToggle />
          {!showAuthActions ? (
            <AuthActionsPlaceholder />
          ) : status === "authed" && user ? (
            <AuthedActions
              userName={user.first_name || user.username}
              dashboardHref={homeForRole(user.role)}
              onLogout={logout}
            />
          ) : (
            <GuestActions />
          )}
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-text-soft transition-colors duration-base ease-out hover:bg-surface-3 hover:text-ink md:hidden"
          >
            {mobileOpen ? (
              <X size={20} strokeWidth={2} />
            ) : (
              <Menu size={20} strokeWidth={2} />
            )}
          </button>
        </div>
      </Container>

      {/* Mobile panel */}
      {mobileOpen && (
        <div id="mobile-nav" className="border-t border-line bg-bg md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={(e) => goTo(e, l.href)}
                className={cn(
                  "rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-base ease-out hover:bg-surface-3",
                  isActive(l.href) ? "text-primary" : "text-text",
                )}
              >
                {l.label}
              </Link>
            ))}
            <div className="my-2 border-t border-line" />
            {!showAuthActions ? (
              <div aria-hidden="true" className="flex flex-col gap-2 px-3 py-1">
                <div className="h-9 w-full animate-pulse rounded-md bg-surface-3" />
                <div className="h-9 w-full animate-pulse rounded-md bg-surface-3" />
              </div>
            ) : status === "authed" && user ? (
              <div className="flex flex-col gap-2">
                <Link
                  href={homeForRole(user.role)}
                  onClick={close}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-text transition-colors duration-base ease-out hover:bg-surface-3"
                >
                  <LayoutDashboard size={16} className="text-muted" aria-hidden="true" />
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    logout();
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-medium text-text transition-colors duration-base ease-out hover:bg-surface-3"
                >
                  <LogOut size={16} className="text-muted" aria-hidden="true" />
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  onClick={close}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-text transition-colors duration-base ease-out hover:bg-surface-3"
                >
                  Sign in
                </Link>
                <Link href="/signup" onClick={close} className={buttonClasses("primary", "sm")}>
                  Sign up
                </Link>
              </div>
            )}
          </Container>
        </div>
      )}
    </header>
  );
}
