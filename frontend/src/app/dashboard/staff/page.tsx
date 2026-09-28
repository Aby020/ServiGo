"use client";

/**
 * Staff operations dashboard — the dispatch desk.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 * Three queues over one dataset, because the three questions a technician has
 * at the start of a shift are different questions:
 *
 *   Unassigned  "what can I pick up?"   — jobs nobody has claimed
 *   My jobs     "what is on me?"        — assigned to the caller, still live
 *   Completed   "what did I finish?"    — terminal history
 *
 * The counts in the stats bar come from the same queries the tabs use, so a
 * stat tile can never disagree with the list underneath it. A tile reads `—`
 * until its tab has been opened at least once, because an unverified `0` is
 * indistinguishable from "you have no jobs" and would be a lie in the one
 * case where it matters.
 *
 * ── Why every mutation invalidates three keys ────────────────────────────────
 * Claiming or advancing a job changes what the *customer* sees (their
 * timeline), what this dashboard shows, and what `/api/bookings/` returns.
 * All three are cached under separate keys, so each mutation invalidates
 * `staff-bookings`, `bookings` and `booking` together. Invalidating only the
 * first is how a technician ends up watching a stale queue while the
 * customer's screen is already up to date.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Inbox,
  MapPin,
  Phone,
  PlayCircle,
  UserCheck,
  X,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import {
  getStaffBookings,
  assignStaffBooking,
  updateStaffBookingStatus,
  type BookingDetail,
  type BookingStatus,
  type PaginatedResponse,
  type StaffBooking,
  type StaffQueueFilter,
  type UserProfile,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import {
  STATUS_LABEL,
  STATUS_TONE,
  formatBookingDate,
  formatBookingTime,
  formatPrice,
} from "@/lib/booking-ui";

/* ── Queue tabs ─────────────────────────────────────────────────────────────── */

type TabId = "unassigned" | "mine" | "completed";

interface TabDef {
  id: TabId;
  label: string;
  icon: typeof Inbox;
  assigned: StaffQueueFilter;
  statuses?: BookingStatus[];
  empty: string;
}

const TABS: TabDef[] = [
  {
    id: "unassigned",
    label: "Unassigned queue",
    icon: Inbox,
    assigned: "unassigned",
    // A cancelled job is nobody's problem to claim, and a completed one is
    // already closed — showing either in the "pick this up" list is noise.
    statuses: ["pending", "confirmed", "in_progress"],
    empty: "Queue is clear — every request has a technician.",
  },
  {
    id: "mine",
    label: "My jobs",
    icon: ClipboardList,
    assigned: "mine",
    statuses: ["pending", "confirmed", "in_progress"],
    empty: "You have no active jobs. Claim one from the unassigned queue.",
  },
  {
    id: "completed",
    label: "Completed history",
    icon: CheckCircle2,
    assigned: "mine",
    statuses: ["completed", "cancelled"],
    empty: "Nothing here yet — finished jobs will be listed.",
  },
];

/**
 * The statuses a technician may move a job *to*, given where it is now.
 *
 * Mirrors the server's terminal-state rules, but only so the UI can grey out
 * a button the server would refuse — the server is still the authority, and
 * a disagreement shows up as an error banner rather than a silent no-op.
 */
function nextActions(
  status: BookingStatus,
): Array<{ status: BookingStatus; label: string; icon: typeof PlayCircle }> {
  switch (status) {
    case "pending":
      return [
        { status: "confirmed", label: "Confirm job", icon: UserCheck },
        { status: "in_progress", label: "Start service", icon: PlayCircle },
      ];
    case "confirmed":
      return [{ status: "in_progress", label: "Start service", icon: PlayCircle }];
    case "in_progress":
      return [{ status: "completed", label: "Mark completed", icon: CheckCircle2 }];
    default:
      // completed / cancelled are terminal — nothing to offer.
      return [];
  }
}

/* ── Status modal ───────────────────────────────────────────────────────────── */

/**
 * Confirmation dialog for one status transition.
 *
 * Notes are optional on the wire but the modal makes them easy to type,
 * because a bare status flip reaches the customer as a timeline entry with no
 * explanation attached. The `nextStatus`/`booking` pairing is deliberate: a
 * modal that outlives the tab it was opened from must not be able to fire
 * against a different booking.
 */
function StatusModal({
  booking,
  nextStatus,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  booking: StaffBooking;
  nextStatus: BookingStatus;
  onClose: () => void;
  onConfirm: (notes: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-line bg-surface shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2
              id="status-modal-title"
              className="font-display text-base font-bold text-ink"
            >
              {STATUS_LABEL[nextStatus]}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {booking.service_name} · {booking.customer_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="rounded p-1 text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <Textarea
            label="Note for the customer"
            hint="Optional, but it appears on their booking timeline."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Arrived on site, work started."
            disabled={pending}
          />

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={pending}
            onClick={() => onConfirm(notes.trim())}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Job card ───────────────────────────────────────────────────────────────── */

function StatusPill({ status }: { status: BookingStatus }) {
  return (
    <Badge tone={STATUS_TONE[status] as BadgeTone} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function JobCard({
  booking,
  isMine,
  busy,
  onClaim,
  onTransition,
}: {
  booking: StaffBooking;
  isMine: boolean;
  busy: boolean;
  onClaim: () => void;
  onTransition: (status: BookingStatus) => void;
}) {
  const actions = isMine ? nextActions(booking.status) : [];

  return (
    <Card
      as="li"
      className={cn("p-5", isMine && "border-primary/30", busy && "opacity-60")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-ink">
              {booking.service_name}
            </h3>
            <StatusPill status={booking.status} />
            {!isMine && booking.assigned_staff_name && (
              <Badge tone="neutral">Assigned to {booking.assigned_staff_name}</Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-text-soft">
            {booking.customer_name} · {formatPrice(booking.service_price)}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <CalendarClock size={13} aria-hidden="true" />
              <dt className="sr-only">Appointment</dt>
              <dd>
                {formatBookingDate(booking.preferred_date)} ·{" "}
                {formatBookingTime(booking.preferred_time)}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={13} aria-hidden="true" />
              <dt className="sr-only">Location</dt>
              <dd>{booking.location}</dd>
            </div>
            {isMine && (
              <div className="flex items-center gap-1.5">
                <Phone size={13} aria-hidden="true" />
                <dt className="sr-only">Customer phone</dt>
                <dd>{booking.customer_phone}</dd>
              </div>
            )}
          </dl>

          {booking.notes && (
            <p className="mt-3 border-l-2 border-line pl-3 text-xs text-text-soft">
              {booking.notes}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap gap-2">
          {!isMine && booking.assigned_staff_id === null && (
            <Button size="sm" onClick={onClaim} disabled={busy} leadingIcon={<UserCheck size={14} />}>
              Claim job
            </Button>
          )}
          {actions.map(({ status, label, icon: Icon }) => (
            <Button
              key={status}
              size="sm"
              variant={status === "completed" ? "accent" : "primary"}
              onClick={() => onTransition(status)}
              disabled={busy}
              leadingIcon={<Icon size={14} />}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── Dashboard ──────────────────────────────────────────────────────────────── */

function StaffCommandCenter({ user }: { user: UserProfile }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("unassigned");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [modal, setModal] = useState<{ booking: StaffBooking; next: BookingStatus } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const active = TABS.find((t) => t.id === tab)!;

  /**
   * One query per tab, mounted only for the tab in view. Three tabs means at
   * most one request in flight, and the tab badges stay honest because each
   * tab keeps its own cached `count` once visited.
   */
  const unassignedQuery = useQuery<PaginatedResponse<StaffBooking>, Error>({
    queryKey: ["staff-bookings", "unassigned"],
    enabled: tab === "unassigned",
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return getStaffBookings(token, {
        assigned: "unassigned",
        status: TABS[0].statuses,
        page_size: 50,
      });
    },
  });

  const mineQuery = useQuery<PaginatedResponse<StaffBooking>, Error>({
    queryKey: ["staff-bookings", "mine"],
    enabled: tab === "mine",
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return getStaffBookings(token, {
        assigned: "mine",
        status: TABS[1].statuses,
        page_size: 50,
      });
    },
  });

  const completedQuery = useQuery<PaginatedResponse<StaffBooking>, Error>({
    queryKey: ["staff-bookings", "completed"],
    enabled: tab === "completed",
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return getStaffBookings(token, {
        assigned: "mine",
        status: TABS[2].statuses,
        page_size: 50,
      });
    },
  });

  const current =
    tab === "unassigned" ? unassignedQuery : tab === "mine" ? mineQuery : completedQuery;

  const bookings = current.data?.results ?? [];
  const isLoading = current.isLoading;

  /**
   * Every mutation fans out to all three caches.
   *
   * `booking` (singular) is the key `/bookings/[id]` caches its
   * `BookingDetail` under. It is included because that payload carries
   * `status_history`: without this a customer sitting on the booking page
   * would keep seeing the pre-transition trail until a manual refresh.
   *
   * `refetchType: "inactive"` is load-bearing, not decoration. TanStack's
   * default is `"active"` — only queries with a live observer refetch — so
   * a customer's booking tab in *another* window is marked stale and then
   * left alone. If its entry is later garbage-collected (it has no observer,
   * so it is the first thing the GC reclaims) the tab remounts and refetches,
   * and any window where that request is slow or fails leaves the pre-
   * transition `in_progress` on screen. The reported symptom — a job marked
   * completed still showing "In progress" to the customer — is this.
   * Inactive queries are cheap to refetch (the customer is the only one
   * asking) and being wrong here is the expensive outcome, so the eager
   * refetch is worth the request.
   */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["staff-bookings"], refetchType: "inactive" });
    queryClient.invalidateQueries({ queryKey: ["bookings"], refetchType: "inactive" });
    queryClient.invalidateQueries({ queryKey: ["booking"], refetchType: "inactive" });
  };

  const claimMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return assignStaffBooking(id, token);
    },
    onMutate: (id) => {
      setActionError(null);
      setPendingId(id);
    },
    onSuccess: () => {
      invalidateAll();
    },
    // Surface the server's refusal inline instead of only in the console —
    // "someone else claimed it first" is a normal race, not a crash.
    onError: (err) => setActionError(err.message),
    onSettled: () => setPendingId(null),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: BookingStatus; notes: string }) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return updateStaffBookingStatus(id, { status, notes }, token);
    },
    onSuccess: (updated, { id, status }) => {
      // Seed the fresh status before invalidating, so a concurrent refetch
      // cannot land an older body on top of it. Invalidation only marks a
      // query stale; whatever is already in the cache is what renders in the
      // meantime, and that should be the server's answer, not the previous
      // status. This is the last line of defence against a completed job
      // reappearing as in-progress on the customer's screen.
      //
      // Only the status is copied across, and only when the cache entry
      // exists. `updateStaffBookingStatus` returns the *staff* view of the
      // booking, which carries the customer's phone and email — more than
      // the customer-facing page needs and more than it had before. Merging
      // just the status keeps the entry exactly as complete as it was, so
      // the customer's timeline and history survive a technician's action
      // instead of being replaced by a differently-shaped body.
      queryClient.setQueryData<BookingDetail>(["booking", id], (cached) =>
        cached ? { ...cached, status } : cached,
      );
      invalidateAll();
      setModal(null);
      setPendingId(null);
    },
    onError: (err) => setActionError(err.message),
  });

  const openModal = (booking: StaffBooking, next: BookingStatus) => {
    setActionError(null);
    setPendingId(booking.id);
    setModal({ booking, next });
  };

  const closeModal = () => {
    if (statusMutation.isPending) return;
    setModal(null);
    setPendingId(null);
  };

  // Quick stats, sourced from the tab queries themselves.
  const activeCount = mineQuery.data?.count;
  const unassignedCount = unassignedQuery.data?.count;
  const completedCount = completedQuery.data?.count;

  const stats = useMemo(
    () => [
      { label: "My active jobs", value: activeCount, icon: ClipboardList },
      { label: "Unassigned queue", value: unassignedCount, icon: Inbox },
      { label: "Completed / closed", value: completedCount, icon: CheckCircle2 },
    ],
    [activeCount, unassignedCount, completedCount],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome */}
      <Card elevation="raised" className="p-6">
        <p className="font-display text-lg font-bold text-ink">
          Welcome, {user.first_name || user.username}
        </p>
        <p className="mt-1 text-sm text-text-soft">
          {user.email} · Staff / Service Provider
        </p>
      </Card>

      {/* Stats bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5 text-center">
            <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon size={15} aria-hidden="true" />
            </span>
            <div className="font-display text-2xl font-bold tabular-nums text-primary">
              {value ?? "—"}
            </div>
            <div className="mt-0.5 text-sm text-muted">{label}</div>
          </Card>
        ))}
      </div>

      {actionError && !modal && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertCircle size={16} className="mt-px shrink-0" aria-hidden="true" />
          {actionError}
        </p>
      )}

      {/* Queue */}
      <Card>
        {/* Tabs */}
        <div role="tablist" aria-label="Job queues" className="flex flex-wrap gap-1 border-b border-line p-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                "transition-colors duration-base ease-out",
                tab === id
                  ? "bg-primary-soft text-primary"
                  : "text-text-soft hover:bg-surface-3",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {isLoading ? (
            <ul className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-3 w-72" />
                  <Skeleton className="h-3 w-56" />
                </li>
              ))}
            </ul>
          ) : current.isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle size={22} className="text-danger" aria-hidden="true" />
              <p className="text-sm text-text-soft">{current.error.message}</p>
              <Button size="sm" variant="secondary" onClick={() => current.refetch()}>
                Try again
              </Button>
            </div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 size={22} className="text-success" aria-hidden="true" />
              <p className="text-sm text-text-soft">{active.empty}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {bookings.map((b) => (
                <JobCard
                  key={b.id}
                  booking={b}
                  isMine={tab !== "unassigned" && b.assigned_staff_id === user.id}
                  busy={pendingId === b.id}
                  onClaim={() => claimMutation.mutate(b.id)}
                  onTransition={(next) => openModal(b, next)}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      {modal && (
        <StatusModal
          booking={modal.booking}
          nextStatus={modal.next}
          pending={statusMutation.isPending}
          error={statusMutation.isError ? statusMutation.error.message : null}
          onClose={closeModal}
          onConfirm={(notes) =>
            statusMutation.mutate({
              id: modal.booking.id,
              status: modal.next,
              notes,
            })
          }
        />
      )}
    </div>
  );
}

export default function StaffDashboard() {
  return (
    <DashboardShell expectedRole="staff" title="Staff Dashboard">
      {(user) => <StaffCommandCenter user={user} />}
    </DashboardShell>
  );
}
