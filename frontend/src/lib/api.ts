/**
 * ServiGo API client.
 * All calls go to NEXT_PUBLIC_API_URL (http://127.0.0.1:8004/api).
 */

export const API_URL =
  (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8004") + "/api";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TokenPair {
  access: string;
  refresh: string;
}

export type UserRole = "customer" | "staff" | "admin";

export interface UserProfile {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  first_name: string;
  last_name: string;
}

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  image_url: string | null;
  display_order: number;
}

export interface Service {
  id: number;
  name: string;
  slug: string;
  category: { id: number; name: string; slug: string };
  short_description: string;
  price: string;           // Decimal comes as string from DRF
  estimated_duration: number;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  display_order: number;
}

export interface ServiceDetail extends Service {
  description: string;
  what_included: string[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ServicesParams {
  q?: string;
  category?: string;
  featured?: boolean;
  available_only?: boolean;
  order?: "price_asc" | "price_desc" | "newest";
  page?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: globalThis.Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message =
        body?.detail ??
        body?.non_field_errors?.[0] ??
        Object.values(body ?? {})[0] ??
        message;
    } catch {
      /* ignore parse error */
    }
    throw new Error(String(message));
  }
  return res.json() as Promise<T>;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

export async function login(identifier: string, password: string): Promise<TokenPair> {
  const res = await fetch(`${API_URL}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  return handleResponse<TokenPair>(res);
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface AuthSuccessResponse {
  user: UserProfile;
  tokens: TokenPair;
}

/**
 * POST /api/auth/register/ — public customer signup.
 *
 * The backend hardcodes `role="customer"` and issues a token pair in the same
 * response, so a successful call means the user is already logged in; the
 * caller only has to persist `tokens` and seed its user cache.
 *
 * Deliberately sends only the whitelisted fields below. The role/permission
 * guard is the server's to enforce, but the client is not obliged to offer a
 * way to send a `role` in the first place.
 */
export async function registerCustomer(
  payload: RegisterPayload,
): Promise<AuthSuccessResponse> {
  const body: RegisterPayload = {
    username: payload.username,
    email: payload.email,
    password: payload.password,
  };
  if (payload.first_name) body.first_name = payload.first_name;
  if (payload.last_name) body.last_name = payload.last_name;
  if (payload.phone) body.phone = payload.phone;

  const res = await fetch(`${API_URL}/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<AuthSuccessResponse>(res);
}

export async function me(accessToken: string): Promise<UserProfile> {
  const res = await fetch(`${API_URL}/auth/me/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return handleResponse<UserProfile>(res);
}

export async function refresh(refreshToken: string): Promise<{ access: string }> {
  const res = await fetch(`${API_URL}/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  return handleResponse<{ access: string }>(res);
}

// ── Services endpoints ────────────────────────────────────────────────────────

export async function fetchCategories(): Promise<ServiceCategory[]> {
  const res = await fetch(`${API_URL}/service-categories/`);
  return handleResponse<ServiceCategory[]>(res);
}

export async function fetchServices(
  params: ServicesParams = {}
): Promise<PaginatedResponse<Service>> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.featured !== undefined) qs.set("featured", String(params.featured));
  if (params.available_only !== undefined) qs.set("available_only", String(params.available_only));
  if (params.order) qs.set("order", params.order);
  if (params.page) qs.set("page", String(params.page));
  const res = await fetch(`${API_URL}/services/?${qs.toString()}`);
  return handleResponse<PaginatedResponse<Service>>(res);
}

export async function fetchServiceDetail(id: number): Promise<ServiceDetail> {
  const res = await fetch(`${API_URL}/services/${id}/`);
  return handleResponse<ServiceDetail>(res);
}

// ── Booking types ─────────────────────────────────────────────────────────────

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface BookingStatusHistory {
  id: number;
  previous_status: string;
  new_status: string;
  changed_by_name: string | null;
  notes: string;
  created_at: string;
}

export interface Booking {
  id: number;
  service_name: string;
  service_price: string;
  preferred_date: string;
  preferred_time: string;
  location: string;
  address: string;
  notes: string;
  status: BookingStatus;
  status_display: string;
  created_at: string;
  updated_at: string;
}

export interface BookingDetail extends Booking {
  status_history: BookingStatusHistory[];
}

export interface CreateBookingPayload {
  service_id: number;
  preferred_date: string;   // YYYY-MM-DD
  preferred_time: string;   // HH:MM
  location: string;
  address: string;
  notes?: string;
}

// ── Booking endpoints ─────────────────────────────────────────────────────────

async function authedFetch(
  url: string,
  options: RequestInit,
  accessToken: string,
): Promise<globalThis.Response> {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {}),
    },
  });
}

export async function createBooking(
  payload: CreateBookingPayload,
  accessToken: string,
): Promise<BookingDetail> {
  const res = await authedFetch(
    `${API_URL}/bookings/`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  return handleResponse<BookingDetail>(res);
}

export async function listBookings(
  accessToken: string,
  page = 1,
): Promise<PaginatedResponse<Booking>> {
  const res = await authedFetch(
    `${API_URL}/bookings/?page=${page}`,
    { method: "GET" },
    accessToken,
  );
  return handleResponse<PaginatedResponse<Booking>>(res);
}

export async function getBooking(
  id: number,
  accessToken: string,
): Promise<BookingDetail> {
  const res = await authedFetch(
    `${API_URL}/bookings/${id}/`,
    { method: "GET" },
    accessToken,
  );
  return handleResponse<BookingDetail>(res);
}

export async function cancelBooking(
  id: number,
  accessToken: string,
): Promise<BookingDetail> {
  const res = await authedFetch(
    `${API_URL}/bookings/${id}/cancel/`,
    { method: "POST", body: JSON.stringify({}) },
    accessToken,
  );
  return handleResponse<BookingDetail>(res);
}
