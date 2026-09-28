/**
 * Booking presentation helpers.
 *
 * The status enum and the cancellation rules here are mirrors of the Django
 * side — `bookings.models.Booking.Status` and the guard in
 * `bookings.views.booking_cancel`. Keeping them in one module stops the
 * dashboard and the detail page from drifting into two different opinions
 * about which statuses exist and which ones are terminal.
 */

import type { BadgeTone } from "@/components/ui/Badge";
import type { BookingStatus, EvBookingStatus } from "./api";

export const BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
];

/** Forward path the timeline walks. CANCELLED is a branch, not a step. */
export const BOOKING_TIMELINE: {
  status: BookingStatus;
  label: string;
  blurb: string;
}[] = [
  { status: "pending", label: "Requested", blurb: "We have your request" },
  { status: "confirmed", label: "Confirmed", blurb: "A technician is assigned" },
  { status: "in_progress", label: "In progress", blurb: "Work is underway" },
  { status: "completed", label: "Completed", blurb: "Job finished and closed" },
];

export const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "info",
  in_progress: "primary",
  completed: "success",
  cancelled: "danger",
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Terminal statuses — `bookings.views.booking_cancel` refuses to cancel these. */
export const CANCEL_BLOCKED: BookingStatus[] = ["completed", "cancelled"];

export function canCancelBooking(status: BookingStatus): boolean {
  return !CANCEL_BLOCKED.includes(status);
}

/**
 * Coerce whatever arrived on the wire into a status this app knows.
 *
 * The server is the authority on the enum, and `BOOKING_STATUSES` mirrors it
 * exactly — so for a well-behaved response this is the identity function.
 * It earns its keep on the two ways a payload can be *wrong* without the
 * server being at fault:
 *
 *   - case or separator drift — a status arriving as `in-progress` or
 *     `IN_PROGRESS` would otherwise miss every lookup in this file and fall
 *     through to an unstyled, unbadged cell;
 *   - a value from a newer server this client predates, which should degrade
 *     to something honest rather than throwing inside a `.map()` and
 *     blanking the whole list.
 *
 * `completed` is checked before the generic path because "finished" and
 * "closed" both mean the same thing here, and a completed job is the one
 * state the timeline must never misrender as still-running.
 */
export function normalizeStatus(raw: string | null | undefined): BookingStatus | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "done" || key === "finished" || key === "closed") return "completed";
  return (BOOKING_STATUSES as string[]).includes(key)
    ? (key as BookingStatus)
    : null;
}

/**
 * True once a job has stopped moving: either finished or cancelled.
 *
 * A cancelled job is not on the timeline — it is a branch off it — so this
 * answers "is there anything left to advance?", not "what step are we on?".
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "completed" || normalized === "cancelled";
}

/** True only for a job that actually finished. */
export function isCompletedStatus(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "completed";
}

/**
 * Where `status` sits on the timeline.
 *
 * Never returns `-1`. An unrecognised status used to fall through
 * `findIndex` to `-1`, and every step then rendered as *undone* — so a
 * single unknown value silently displayed a completed job as though nothing
 * had happened yet. A stepper that lies about progress is worse than one
 * that admits it is unsure, so an unknown or missing status is reported as
 * "not started" (`-1` is kept for that, and the caller decides) while a
 * terminal status is pinned to the last step it could legitimately be at.
 *
 * `cancelled` maps to `0` rather than the last index: a cancelled job never
 * progressed, and the detail page renders cancellation on its own branch
 * instead of walking the timeline at all.
 */
export function statusIndex(status: string | null | undefined): number {
  const normalized = normalizeStatus(status);
  if (normalized === null) return -1;
  if (normalized === "cancelled") return 0;
  return BOOKING_TIMELINE.findIndex((s) => s.status === normalized);
}

/**
 * Timeline fill as a percentage.
 *
 * A completed job is `100` by construction, not by arithmetic that a bad
 * status could spoil — `completed` is the last step, so
 * `(3 + 1) / 4 * 100 === 100`, but the branch is spelled out because this
 * value is what the spec's "must render 100% completed" requirement rests
 * on and a reader should not have to do the division to check it.
 *
 * A cancelled or unknown status is `0`: nothing on the forward path was
 * reached, and rendering a partial bar for work that was abandoned would
 * read as progress.
 */
export function timelinePercent(status: string | null | undefined): number {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return 100;
  const index = statusIndex(normalized);
  if (index < 0) return 0;
  return Math.round(((index + 1) / BOOKING_TIMELINE.length) * 100);
}

export function formatBookingDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatBookingTime(value: string): string {
  // DRF renders a TimeField as "HH:MM:SS".
  const [h, m] = value.split(":");
  const hour = Number(h);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function formatPrice(value: string): string {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "₹—";
}

/* ── EV charging reservations ────────────────────────────────────────────────
   A second, smaller status machine. It is kept beside the service-booking one
   rather than merged into it: the two enums have different members, and a
   shared map keyed by status would silently badge an "active" charge as
   "unknown". Mirrors `ev_charging.models.EVChargingBooking.Status`. */

export const EV_STATUS_TONE: Record<EvBookingStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "info",
  active: "primary",
  completed: "success",
  cancelled: "danger",
};

/** Terminal statuses — `EVBookingCancelView` refuses to cancel these. */
export const EV_CANCEL_BLOCKED: EvBookingStatus[] = ["completed", "cancelled"];

export function canCancelEvBooking(status: EvBookingStatus): boolean {
  return !EV_CANCEL_BLOCKED.includes(status);
}

/** An EV session is imminent if it starts within the next two hours. */
export function isEvStartingSoon(startAt: string, withinHours = 2): boolean {
  const start = new Date(startAt).getTime();
  if (Number.isNaN(start)) return false;
  const now = Date.now();
  return start > now && start - now <= withinHours * 3_600_000;
}

/** "14:30, 28 Sep" from an ISO instant. */
export function formatEvWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return "—";
  const time = start.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  const day = start.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const end = new Date(endAt);
  const endTime = Number.isNaN(end.getTime())
    ? null
    : end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return endTime ? `${time} – ${endTime}, ${day}` : `${time}, ${day}`;
}

/** Money as the EV API returns it — a JSON number, not a string. */
export function formatEvMoney(value: number): string {
  return Number.isFinite(value) ? `₹${value.toLocaleString("en-IN")}` : "₹—";
}
