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
import type { BookingStatus } from "./api";

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
