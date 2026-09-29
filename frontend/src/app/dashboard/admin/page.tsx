"use client";

/**
 * Admin command centre — the platform overview and the technician roster.
 *
 * ── What an operator opens this for ───────────────────────────────────────────
 * Three questions, in priority order:
 *
 *   1. Is the business healthy right now?   → the KPI row
 *   2. Who is on the roster, and can they work?  → the staff table
 *   3. What just changed, and who changed it?  → the activity feed
 *
 * The services breakdown sits below those three because it is a question
 * worth asking occasionally rather than continuously — the dedicated
 * `/dashboard/admin/metrics` page is where it gets read properly.
 *
 * ── Nothing here is hardcoded ─────────────────────────────────────────────────
 * Every figure comes from `GET /api/admin/metrics/`, and the roster from
 * `GET /api/admin/staff/`. There is no placeholder stat left in this file: the
 * previous version rendered "₹4.2L" and "1,248 users" as literals, which is
 * the kind of thing that survives into a demo and then ships.
 *
 * ── Why a KPI shows `—` and not `0` ──────────────────────────────────────────
 * Same rule the staff dashboard uses: an unverified zero is
 * indistinguishable from a real one, and "0 active orders" during a failed
 * fetch is a lie told with a number. A dash says "not known yet".
 *
 * The roster table and the provisioning dialog are shared with
 * `/dashboard/admin/staff` (see `components/admin/`), and both pages read the
 * same `["admin", "staff"]` query, so the two never disagree about who is on
 * the roster.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  IndianRupee,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { AddStaffModal } from "@/components/admin/AddStaffModal";
import { StaffTable } from "@/components/admin/StaffTable";
import { StarRatingReadonly } from "@/components/FeedbackModal";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { toFieldErrors } from "@/lib/admin-errors";
import {
  createStaffMember,
  fetchAdminFeedback,
  fetchAdminMetrics,
  fetchAdminStaff,
  type AdminActivity,
  type AdminMetrics,
  type AdminStaff,
  type CreateStaffPayload,
  type Feedback,
  type UserProfile,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { STATUS_LABEL, formatPrice, formatTimestamp } from "@/lib/booking-ui";

/* ── KPI row ────────────────────────────────────────────────────────────────── */

interface Kpi {
  label: string;
  value: string;
  icon: typeof Users;
  tone: string;
}

const ACTIVITY_TONE: Record<string, BadgeTone> = {
  completed: "success",
  cancelled: "danger",
  in_progress: "primary",
  arrived: "primary",
  accepted: "info",
  claimed: "info",
  pending: "warning",
};

/**
 * The four headline figures, formatted from the metrics payload.
 *
 * `total_revenue` arrives as a decimal *string* — the same wire shape every
 * money field in this API uses — so it goes through `formatPrice` rather than
 * being interpolated directly. `Number.parseFloat` on it is what would produce
 * the `₹NaN` that a careless `₹${metrics.total_revenue}` renders.
 */
function buildKpis(metrics: AdminMetrics | undefined): Kpi[] {
  return [
    {
      label: "Total revenue",
      value: metrics ? formatPrice(metrics.total_revenue) : "—",
      icon: IndianRupee,
      tone: "text-success",
    },
    {
      label: "Active orders",
      value: metrics ? String(metrics.active_jobs) : "—",
      icon: ClipboardCheck,
      tone: "text-primary",
    },
    {
      label: "Completed jobs",
      value: metrics ? String(metrics.completed_jobs) : "—",
      icon: CheckCircle2,
      tone: "text-accent",
    },
    {
      label: "Registered customers",
      value: metrics ? String(metrics.registered_customers) : "—",
      icon: Users,
      tone: "text-info",
    },
  ];
}

/* ── Customer reviews ───────────────────────────────────────────────────────── */

/**
 * The average rating across every review, or `null` when there are none.
 *
 * Computed client-side from the list rather than asked of the server: the
 * reviews endpoint is a bare array with no aggregate, and adding a second
 * round trip for one number the client is already holding would be a request
 * that exists only to avoid arithmetic. `null` rather than `0` is the same
 * "unverified zero" rule the KPIs follow — an average of zero stars and no
 * reviews at all must not render the same.
 */
function averageRating(reviews: Feedback[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

function FeedbackRow({ review }: { review: Feedback }) {
  return (
    <li className="rounded-md border border-line bg-surface-2/40 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <StarRatingReadonly value={review.rating} />
          <span className="truncate text-sm font-semibold text-ink">
            {review.service_name}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted">
          {formatTimestamp(review.created_at)}
        </span>
      </div>
      {review.comment ? (
        <p className="mt-2 text-sm leading-relaxed text-text-soft">
          {review.comment}
        </p>
      ) : (
        <p className="mt-2 text-sm italic text-muted">No comment left.</p>
      )}
      <p className="mt-2 text-xs text-muted">
        {review.customer_name} · {review.customer_email} · Booking #
        {review.booking_id}
      </p>
    </li>
  );
}

function FeedbackList({
  reviews,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: {
  reviews: Feedback[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
}) {
  const average = averageRating(reviews);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading customer reviews"
        className="flex flex-col gap-3"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
      >
        <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
        <span className="flex-1">{errorMessage}</span>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted">
        No reviews yet. They will appear here once customers rate a completed
        job.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-primary-soft px-4 py-3">
        <StarRatingReadonly value={Math.round(average ?? 0)} />
        <span className="text-sm font-semibold text-ink">
          {average?.toFixed(1)} average
        </span>
        <span className="text-xs text-muted">
          from {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {reviews.map((review) => (
          <FeedbackRow key={review.id} review={review} />
        ))}
      </ul>
    </div>
  );
}

/* ── Activity feed ──────────────────────────────────────────────────────────── */
function ActivityRow({ entry }: { entry: AdminActivity }) {
  const from = entry.previous_status ? entry.previous_status.replace(/_/g, " ") : null;
  const to = entry.new_status.replace(/_/g, " ");
  return (
    <li className="relative pl-6">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary"
      />
      <p className="text-sm font-medium capitalize text-ink">
        {from ? `${from} → ` : ""}
        {to}
      </p>
      <p className="mt-1">
        <Badge tone={ACTIVITY_TONE[entry.new_status] ?? "neutral"} size="sm" dot>
          {STATUS_LABEL[entry.new_status as keyof typeof STATUS_LABEL] ?? to}
        </Badge>
      </p>
      <p className="mt-0.5 text-sm text-text-soft">
        {entry.service_name} · {entry.customer_name}
      </p>
      {entry.notes && <p className="mt-1 text-xs text-muted">“{entry.notes}”</p>}
      <p className="mt-1 text-xs text-muted">
        {formatTimestamp(entry.created_at)}
        {entry.changed_by_name && ` · ${entry.changed_by_name}`}
      </p>
    </li>
  );
}

/* ── Command centre ─────────────────────────────────────────────────────────── */

function AdminCommandCenter({ user }: { user: UserProfile }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<string | null>(null);

  const metricsQuery = useQuery<AdminMetrics, Error>({
    queryKey: ["admin", "metrics"],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return fetchAdminMetrics(token);
    },
    staleTime: 30_000,
    retry: false,
  });

  const staffQuery = useQuery<AdminStaff[], Error>({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return fetchAdminStaff(token);
    },
    staleTime: 30_000,
    retry: false,
  });

  /**
   * Reviews are fetched only while the Reviews tab is open, for the same
   * reason the staff dashboard's tab queries are: nothing on the Overview tab
   * reads them, and an operator who never opens the tab should not pay for the
   * request. The tab is part of the component rather than a route so the KPI
   * row and the roster above it stay mounted — switching tabs should not throw
   * away a metrics fetch the user already paid for.
   */
  const [view, setView] = useState<"overview" | "reviews">("overview");

  const feedbackQuery = useQuery<Feedback[], Error>({
    queryKey: ["admin", "feedback"],
    enabled: view === "reviews",
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return fetchAdminFeedback(token);
    },
    staleTime: 30_000,
    retry: false,
  });

  const metrics = metricsQuery.data;
  const staff = staffQuery.data;
  const kpis = buildKpis(metrics);

  useEffect(() => {
    if (!created) return;
    const timer = window.setTimeout(() => setCreated(null), 5000);
    return () => window.clearTimeout(timer);
  }, [created]);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateStaffPayload) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return createStaffMember(payload, token);
    },
    onSuccess: (newStaff) => {
      setModalOpen(false);
      setFieldErrors({});
      setCreated(newStaff.username);
      // Re-read rather than splice: the server's row is the authority, and
      // the list is ordered by join date, so appending locally would put the
      // new technician in the wrong place.
      void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "metrics"] });
    },
    onError: (err) => {
      setFieldErrors(toFieldErrors(err));
    },
  });

  const closeModal = () => {
    if (createMutation.isPending) return;
    setModalOpen(false);
    setFieldErrors({});
  };

  return (
    <div className="flex flex-col gap-6">
      {/* View tabs */}
      <div
        role="tablist"
        aria-label="Admin views"
        className="flex w-fit gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {([
          { id: "overview", label: "Overview" },
          { id: "reviews", label: "Customer Reviews" },
        ] as const).map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={view === t.id}
            onClick={() => setView(t.id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors duration-base ease-out",
              view === t.id
                ? "bg-primary-soft text-primary"
                : "text-text-soft hover:bg-surface-3",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "reviews" ? (
        <Card className="p-5">
          <h2 className="font-display text-base font-bold text-ink">
            Customer reviews
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Ratings left by customers on completed jobs, newest first.
          </p>
          <div className="mt-4">
            <FeedbackList
              reviews={feedbackQuery.data ?? []}
              isLoading={feedbackQuery.isLoading}
              isError={feedbackQuery.isError}
              errorMessage={
                feedbackQuery.error?.message ??
                "The reviews could not be loaded."
              }
              onRetry={() => feedbackQuery.refetch()}
            />
          </div>
        </Card>
      ) : (
        <>
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, tone }) => (
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
            <div className="mt-0.5 text-sm text-muted">{label}</div>
          </Card>
        ))}
      </div>

      {/* Confirmation */}
      {created && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success"
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-mono">{created}</span> can now sign in and work the
            dispatch queue.
          </span>
        </p>
      )}

      {/* Metrics request failed */}
      {metricsQuery.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1">Metrics unavailable: {metricsQuery.error.message}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => metricsQuery.refetch()}
            leadingIcon={<RefreshCw size={14} />}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Staff roster */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-base font-bold text-ink">Staff</h2>
              <p className="mt-0.5 text-xs text-muted">
                {metrics
                  ? `${metrics.active_staff} active of ${metrics.total_staff}`
                  : "Loading roster…"}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setFieldErrors({});
                setModalOpen(true);
              }}
              leadingIcon={<Plus size={14} aria-hidden="true" />}
            >
              Add technician
            </Button>
          </div>

          <div className="p-5">
            <StaffTable
              staff={staff}
              isLoading={staffQuery.isLoading}
              isError={staffQuery.isError}
              errorMessage={staffQuery.error?.message ?? "The roster could not be loaded."}
              onRetry={() => staffQuery.refetch()}
            />
          </div>
        </Card>

        {/* Activity + breakdown */}
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              <Activity size={15} aria-hidden="true" />
              Recent activity
            </h2>
            {metricsQuery.isLoading ? (
              <div role="status" aria-label="Loading activity" className="mt-4 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !metrics || metrics.recent_activity.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                Nothing has changed yet. Status shifts will appear here.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {metrics.recent_activity.map((entry) => (
                  <ActivityRow
                    key={`${entry.booking_id}-${entry.created_at}`}
                    entry={entry}
                  />
                ))}
              </ul>
            )}
          </Card>

          {metrics && metrics.services_breakdown.length > 0 && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
                <Banknote size={15} aria-hidden="true" />
                Services breakdown
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                All bookings, by the service name snapshotted at booking time.
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {metrics.services_breakdown.map((bucket) => {
                  // Width is relative to the busiest bucket, so the bar shows
                  // mix rather than absolute volume — a 4-order service next
                  // to a 400-order one would otherwise render the first as an
                  // invisible sliver.
                  const max = Math.max(...metrics.services_breakdown.map((b) => b.count), 1);
                  return (
                    <li key={bucket.label}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-ink">{bucket.label}</span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {bucket.count} · {formatPrice(bucket.revenue)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((bucket.count / max) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="font-display text-base font-bold text-ink">Platform</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-text-soft">Total bookings</dt>
                <dd className="tabular-nums font-medium text-ink">
                  {metrics ? metrics.total_bookings : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-soft">EV reservations</dt>
                <dd className="tabular-nums font-medium text-ink">
                  {metrics ? metrics.ev_bookings : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-soft">Cancelled jobs</dt>
                <dd className="tabular-nums font-medium text-ink">
                  {metrics ? metrics.cancelled_jobs : "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              Signed in as {user.email}
            </p>
          </Card>
        </div>
      </div>
        </>
      )}

      {modalOpen && (
        <AddStaffModal
          onClose={closeModal}
          onSubmit={(payload) => createMutation.mutate(payload)}
          pending={createMutation.isPending}
          errors={fieldErrors}
        />
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <DashboardShell expectedRole="admin" title="Command centre">
      {(user) => <AdminCommandCenter user={user} />}
    </DashboardShell>
  );
}
