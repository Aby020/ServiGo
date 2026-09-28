"use client";

/**
 * The app's single source of truth for "who is signed in".
 *
 * Tokens live in localStorage, which the server cannot read. The Navbar is a
 * client component rendered by the root layout, so the naive fix — read
 * `localStorage` during render — makes the very first server HTML say
 * "Sign in" and the first client render say "Dashboard". React reports that as
 * a hydration mismatch.
 *
 * `useSession` fixes that with three states rather than two:
 *
 *   "guest"    — no tokens in storage. Settled, and therefore safe to render
 *                 on the server and on the first client paint alike.
 *   "loading"  — tokens exist, the `/auth/me/` round-trip is in flight.
 *   "authed"   — tokens exist and the user profile is resolved.
 *
 * Only "loading" is ambiguous, and only that one calls for a placeholder.
 * Pair it with `useSessionResolved()`, which is stable across the hydration
 * boundary, so there is no state in which the server and the client disagree
 * about what to paint.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

import {
  me as apiMe,
  type TokenPair,
  type UserProfile,
} from "@/lib/api";
import {
  AUTH_ME_KEY,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getValidAccessToken,
  setTokens,
} from "@/lib/auth";

export type SessionState =
  | { status: "loading"; user: null; hasTokens: false }
  | { status: "loading"; user: null; hasTokens: true }
  | { status: "guest"; user: null; hasTokens: false }
  | { status: "authed"; user: UserProfile; hasTokens: true };

const ROLE_HOME: Record<string, string> = {
  customer: "/dashboard/customer",
  staff: "/dashboard/staff",
  admin: "/dashboard/admin",
};

export function homeForRole(role: string): string {
  return ROLE_HOME[role] ?? "/dashboard/customer";
}

/**
 * Turns an in-app destination into a login URL that remembers it.
 *
 * Example: `loginHref("/book/service/12")` ->
 * `/login?redirect=%2Fbook%2Fservice%2F12`
 */
export function loginHref(target: string): string {
  return `/login?redirect=${encodeURIComponent(target)}`;
}

/**
 * Same, for the sign-up path — a visitor who hits a gated action without an
 * account should be able to create one and still arrive where they meant to.
 */
export function signupHref(target: string): string {
  return `/signup?redirect=${encodeURIComponent(target)}`;
}

/**
 * Resolves the `?redirect=` param that {@link loginHref} / {@link signupHref}
 * wrote, or null when it is absent or unusable.
 *
 * Two rules, both security-relevant, because this value ends up as a
 * navigation target:
 *
 *   1. Must be a single-slash-prefixed *path*. A protocol-relative
 *      `//evil.example` and an absolute `https://evil.example` both pass a
 *      naive "starts with /" test and would turn the login page into an open
 *      redirect.
 *   2. Decoded only after validation — validating first would let `%2f%2f`
 *      slip through as a harmless-looking path and then decode into a host.
 */
export function resolveRedirect(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let candidate = raw;
  try {
    candidate = decodeURIComponent(raw);
  } catch {
    return null; // malformed percent-encoding
  }

  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;
  return candidate;
}

/**
 * Presence of a persisted session, read as a *store subscription* rather
 * than as state seeded in an effect.
 *
 * `useSyncExternalStore` gives React exactly the guarantee we need and that a
 * `useState` + `useEffect` pair cannot: the server snapshot is `false` (no
 * storage there) and the client re-reads immediately after hydration, so the
 * two agree on the first render and diverge only afterwards. That is the
 * sanctioned way to read something the server cannot see, and it avoids the
 * extra render pass — plus the `set-state-in-effect` churn — of seeding state
 * in an effect.
 *
 * No `subscribe` is registered: tokens never change without a component
 * calling `setTokens`/`clearTokens`, and those callers already write the
 * query cache, so re-renders are driven from the cache rather than a store
 * event. The snapshot is a boolean, so the value is `Object.is`-stable and
 * will not loop.
 */
const subscribeToNothing = () => () => {};
const getNoTokensSnapshot = () => false;
const getTokenSnapshot = () => Boolean(getAccessToken() || getRefreshToken());

function useHasTokens(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    getTokenSnapshot,
    getNoTokensSnapshot,
  );
}

/**
 * Resolves the current user, caching under `["auth", "me"]`.
 *
 * `enabled` is derived from token presence, so a visitor who has never signed
 * in never issues a `/auth/me/` request at all — the network tab shows no
 * 401 for a guest, and no retry machinery is ever spun up for a session that
 * does not exist.
 */
export function useSession(): SessionState & {
  logout: () => void;
} {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasToken = useHasTokens();

  const { data, isPending, isError } = useQuery({
    queryKey: AUTH_ME_KEY,
    enabled: hasToken,
    // A 401 here means the stored pair is dead, and `getValidAccessToken`
    // has already tried to refresh it once by the time this rejects. Retrying
    // would just repeat a request that cannot succeed. The query's
    // `retry: false` below already covers the generic case.
    retry: false,
    queryFn: async (): Promise<UserProfile | null> => {
      // Both tokens gone between render and fetch (a logout in another tab,
      // or storage cleared): bail before any network call.
      if (!getAccessToken() && !getRefreshToken()) return null;
      const token = await getValidAccessToken();
      if (!token) return null;
      return apiMe(token);
    },
  });

  const logout = useCallback(() => {
    clearTokens();
    queryClient.setQueryData(AUTH_ME_KEY, null);
    queryClient.removeQueries({ queryKey: AUTH_ME_KEY });
    router.push("/");
  }, [queryClient, router]);

  if (!hasToken) {
    // "No tokens" is terminal, not pending: nothing is being resolved, so the
    // caller can render its guest state immediately. Deferring to a
    // placeholder until some query settles would put a permanent shimmer on
    // the navbar for every logged-out visitor.
    return { status: "guest", user: null, hasTokens: false, logout };
  }

  if (isPending) return { status: "loading", user: null, hasTokens: true, logout };
  if (isError || !data) {
    // Tokens present but unusable. The pair was cleared by the failed refresh
    // in `getValidAccessToken`, so this is a settled guest too.
    return { status: "guest", user: null, hasTokens: false, logout };
  }
  return { status: "authed", user: data, hasTokens: true, logout };
}

/**
 * True only once the session is known to be resolved.
 *
 * This is the flag a caller should gate auth-dependent UI on, and it is
 * identical on the server and on the first client render — so the caller can
 * render a real element (or a fixed-size placeholder) without risking a
 * hydration mismatch. Checking `status === "authed"` alone is not enough:
 * that is false on the server *and* false for a signed-in user on their first
 * paint, and rendering the guest UI in both cases is what produces the
 * "flashes Sign in, then swaps to Dashboard" flicker.
 */
export function useSessionResolved(): boolean {
  return useHasTokens();
}

/**
 * Wraps an auth mutation (login, register) with the session bookkeeping that
 * every successful auth call needs: persist the tokens, seed the user cache,
 * and route onward.
 *
 * The 201/200 payload already carries the user, so seeding the cache from it
 * skips the follow-up `/me/` round-trip and the destination renders on its
 * first paint.
 *
 * `redirect` is the validated `?redirect=` target. When present it wins over
 * the role-based default — a user who bounced off "Book this service" should
 * land on that booking form, not on their dashboard. Passing it unvalidated
 * from a caller would reintroduce the open-redirect risk, so it is run
 * through {@link resolveRedirect} again here rather than trusted.
 */
export function useAuthMutation<TPayload>(
  perform: (payload: TPayload) => Promise<{ user: UserProfile; tokens: TokenPair }>,
  redirect?: string | null,
) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: perform,
    onSuccess: ({ user, tokens }) => {
      setTokens(tokens);
      queryClient.setQueryData(AUTH_ME_KEY, user);
      router.push(resolveRedirect(redirect) ?? homeForRole(user.role));
    },
  });
}
