"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { listBookings, type Booking, type PaginatedResponse } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import {
  STATUS_TONE,
  formatBookingDate,
  formatBookingTime,
  formatPrice,
} from "@/lib/booking-ui";

/**
 * Stats are derived from the real list rather than hard-coded, so the numbers
 * can never drift from the bookings below them. "Open" = anything the model
 * still allows staff to act on, i.e. not the two terminal statuses.
 */
function deriveStats(bookings: Booking[]) {
  const open = bookings.filter(
    (b) => b.status !== "completed" && b.status !== "cancelled",
  ).length;
  const closed = bookings.length - open;
  return [
    { label: "Open bookings", value: open, icon: CalendarCheck },
    { label: "Closed bookings", value: closed, icon: CheckCircle2 },
    // Loyalty points have no backend source yet — shown as a dash, not a fake.
    { label: "Loyalty points", value: "—", icon: Star },
  ];
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <li>
      <Link
        href={`/bookings/${booking.id}`}
        className="group flex items-start gap-4 rounded-md border border-line bg-surface px-4 py-4 transition-[border-color,background-color] duration-base ease-out hover:border-line-strong hover:bg-surface-2"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
          <CalendarCheck size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <p className="truncate text-sm font-semibold text-ink">
              {booking.service_name}
            </p>
            <Badge tone={STATUS_TONE[booking.status]} size="sm">
              {booking.status_display}
            </Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} aria-hidden="true" />
              {formatBookingDate(booking.preferred_date)} ·{" "}
              {formatBookingTime(booking.preferred_time)}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MapPin size={12} aria-hidden="true" />
              <span className="truncate">{booking.location}</span>
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-display text-sm font-bold tabular-nums text-ink">
            {formatPrice(booking.service_price)}
          </span>
          <ChevronRight
            size={16}
            className="text-line-strong transition-transform duration-base ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>
    </li>
  );
}

function EmptyBookings() {
  return (
    <Card className="px-6 py-12 text-center">
      <span
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary"
        aria-hidden="true"
      >
        <Sparkles size={20} />
      </span>
      <h3 className="font-display text-base font-bold text-ink">
        Nothing booked yet
      </h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-text-soft">
        When you book a service it shows up here with its live status, so you can
        follow it from request through to completion.
      </p>
      <ButtonLink href="/services" variant="accent" size="md" className="mt-5">
        Browse services
      </ButtonLink>
    </Card>
  );
}

function BookingsSkeleton() {
  return (
    <div role="status" aria-label="Loading bookings" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[74px] w-full rounded-md" />
      ))}
    </div>
  );
}

function CustomerBookings() {
  const { data, isLoading, isError, error } = useQuery<
    PaginatedResponse<Booking>,
    Error
  >({
    queryKey: ["bookings", 1],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return listBookings(token, 1);
    },
    staleTime: 30_000,
    retry: false,
  });

  const bookings = data?.results ?? [];
  const stats = deriveStats(bookings);

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome card */}
      <Card elevation="raised" className="p-6">
        <p className="font-display text-lg font-bold text-ink">
          Welcome back
        </p>
        <p className="mt-1 text-sm text-text-soft">
          Book a trusted technician and track the job in real time.
        </p>
        <ButtonLink href="/services" variant="primary" size="md" className="mt-5">
          Book a service
        </ButtonLink>
      </Card>

      {/* Stats row — computed from the real booking list */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5 text-center">
            <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon size={15} aria-hidden="true" />
            </span>
            <div className="font-display text-2xl font-bold tabular-nums text-primary">
              {value}
            </div>
            <div className="mt-0.5 text-sm text-muted">{label}</div>
          </Card>
        ))}
      </div>

      {/* Recent bookings — real data */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-ink">
            Recent bookings
          </h2>
          {data && data.count > bookings.length && (
            <span className="text-xs text-muted">
              Showing {bookings.length} of {data.count}
            </span>
          )}
        </div>

        {isLoading ? (
          <BookingsSkeleton />
        ) : isError ? (
          <div
            className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            role="alert"
          >
            <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {error?.message === "unauthenticated"
                ? "Your session expired. Please sign in again."
                : "We couldn't load your bookings. Please try again shortly."}
            </span>
          </div>
        ) : bookings.length === 0 ? (
          <EmptyBookings />
        ) : (
          <ul className="flex flex-col gap-3">
            {bookings.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function CustomerDashboard() {
  return (
    <DashboardShell expectedRole="customer" title="My Dashboard">
      {() => <CustomerBookings />}
    </DashboardShell>
  );
}
