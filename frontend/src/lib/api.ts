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
  /** Free-form on the way in, normalised to digits by the server on the way out. */
  phone: string;
}

/** The only fields `PATCH /auth/profile/` will accept. Identity is not editable. */
export interface ProfileUpdatePayload {
  first_name: string;
  last_name: string;
  phone: string;
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

/**
 * An error carrying the server's structured validation body.
 *
 * `handleResponse` already reduced the body to a single string for the
 * `Error.message` every existing caller reads. This subclass keeps the whole
 * thing on `detail` as well, so a *form* can put each message under the
 * input it belongs to instead of showing the first field's complaint in a
 * banner and leaving the user to work out which field that was.
 *
 * A 4xx from a form endpoint sets `fieldErrors`; a 500, a 4xx with an
 * unstructured body, or a network drop leaves it empty and the caller falls
 * back to the message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  /** `{email: "...", password: "..."}` from a DRF serializer error. */
  get fieldErrors(): Record<string, string> {
    if (!this.detail || typeof this.detail !== "object" || Array.isArray(this.detail)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.detail as Record<string, unknown>)) {
      if (key === "detail" || key === "non_field_errors") continue;
      out[key] = Array.isArray(value) ? value.map(String).join(" ") : String(value);
    }
    return out;
  }
}

async function handleResponse<T>(res: globalThis.Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let detail: unknown = null;
    try {
      const body = await res.json();
      detail = body;
      message =
        body?.detail ??
        body?.non_field_errors?.[0] ??
        Object.values(body ?? {})[0] ??
        message;
    } catch {
      /* ignore parse error */
    }
    throw new ApiError(String(message), res.status, detail);
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

/**
 * Edit the signed-in user's own profile.
 *
 * Sends all three editable fields every time rather than diffing against the
 * current values. The endpoint is a PATCH, so a subset would be honoured —
 * but the profile form is a whole record, and a field the user deliberately
 * blanked must be sent as `""` to be cleared. Diffing would silently drop
 * that, and "I cleared my phone number and it came back" is a worse bug than
 * a slightly larger request body.
 *
 * There is no user id in the path: the endpoint always edits the token's
 * own account, so there is nothing for a client to get wrong.
 */
export async function updateProfile(
  payload: ProfileUpdatePayload,
  accessToken: string,
): Promise<UserProfile> {
  const res = await authedFetch(
    `${API_URL}/auth/profile/`,
    { method: "PATCH", body: JSON.stringify(payload) },
    accessToken,
  );
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
  | "on_site"
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
  /**
   * The caller's own review of this booking, or null if they have not written
   * one. On the list, not just the detail: the customer's dashboard needs it
   * in order to show the saved stars on a rated row and to hide the Rate
   * button — otherwise it offers a second review the server rejects as a
   * duplicate.
   */
  feedback: BookingFeedback | null;
}

export interface BookingDetail extends Booking {
  status_history: BookingStatusHistory[];
}

/** A customer's rating and comment on a completed booking. */
export interface BookingFeedback {
  rating: number;
  comment: string;
  created_at: string;
}

export interface CreateBookingPayload {
  service_id: number;
  preferred_date: string;   // YYYY-MM-DD
  preferred_time: string;   // HH:MM
  location: string;
  address: string;
  notes?: string;
}

/**
 * A booking as the dispatch desk sees it.
 *
 * Extends the customer-facing `Booking` with the contact snapshot and the
 * current assignee. The server only emits these on the staff-gated routes —
 * `Booking` itself deliberately does not carry them.
 */
export interface StaffBooking extends Booking {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  assigned_staff_id: number | null;
  assigned_staff_name: string | null;
}

export interface StaffBookingDetail extends StaffBooking {
  status_history: BookingStatusHistory[];
}

export type StaffQueueFilter = "unassigned" | "mine" | "all";

export interface StaffBookingsParams {
  /** One or more statuses; the server accepts a comma-separated list. */
  status?: BookingStatus[];
  assigned?: StaffQueueFilter;
  page?: number;
  page_size?: number;
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

// ── Staff dispatch endpoints ──────────────────────────────────────────────────

/**
 * Fetch the dispatch queue.
 *
 * Query parameters are built explicitly and the empty ones are dropped rather
 * than sent as `status=&assigned=`: the server treats a present-but-blank
 * `assigned` as an unknown value and answers 400, so serialising undefined
 * straight into the URL would turn a missing filter into a failed request.
 */
export async function getStaffBookings(
  accessToken: string,
  params: StaffBookingsParams = {},
): Promise<PaginatedResponse<StaffBooking>> {
  const query = new URLSearchParams();
  if (params.status?.length) query.set("status", params.status.join(","));
  if (params.assigned) query.set("assigned", params.assigned);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));

  const qs = query.toString();
  const res = await authedFetch(
    `${API_URL}/staff/bookings/${qs ? `?${qs}` : ""}`,
    { method: "GET" },
    accessToken,
  );
  return handleResponse<PaginatedResponse<StaffBooking>>(res);
}

/**
 * Claim a job for the signed-in technician.
 *
 * The endpoint takes no body — the server always assigns to the caller — so
 * the empty object here is a formality, not a payload.
 */
export async function assignStaffBooking(
  id: number,
  accessToken: string,
): Promise<StaffBookingDetail> {
  const res = await authedFetch(
    `${API_URL}/staff/bookings/${id}/assign/`,
    { method: "POST", body: JSON.stringify({}) },
    accessToken,
  );
  return handleResponse<StaffBookingDetail>(res);
}

export interface UpdateStaffBookingStatusPayload {
  status: BookingStatus;
  /** Shown verbatim on the customer's booking timeline. */
  notes?: string;
}

export async function updateStaffBookingStatus(
  id: number,
  payload: UpdateStaffBookingStatusPayload,
  accessToken: string,
): Promise<StaffBookingDetail> {
  const res = await authedFetch(
    `${API_URL}/staff/bookings/${id}/status/`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  return handleResponse<StaffBookingDetail>(res);
}

/**
 * The four dispatch milestones, in the order they must be recorded.
 *
 * Naming them rather than posting a status is the whole point: the server can
 * reject `start_work` on a job nobody has arrived at, which is exactly the
 * mistake a free-form status POST cannot catch.
 */
export type StaffBookingAction =
  | "claim"
  | "reached_location"
  | "start_work"
  | "complete_work";

export interface StaffBookingActionPayload {
  action: StaffBookingAction;
  /** Optional note appended to the audit entry the server writes. */
  notes?: string;
}

export async function postStaffBookingAction(
  id: number,
  payload: StaffBookingActionPayload,
  accessToken: string,
): Promise<StaffBookingDetail> {
  const res = await authedFetch(
    `${API_URL}/staff/bookings/${id}/actions/`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  return handleResponse<StaffBookingDetail>(res);
}

// ── Customer feedback ─────────────────────────────────────────────────────────

export interface Feedback {
  id: number;
  booking_id: number;
  customer_name: string;
  customer_email: string;
  service_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface CreateFeedbackPayload {
  rating: number;
  comment?: string;
}

export async function submitFeedback(
  bookingId: number,
  payload: CreateFeedbackPayload,
  accessToken: string,
): Promise<Feedback> {
  const res = await authedFetch(
    `${API_URL}/feedback/`,
    {
      method: "POST",
      body: JSON.stringify({ booking_id: bookingId, ...payload }),
    },
    accessToken,
  );
  return handleResponse<Feedback>(res);
}

export async function fetchAdminFeedback(
  accessToken: string,
): Promise<Feedback[]> {
  const res = await authedFetch(
    `${API_URL}/admin/feedback/`,
    { method: "GET" },
    accessToken,
  );
  return handleResponse<Feedback[]>(res);
}

// ── EV charging ───────────────────────────────────────────────────────────────

/**
 * The three buckets a pin is painted by, mirroring
 * `EVChargingStation.get_availability_tone()` on the server. The map derives its
 * marker colour from this rather than from `status` directly, so "limited"
 * (a station down to its last third of bays) is visually distinct from
 * "unavailable" (closed, or no bays at all).
 */
export type EvAvailabilityTone = "available" | "limited" | "unavailable";

export type EvBookingStatus =
  | "pending"
  | "confirmed"
  | "active"
  | "completed"
  | "cancelled";

export interface EvStation {
  id: number;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  /** Null until the station has been geocoded; the map skips those. */
  latitude: number | null;
  longitude: number | null;
  charger_type: string;
  charger_type_display: string;
  charging_speed_kw: number;
  is_fast_charging: boolean;
  /** JSON number, not a string — the EV serializers disable DRF's string coercion. */
  price_per_kwh: number;
  price_display: string;
  status: string;
  status_display: string;
  availability_tone: EvAvailabilityTone;
  total_ports: number;
  available_ports: number;
  is_24_hours: boolean;
  is_open_now: boolean;
  image_url: string | null;
  /** Pre-formatted for the card, e.g. "Open 24×7" or "08:00 – 22:00". */
  hours_display: string;
}

export interface EvSlot {
  /** `"HH:MM:SS"` station-local wall clock. Send back verbatim as `slot_time`. */
  start: string;
  end: string;
  is_available: boolean;
  available_ports: number;
}

export interface EvSlotGrid {
  duration_minutes: number;
  horizon_hours: number;
  timezone: string;
  slots: EvSlot[];
}

export interface EvStationDetail extends EvStation {
  description: string;
  opens_at: string;
  closes_at: string;
  slot_grid: EvSlotGrid;
}

export interface EvBooking {
  id: number;
  station: EvStation;
  station_id: number;
  vehicle_number: string;
  start_at: string;
  end_at: string;
  estimated_kwh: number;
  estimated_cost: number;
  price_per_kwh: number;
  status: EvBookingStatus;
  status_display: string;
  notes: string;
  created_at: string;
}

export interface EvStationsParams {
  search?: string;
  /** Comma-separated charger types, e.g. `"ccs2,chademo"`. */
  connector_type?: string;
  is_fast_charging?: boolean;
  available_only?: boolean;
  city?: string;
  max_price?: number;
}

/** Public — no token required, so the discovery map renders before login. */
export async function fetchEvStations(
  params: EvStationsParams = {},
): Promise<EvStation[]> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.connector_type) qs.set("connector_type", params.connector_type);
  if (params.is_fast_charging !== undefined) {
    qs.set("is_fast_charging", String(params.is_fast_charging));
  }
  if (params.available_only !== undefined) {
    qs.set("available_only", String(params.available_only));
  }
  if (params.city) qs.set("city", params.city);
  if (params.max_price !== undefined) {
    qs.set("max_price", String(params.max_price));
  }
  const suffix = qs.toString();
  const res = await fetch(`${API_URL}/ev/stations/${suffix ? `?${suffix}` : ""}`);
  return handleResponse<EvStation[]>(res);
}

export async function fetchEvStationDetail(id: number): Promise<EvStationDetail> {
  const res = await fetch(`${API_URL}/ev/stations/${id}/`);
  return handleResponse<EvStationDetail>(res);
}

export interface CreateEvBookingPayload {
  station_id: number;
  /**
   * An ISO-8601 instant that lands exactly on one of the station's published
   * `slot_grid.slots[].start` values. The server rejects anything off-grid
   * rather than snapping it, so this must be built from the grid the UI
   * actually rendered.
   */
  slot_time: string;
  vehicle_number: string;
  estimated_kwh?: number;
  notes?: string;
}

export async function createEvBooking(
  payload: CreateEvBookingPayload,
  accessToken: string,
): Promise<EvBooking> {
  const res = await authedFetch(
    `${API_URL}/ev/bookings/`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  return handleResponse<EvBooking>(res);
}

export async function listEvBookings(
  accessToken: string,
  status?: EvBookingStatus,
  page = 1,
): Promise<PaginatedResponse<EvBooking>> {
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set("status", status);
  const res = await authedFetch(
    `${API_URL}/ev/bookings/?${qs.toString()}`,
    { method: "GET" },
    accessToken,
  );
  return handleResponse<PaginatedResponse<EvBooking>>(res);
}

export async function cancelEvBooking(
  id: number,
  accessToken: string,
): Promise<EvBooking> {
  const res = await authedFetch(
    `${API_URL}/ev/bookings/${id}/cancel/`,
    { method: "POST", body: JSON.stringify({}) },
    accessToken,
  );
  return handleResponse<EvBooking>(res);
}

/** Every distinct city in the current result set, for the filter dropdown. */
export function uniqueCities(stations: EvStation[]): string[] {
  return Array.from(new Set(stations.map((s) => s.city).filter(Boolean))).sort();
}

// ── Admin command hub ─────────────────────────────────────────────────────────

/**
 * A technician on the admin's roster.
 *
 * `employee_id` and `total_jobs` are `null` rather than absent for a staff
 * account with no `StaffProfile` — an operator promoted straight through
 * Django admin. The roster renders those cells as a dash rather than
 * "undefined".
 */
export interface AdminStaff {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_active: boolean;
  date_joined: string;
  employee_id: string | null;
  total_jobs: number | null;
}

/**
 * The provisioning body.
 *
 * There is deliberately no `role` or `is_staff` here. The server hardcodes
 * both, so the type mirrors the contract: this endpoint creates technicians
 * and cannot mint administrators, and the type system says so.
 */
export interface CreateStaffPayload {
  username: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
}

/** One status transition, for the admin's recent-activity feed. */
export interface AdminActivity {
  booking_id: number;
  service_name: string;
  customer_name: string;
  previous_status: string;
  new_status: string;
  changed_by_name: string | null;
  notes: string;
  created_at: string;
}

/** One bucket of the services breakdown. `revenue` is a decimal string. */
export interface AdminServiceBreakdown {
  label: string;
  count: number;
  revenue: string;
}

export interface AdminMetrics {
  total_revenue: string;
  total_bookings: number;
  active_jobs: number;
  completed_jobs: number;
  cancelled_jobs: number;
  ev_bookings: number;
  registered_customers: number;
  total_staff: number;
  active_staff: number;
  services_breakdown: AdminServiceBreakdown[];
  recent_activity: AdminActivity[];
}

export async function fetchAdminStaff(accessToken: string): Promise<AdminStaff[]> {
  const res = await authedFetch(`${API_URL}/admin/staff/`, { method: "GET" }, accessToken);
  return handleResponse<AdminStaff[]>(res);
}

export async function createStaffMember(
  payload: CreateStaffPayload,
  accessToken: string,
): Promise<AdminStaff> {
  const res = await authedFetch(
    `${API_URL}/admin/staff/`,
    { method: "POST", body: JSON.stringify(payload) },
    accessToken,
  );
  return handleResponse<AdminStaff>(res);
}

export async function fetchAdminMetrics(accessToken: string): Promise<AdminMetrics> {
  const res = await authedFetch(`${API_URL}/admin/metrics/`, { method: "GET" }, accessToken);
  return handleResponse<AdminMetrics>(res);
}
