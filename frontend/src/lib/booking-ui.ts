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

export function statusIndex(status: BookingStatus): number {
  return BOOKING_TIMELINE.findIndex((s) => s.status === status);
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
