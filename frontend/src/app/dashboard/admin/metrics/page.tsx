"use client";

/**
 * Platform metrics — the full analytics view.
 *
 * The command centre shows the headline numbers and a short activity feed.
 * This page is where the same payload is laid out to be *read*: every figure
 * the API returns, the services mix with its revenue, and the audit trail in
 * full-length form.
 *
 * ── It is the same request, not a second one ──────────────────────────────────
 * The query key is `["admin", "metrics"]` — the command centre's key. Landing
 * here after visiting the overview is a cache hit, not a round trip, and
 * provisioning a technician on either page invalidates both. Two pages
 * calling the same endpoint with two different keys is how a dashboard ends up
 * showing a revenue figure that disagrees with the one next door.
 *
 * ── What these numbers do not include ─────────────────────────────────────────
 * There is no time series. `AdminMetricsView` aggregates over the whole table
 * because that is what the schema supports; adding day/week/month buckets means
 * a date truncation on `Booking.created_at` server-side and a new endpoint
 * contract. Rather than fake a trend from a lifetime total, the page states
 * the scope in the subtitle so "Revenue" is never misread as "Revenue this
 * month".
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  IndianRupee,
  RefreshCw,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchAdminMetrics, type AdminActivity, type AdminMetrics } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { STATUS_LABEL, formatPrice, formatTimestamp } from "@/lib/booking-ui";
import { cn } from "@/lib/utils";

const ACTIVITY_TONE: Record<string, BadgeTone> = {
  completed: "success",
  cancelled: "danger",
  in_progress: "primary",
  confirmed: "info",
  pending: "warning",
};

/** A figure plus the sentence that says what it counts. */
interface Stat {
  label: string;
  value: string;
  caption: string;
  icon: typeof Users;
  tone: string;
}

function buildStats(metrics: AdminMetrics | undefined): Stat[] {
  const dash = "—";
  return [
    {
      label: "Total revenue",
      value: metrics ? formatPrice(metrics.total_revenue) : dash,
      caption: "Completed service jobs and finished charging sessions, summed.",
      icon: IndianRupee,
      tone: "text-success",
    },
    {
      label: "Total bookings",
      value: metrics ? String(metrics.total_bookings) : dash,
      caption: "Service bookings plus EV reservations, every status included.",
      icon: CalendarCheck,
      tone: "text-primary",
    },
    {
      label: "Active jobs",
      value: metrics ? String(metrics.active_jobs) : dash,
      caption: "Pending, confirmed or in progress — still actionable by staff.",
      icon: ClipboardCheck,
      tone: "text-primary",
    },
    {
      label: "Completed jobs",
      value: metrics ? String(metrics.completed_jobs) : dash,
      caption: "Service bookings marked complete by a technician.",
      icon: CheckCircle2,
      tone: "text-accent",
    },
    {
      label: "Cancelled jobs",
      value: metrics ? String(metrics.cancelled_jobs) : dash,
      caption: "Bookings the customer or an admin called off.",
      icon: XCircle,
      tone: "text-danger",
    },
    {
      label: "EV reservations",
      value: metrics ? String(metrics.ev_bookings) : dash,
      caption: "Charging bay bookings across the station network.",
      icon: Zap,
      tone: "text-energy",
    },
    {
      label: "Registered customers",
      value: metrics ? String(metrics.registered_customers) : dash,
      caption: "Accounts holding the customer role.",
      icon: Users,
      tone: "text-info",
    },
    {
      label: "Technicians",
      value: metrics
        ? `${metrics.active_staff} / ${metrics.total_staff}`
        : dash,
      caption: "Active staff accounts of the total on the roster.",
      icon: Users,
      tone: "text-text-soft",
    },
  ];
}

function ActivityEntry({ entry }: { entry: AdminActivity }) {
  const from = entry.previous_status
    ? entry.previous_status.replace(/_/g, " ")
    : null;
  return (
    <li className="relative pl-6">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ACTIVITY_TONE[entry.new_status] ?? "neutral"} size="sm" dot>
          {STATUS_LABEL[entry.new_status as keyof typeof STATUS_LABEL] ??
            entry.new_status.replace(/_/g, " ")}
        </Badge>
        {from && (
          <span className="text-xs text-muted">from {from}</span>
        )}
      </div>
      <p className="mt-1 text-sm font-medium text-ink">
        {entry.service_name} · {entry.customer_name}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Booking #{entry.booking_id} · {formatTimestamp(entry.created_at)}
        {entry.changed_by_name && ` · by ${entry.changed_by_name}`}
      </p>
      {entry.notes && (
        <p className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-text-soft">
          “{entry.notes}”
        </p>
      )}
    </li>
  );
}

function MetricsView() {
  // Epoch-stable key so the fetch is shared with the command centre and its
  // 30-minute window is shared too.
  const [windowStart] = useState(() => Date.now());

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery<
    AdminMetrics,
    Error
  >({
    queryKey: ["admin", "metrics"],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return fetchAdminMetrics(token);
    },
    staleTime: 30_000,
    retry: false,
  });

  const stats = buildStats(data);
  const breakdown = data?.services_breakdown ?? [];
  // Guard against divide-by-zero: an empty breakdown would make `max` 0 and
  // every bar `NaN%`, which the browser renders as a 0-width bar with no
  // error — a silently wrong chart.
  const maxCount = Math.max(...breakdown.map((b) => b.count), 1);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <h2 className="font-display text-base font-bold text-ink">
            Lifetime platform totals
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-soft">
            Every figure below covers all records since launch — there is no date
            filter behind it, so treat these as totals rather than this
            month&apos;s performance. Measured at{" "}
            <span className="font-mono text-xs text-muted">
              {formatTimestamp(new Date(windowStart).toISOString())}
            </span>
            .
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
      </Card>

      {isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {error?.message === "unauthenticated"
              ? "Your session expired. Please sign in again."
              : `Metrics unavailable: ${error.message}`}
          </span>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {/* Stat grid */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
          isFetching && !isLoading && "opacity-70",
        )}
      >
        {stats.map(({ label, value, caption, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <span
              className={cn(
                "mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-surface-2",
                tone,
              )}
            >
              <Icon size={15} aria-hidden="true" />
            </span>
            <div className="font-display text-2xl font-bold tabular-nums text-ink">
              {value}
            </div>
            <div className="mt-0.5 text-sm font-medium text-ink">{label}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{caption}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Services mix */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Banknote size={15} aria-hidden="true" />
            What the platform sells
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Grouped by the service name snapshotted on each booking, so a later
            rename or price change never rewrites history. Revenue here is
            across <em>all</em> bookings including cancelled ones — it answers
            what the platform sells, not what it collected. Collected revenue is
            the Total revenue figure above.
          </p>

          {isLoading ? (
            <div role="status" aria-label="Loading breakdown" className="mt-5 flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full rounded-md" />
              ))}
            </div>
          ) : breakdown.length === 0 ? (
            <p className="mt-5 text-sm text-muted">
              No bookings yet — the mix appears once the first job is booked.
            </p>
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {breakdown.map((bucket) => (
                <li key={bucket.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-ink">
                      {bucket.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {bucket.count} booking{bucket.count === 1 ? "" : "s"} ·{" "}
                      {formatPrice(bucket.revenue)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.round((bucket.count / maxCount) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Audit trail */}
        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Activity size={15} aria-hidden="true" />
            Status change log
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            The five most recent transitions, whoever made them.
          </p>

          {isLoading ? (
            <div role="status" aria-label="Loading activity" className="mt-5 flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : !data || data.recent_activity.length === 0 ? (
            <p className="mt-5 text-sm text-muted">
              Nothing has changed yet. Status shifts will appear here as staff
              work the queue.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {data.recent_activity.map((entry) => (
                <ActivityEntry
                  key={`${entry.booking_id}-${entry.created_at}`}
                  entry={entry}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function AdminMetricsPage() {
  return (
    <DashboardShell expectedRole="admin" title="Platform metrics">
      {() => <MetricsView />}
    </DashboardShell>
  );
}
