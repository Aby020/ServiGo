/**
 * Token storage helpers.
 *
 * Tokens are kept in localStorage for this portfolio build.
 * This keeps the implementation simple and client-only, avoiding the
 * complexity of HTTP-only cookie / SSR token refresh flows.
 * Production deployments should migrate to secure HttpOnly cookies.
 */

import { refresh as apiRefresh, me as apiMe, type UserProfile } from "./api";

const KEY_ACCESS  = "sg_access";
const KEY_REFRESH = "sg_refresh";

function isClient() {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  return isClient() ? localStorage.getItem(KEY_ACCESS) : null;
}

export function getRefreshToken(): string | null {
  return isClient() ? localStorage.getItem(KEY_REFRESH) : null;
}

export function setTokens({ access, refresh }: { access: string; refresh: string }) {
  if (!isClient()) return;
  localStorage.setItem(KEY_ACCESS, access);
  localStorage.setItem(KEY_REFRESH, refresh);
}

export function clearTokens() {
  if (!isClient()) return;
  localStorage.removeItem(KEY_ACCESS);
  localStorage.removeItem(KEY_REFRESH);
}

/**
 * Stable TanStack Query key for "the signed-in user".
 *
 * Centralised here rather than spelled out at each call site so the
 * registration, login and navbar paths all read and write the same cache
 * entry — a divergent key literal is the classic way a navbar ends up showing
 * "Sign in" next to a signed-in user.
 */
export const AUTH_ME_KEY = ["auth", "me"] as const;

/**
 * Returns a valid access token, attempting a refresh if the access token is
 * absent or a /me/ call returns 401. Clears tokens and returns null if both
 * tokens are missing or the refresh fails.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const access = getAccessToken();

  // Fast-path: try the existing access token against /me/
  if (access) {
    try {
      await apiMe(access);
      return access;
    } catch {
      // Likely 401 — fall through to refresh
    }
  }

  // Try refresh
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return null;
  }

  try {
    const { access: newAccess } = await apiRefresh(refreshToken);
    setTokens({ access: newAccess, refresh: refreshToken });
    return newAccess;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * Convenience: get a valid token then fetch the user profile.
 * Returns null if unauthenticated.
 */
export async function getAuthenticatedUser(): Promise<UserProfile | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    return await apiMe(token);
  } catch {
    clearTokens();
    return null;
  }
}
