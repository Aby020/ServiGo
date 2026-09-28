"use client";

/**
 * Bookings audit — the platform-wide booking list, read-only.
 *
 * ── Why this reuses `GET /api/bookings/` ──────────────────────────────────────
 * That endpoint already returns *every* booking to staff and admin
 * (`BookingListCreateView.get` branches on role), so an admin needs no new
 * API surface to see the whole book of work. Adding an admin-only list
 * endpoint would be a second code path over the same queryset.
 *
 * ── Why there are no actions here ────────────────────────────────────────────
 * This is an audit view, not a dispatch view. Advancing a job's status from
 * an operator console is `PATCH /api/bookings/<id>/status/`, which is the
 * dispatch queue's job and already has a confirmation step, an audit trail
 * and a `changed_by` record. Duplicating it here without those would give an
 * admin two paths to the same state change and one of them would be the
 * unreviewed one. So every row links into the canonical detail view instead.
 *
 * ── Customer name ────────────────────────────────────────────────────────────
 * `BookingSerializer` does not expose the customer, and adding a field to a
 * serializer the customer list also uses would leak another customer's name
 * into their own booking list response. The audit feed's activity rows do
 * carry `customer_name` (that endpoint is admin-only), and the detail view
 * shows it — so this list deliberately shows service and money only, rather
 * than widening a shared serializer to get a column.
 */

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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

const STATUSES = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

type StatusKey = (typeof STATUSES)[number]["key"];

function AuditTableSkeleton() {
  return (
    <div role="status" aria-label="Loading bookings" className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

function BookingsAudit() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusKey>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    PaginatedResponse<Booking>,
    Error
  >({
    queryKey: ["admin", "bookings", page],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return listBookings(token, page);
    },
    staleTime: 30_000,
    retry: false,
  });

  const bookings = data?.results ?? [];
  const needle = search.trim().toLowerCase();
  const visible = bookings.filter((b) => {
    const statusOk = status === "all" || normalizeStatus(b.status) === status;
    if (!needle) return statusOk;
    // Three fields, deliberately: the only text a customer would recognise as
    // "their" booking. Searching by id or timestamp would be more useful to an
    // operator, but the payload does not carry a searchable customer name.
    return (
      statusOk &&
      (b.service_name.toLowerCase().includes(needle) ||
        b.location.toLowerCase().includes(needle) ||
        String(b.id) === needle)
    );
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.count / bookings.length || 1)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">
              All bookings
            </h2>
            <p className="mt-0.5 text-sm text-text-soft">
              {data
                ? `${data.count} booking${data.count === 1 ? "" : "s"} on record`
                : "Loading…"}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => refetch()}
            loading={isFetching}
            leadingIcon={<RefreshCw size={14} />}
          >
            Refresh
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_16rem]">
          <div>
            <label
              htmlFor="audit-search"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Search this page
            </label>
            <Input
              id="audit-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Service, location, or booking ID"
              leadingIcon={<Search size={14} />}
            />
          </div>
          <div>
            <span
              id="audit-status-label"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Status
            </span>
            <div
              role="group"
              aria-labelledby="audit-status-label"
              className="flex flex-wrap gap-1.5"
            >
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  aria-pressed={status === s.key}
                  className={cn(
                    "rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors duration-base ease-out",
                    status === s.key
                      ? "bg-primary text-on-primary"
                      : "bg-surface-2 text-text-soft hover:bg-surface-3 hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">
          Search and status apply to the {bookings.length} booking
          {bookings.length === 1 ? "" : "s"} on this page; the list is ordered
          newest first.
        </p>
      </Card>

      {isLoading ? (
        <AuditTableSkeleton />
      ) : isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <XCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {error?.message === "unauthenticated"
              ? "Your session expired. Please sign in again."
              : "We couldn't load the booking list."}
          </span>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <Card className="px-6 py-12 text-center">
          <span
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted"
            aria-hidden="true"
          >
            <CalendarCheck size={20} />
          </span>
          <h3 className="font-display text-base font-bold text-ink">
            {bookings.length === 0
              ? "No bookings on record"
              : "Nothing matches on this page"}
          </h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-soft">
            {bookings.length === 0
              ? "Bookings will appear here as customers place them."
              : "Clear the search box or pick a different status, or turn the pages."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className={cn(
                "w-full text-left text-sm transition-opacity duration-base ease-out",
                isFetching && "opacity-60",
              )}
            >
              <caption className="sr-only">
                Every booking on the platform, newest first
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-3 font-medium">ID</th>
                  <th scope="col" className="px-5 py-3 font-medium">Service</th>
                  <th scope="col" className="px-5 py-3 font-medium">Scheduled</th>
                  <th scope="col" className="px-5 py-3 font-medium">Location</th>
                  <th scope="col" className="px-5 py-3 font-medium">Value</th>
                  <th scope="col" className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const key = normalizeStatus(b.status);
                  return (
                    <tr
                      key={b.id}
                      className="border-b border-line last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/bookings/${b.id}`}
                          className="font-mono text-xs font-medium text-primary hover:underline"
                        >
                          #{b.id}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-ink">
                        {b.service_name}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-text-soft">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={12} aria-hidden="true" />
                          {formatBookingDate(b.preferred_date)} ·{" "}
                          {formatBookingTime(b.preferred_time)}
                        </span>
                      </td>
                      <td className="max-w-[14rem] px-5 py-3">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-text-soft">
                          <MapPin size={12} aria-hidden="true" />
                          <span className="truncate">{b.location}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-ink">
                        {formatPrice(b.service_price)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        <Badge tone={key ? STATUS_TONE[key] : "neutral"} size="sm" dot>
                          {b.status_display || key || "Unknown"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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

export default function AdminBookingsPage() {
  return (
    <DashboardShell expectedRole="admin" title="Bookings audit">
      {() => <BookingsAudit />}
    </DashboardShell>
  );
}
