"use client";

/**
 * "My Bookings" — the customer's full booking list.
 *
 * ── Why this is a page and not just a dashboard section ───────────────────────
 * The customer dashboard already shows recent bookings, but it is pinned to
 * page 1 and capped at whatever the page size happens to be, which is the
 * right trade for a dashboard ("catch me up on what's new") and the wrong one
 * for a list (you cannot reach booking number 30). This page is the one that
 * paginates, so the sidebar link has somewhere real to point and a customer
 * with a long history is not permanently limited to the first page.
 *
 * It reuses the same query key (`["bookings", page]`) as the dashboard, so
 * the two views share one cache: booking something and coming here shows the
 * new row without a refetch, and marking a job complete on the staff side
 * updates both at once.
 *
 * The `BookingRow` markup is duplicated from the dashboard rather than
 * extracted, because the two render different affordances — this one carries
 * a status filter and a pager. Factoring out a shared row for the sake of one
 * caller that isn't the same would be a premature abstraction; if a third
 * consumer appears, extract then.
 */

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  listBookings,
  type Booking,
  type PaginatedResponse,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import {
  STATUS_TONE,
  formatBookingDate,
  formatBookingTime,
  formatPrice,
  normalizeStatus,
} from "@/lib/booking-ui";
import { cn } from "@/lib/utils";

/**
 * The five statuses, in lifecycle order.
 *
 * "All" is prepended rather than being the absence of a filter, so the control
 * always has a selected state the user can see and change.
 */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * Client-side filter, and honestly labelled as one.
 *
 * `GET /api/bookings/` takes no status query parameter, so filtering here
 * would be over the current page only — which would be a lie told by
 * omission: "no completed bookings" while page 2 has four. So the filter says
 * what it does. The alternative, a server-side filter, means a new query
 * parameter on a list endpoint that is already correct; the local filter with
 * an explicit scope is the smaller honest change, and it is what the counts
 * beside each tab make visible.
 *
 * Every filter therefore also shows how many of the loaded page match, and the
 * header states the scope, so the page cannot be misread as a server-side
 * query.
 */
function matchesFilter(booking: Booking, filter: FilterKey) {
  if (filter === "all") return true;
  return normalizeStatus(booking.status) === filter;
}

function BookingRow({ booking }: { booking: Booking }) {
  const status = normalizeStatus(booking.status);
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
            <Badge tone={status ? STATUS_TONE[status] : "neutral"} size="sm" dot>
              {booking.status_display || status || "Unknown"}
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

function BookingsSkeleton() {
  return (
    <div role="status" aria-label="Loading bookings" className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[74px] w-full rounded-md" />
      ))}
    </div>
  );
}

function BookingsList() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    PaginatedResponse<Booking>,
    Error
  >({
    queryKey: ["bookings", page],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return listBookings(token, page);
    },
    staleTime: 30_000,
    retry: false,
  });

  const bookings = data?.results ?? [];
  const visible = bookings.filter((b) => matchesFilter(b, filter));
  const totalPages = data ? Math.max(1, Math.ceil(data.count / bookings.length || 1)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              Your bookings
            </h2>
            <p className="mt-0.5 text-sm text-text-soft">
              {data
                ? `${data.count} booking${data.count === 1 ? "" : "s"} in total`
                : "Loading…"}
            </p>
          </div>
          <ButtonLink href="/services" variant="primary" size="sm">
            Book a service
          </ButtonLink>
        </div>

        {/* Filters. `role="tablist"` is not used: these do not switch panels
            in the ARIA sense, they filter one list, and claiming a tab
            relationship would promise keyboard semantics this does not
            implement. Plain buttons with `aria-pressed` say exactly what
            they do. */}
        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === "all"
                ? bookings.length
                : bookings.filter((b) => matchesFilter(b, f.key)).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-base ease-out",
                  active
                    ? "bg-primary text-on-primary"
                    : "bg-surface-2 text-text-soft hover:bg-surface-3 hover:text-ink",
                )}
              >
                {f.label}
                <span className={cn("ml-1.5 tabular-nums", active ? "opacity-80" : "text-muted")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          {data && data.count > bookings.length
            ? `Showing page ${page} of ${totalPages} — filters apply to this page. Use the pager to reach older bookings.`
            : "Filters apply to the bookings loaded on this page."}
        </p>
      </Card>

      {isLoading ? (
        <BookingsSkeleton />
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <XCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {error?.message === "unauthenticated"
              ? "Your session expired. Please sign in again."
              : "We couldn't load your bookings."}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refetch()}
            leadingIcon={<RefreshCw size={14} />}
          >
            Try again
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <span
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary"
            aria-hidden="true"
          >
            {bookings.length === 0 ? <Sparkles size={20} /> : <AlertCircle size={20} />}
          </span>
          <h3 className="font-display text-base font-bold text-ink">
            {bookings.length === 0
              ? "Nothing booked yet"
              : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} bookings on this page`}
          </h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-text-soft">
            {bookings.length === 0
              ? "When you book a service it shows up here with its live status, so you can follow it from request through to completion."
              : "Try another filter, or turn the pages to see the rest of your history."}
          </p>
          {bookings.length === 0 && (
            <ButtonLink href="/services" variant="accent" size="md" className="mt-5">
              Browse services
            </ButtonLink>
          )}
        </Card>
      ) : (
        <ul
          className={cn(
            "flex flex-col gap-3 transition-opacity duration-base ease-out",
            isFetching && "opacity-60",
          )}
        >
          {visible.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </ul>
      )}

      {/* Pager — only rendered when there is genuinely more than one page.
          Hiding it at one page avoids a control that does nothing. */}
      {data && totalPages > 1 && (
        <nav
          aria-label="Booking pages"
          className="flex items-center justify-between gap-3 border-t border-line pt-4"
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={!data.previous || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            leadingIcon={<ChevronLeft size={14} />}
          >
            Previous
          </Button>
          <span className="text-xs text-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!data.next || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}

export default function BookingsPage() {
  // No DashboardShell: this page sits outside `/dashboard`, so it renders in
  // the public header layout like `/bookings/[id]`, `/services` and `/ev` do.
  // The token check still happens in the query — an anonymous visitor gets the
  // "sign in" message and a link, rather than a 401-shaped crash.
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="mb-2 font-display text-2xl font-bold tracking-tight text-ink">
        My Bookings
      </h1>
      <p className="mb-6 text-sm text-text-soft">
        Every service you have booked, and where each one stands.
      </p>
      <BookingsList />
    </Container>
  );
}
