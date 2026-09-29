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
 * ── Why every mutation invalidates five keys ────────────────────────────────
 * Claiming or advancing a job changes what the *customer* sees (their
 * timeline), what this dashboard shows, what `/api/bookings/` returns, and
 * what the operator's audit feed shows. All are cached under separate keys, so
 * each mutation invalidates them together. Invalidating only the first is how
 * a technician ends up watching a stale queue while the customer's screen is
 * already up to date.
 *
 * ── Why a milestone is instant ───────────────────────────────────────────────
 * A refetch on its own is not an instant transition — it is a request, and the
 * technician is still looking at the old card while it is in flight. So every
 * stage change — `claim` included — is also applied to the cache the moment the
 * button is pressed (`onMutate`), and the refetch that follows is there to
 * *confirm* it rather than to produce it. The button therefore reads the next
 * stage's label the instant the confirmation closes, and the request that lands
 * a moment later is normally a no-op the technician never sees.
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
  postStaffBookingAction,
  type BookingDetail,
  type BookingStatus,
  type PaginatedResponse,
  type StaffBooking,
  type StaffBookingAction,
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
    // `claimed` is here because a booking whose status was advanced by a
    // colleague's dispatch that has since been unassigned still needs a
    // technician to finish driving it; the button reads "Claim" only for the
    // jobs that genuinely start the walk.
    statuses: ["pending", "claimed", "accepted", "arrived", "in_progress"],
    empty: "Queue is clear — every request has a technician.",
  },
  {
    id: "mine",
    label: "My jobs",
    icon: ClipboardList,
    assigned: "mine",
    statuses: ["pending", "claimed", "accepted", "arrived", "in_progress"],
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
 * The five dispatch stages, in the order they happen.
 *
 * This is the single place the button label for each stage is written down. The
 * lifecycle `pending → claimed → accepted → arrived → in_progress → completed`
 * is strictly sequential on the server (`Booking.LIFECYCLE`), so the next action
 * is a function of the current status and nothing else — one row per status,
 * read as a lookup, rather than a `switch` that has to be kept in step by hand.
 *
 * The keys are the four statuses a technician can *advance from*. `claim` is not
 * in this table because it is the one action that does not merely move the
 * status — it also takes the job — and it is the only one available to a booking
 * with no assignee, so it is decided first in `getNextAction`. A booking that is
 * assigned but still `pending` is deliberately absent: claiming sets the status
 * to `claimed`, so that combination cannot arise from the UI, and the server
 * would refuse to advance it from here anyway. It renders no button rather than
 * one that is guaranteed to 400.
 */
const STAGE_ACTIONS: Partial<Record<BookingStatus, {
  action: StaffBookingAction;
  label: string;
  icon: typeof PlayCircle;
}>> = {
  claimed: { action: "accept_job", label: "Accept Job", icon: UserCheck },
  accepted: { action: "reached_location", label: "Reached Location", icon: PlayCircle },
  arrived: { action: "start_work", label: "Start Task", icon: PlayCircle },
  in_progress: { action: "complete_work", label: "Complete Task", icon: CheckCircle2 },
};

function getNextAction(
  booking: StaffBooking,
  actorId: number,
): { action: StaffBookingAction; label: string; icon: typeof PlayCircle } | null {
  // Unclaimed jobs are claimable, and claiming is what puts them on the
  // lifecycle in the first place. A job that is already assigned is someone
  // else's; the desk shows it read-only.
  if (booking.assigned_staff_id === null) {
    return booking.status === "pending"
      ? { action: "claim", label: "Claim Job", icon: UserCheck }
      : null;
  }

  if (booking.assigned_staff_id !== actorId) return null;

  // A status outside the table — terminal, or one from a newer server than this
  // bundle — renders no button at all, never a guessed one.
  return STAGE_ACTIONS[booking.status] ?? null;
}

/**
 * Whether a booking belongs in a tab's list, mirroring what the server filters
 * on.
 *
 * The optimistic patch in `StaffCommandCenter` has to apply the *same* rule the
 * refetch that follows it will, or a row lands in a tab the refetch then strips
 * it from — which reads to a technician as the UI flickering back to a state
 * they have already left.
 */
function tabMatches(tab: TabDef, booking: StaffBooking, actorId: number): boolean {
  if (tab.assigned === "unassigned" && booking.assigned_staff_id !== null) return false;
  if (tab.assigned === "mine" && booking.assigned_staff_id !== actorId) return false;
  return !tab.statuses || tab.statuses.includes(booking.status);
}

/**
 * Where each action lands, for the optimistic patch.
 *
 * `claim` is in here. It used to be the one action with no predicted status,
 * on the reasoning that claiming only moves the assignee and therefore only
 * *removes* a row from a list — and a row vanishing under the technician's
 * cursor is a bad thing to guess at. But claiming a job now enters the
 * `claimed` milestone, so its visible effect is a move between two queues at
 * once, and both halves of that move are predictable: the row leaves Unassigned
 * and appears under My jobs. Doing it optimistically is what makes the desk feel
 * instant; a wrong guess is corrected by `onError`, which invalidates rather
 * than patching back, so the worst case is one refetch and no data left behind.
 */
const NEXT_STATUS: Record<StaffBookingAction, BookingStatus> = {
  claim: "claimed",
  accept_job: "accepted",
  reached_location: "arrived",
  start_work: "in_progress",
  complete_work: "completed",
};

/* ── Status modal ───────────────────────────────────────────────────────────── */

/**
 * Confirmation dialog for one milestone progression (all except "claim").
 *
 * Notes are optional on the wire but the modal makes them easy to type,
 * because a bare flip reaches the customer as a generic timeline entry. The
 * `action`/`booking` pairing is deliberate: a modal that outlives the tab it was
 * opened from must not be able to fire against a different booking. The server
 * prefixes the stage's fixed description to whatever is typed here, so the
 * milestone is named even when the technician writes nothing.
 */
function StatusModal({
  booking,
  action,
  heading,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  booking: StaffBooking;
  action: StaffBookingAction;
  heading: string;
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
              {heading}
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
  actorId,
  onClaim,
  onTransition,
}: {
  booking: StaffBooking;
  isMine: boolean;
  busy: boolean;
  actorId: number;
  onClaim: () => void;
  onTransition: (action: StaffBookingAction, label: string) => void;
}) {
  const next = getNextAction(booking, actorId);

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
          {next && (
            <Button
              size="sm"
              variant={next.action === "complete_work" ? "accent" : "primary"}
              onClick={() => {
                if (next.action === "claim") onClaim();
                else onTransition(next.action, next.label);
              }}
              disabled={busy}
              leadingIcon={<next.icon size={14} />}
            >
              {next.label}
            </Button>
          )}
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
  const [modal, setModal] = useState<{ booking: StaffBooking; action: StaffBookingAction; heading: string } | null>(null);
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
   * Every mutation fans out to all four caches.
   *
   * `booking` (singular) is the key `/bookings/[id]` caches its
   * `BookingDetail` under. It is included because that payload carries
   * `status_history`: without this a customer sitting on the booking page
   * would keep seeing the pre-transition trail until a manual refresh.
   *
   * `refetchType: "all"` is load-bearing, not decoration. TanStack's default
   * is `"active"` — only queries with a live observer refetch — so a
   * customer's booking tab in *another* window is marked stale and then left
   * alone. If its entry is later garbage-collected (it has no observer, so it
   * is the first thing the GC reclaims) the tab remounts and refetches, and
   * any window where that request is slow or fails leaves the pre-transition
   * `in_progress` on screen. The reported symptom — a job marked completed
   * still showing "In progress" to the customer — is this. `"all"` refetches
   * inactive entries too, so the fix is to ask, not to hope the GC keeps them.
   *
   * The prefix `["booking"]` also covers `["admin", "bookings", page]`'s
   * sibling list at `["bookings", page]`, but not the admin audit view's own
   * key — hence the fourth entry.
   */
  const invalidateAll = async (id: number) => {
    // Staff first and awaited: this is the cache the technician is looking at.
    // Draining its refetch before the modal closes is what makes the row
    // already show its next button when the dialog goes away, instead of
    // leaving a `pendingId` that the refetch is about to clear anyway.
    await queryClient.invalidateQueries({
      queryKey: ["staff-bookings"],
      refetchType: "all",
    });
    await queryClient.invalidateQueries({ queryKey: ["booking", id], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: ["bookings"], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: ["booking"], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: ["admin", "bookings"], refetchType: "all" });
  };

  /**
   * One mutation for all five stages, `claim` included.
   *
   * The server enforces the ordering, so the client does not need a second
   * code path for "claim" — it is the same POST with a different name, and
   * routing it through the shared endpoint means the ordering rules the UI
   * relies on are the same ones the API enforces. Claim is the one action
   * fired without the modal, because it takes no note and is reversible by
   * simply picking a different job.
   */
  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
      notes,
    }: {
      id: number;
      action: StaffBookingAction;
      notes?: string;
    }) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return postStaffBookingAction(id, { action, notes }, token);
    },
    onMutate: ({ id, action }) => {
      setActionError(null);
      setPendingId(id);

      // ── Optimistic patch ──────────────────────────────────────────────────
      // What the technician is about to be looking at: this job, carrying the
      // status the server is about to confirm, sitting in whichever queue that
      // status now belongs to. It carries forward the fields the response does
      // not have (email, phone) so the card renders identically to its
      // neighbours instead of blanking them.
      const current = bookings.find((b) => b.id === id);
      // Not in this tab's rendered list — nothing to predict from. This happens
      // when a mutation outlives a tab switch; the invalidation that follows
      // still reconciles every queue.
      if (!current) return;

      // `claim` moves the job *between* queues, so the predicted row has to
      // carry the new assignee as well as the new status, or `tabMatches` would
      // place it in neither list and the job would disappear from the desk
      // until the refetch. `assigned_staff_name` comes from the signed-in user
      // rather than the response so the card reads correctly on this frame.
      const predicted: StaffBooking = {
        ...current,
        status: NEXT_STATUS[action],
        ...(action === "claim"
          ? {
              assigned_staff_id: user.id,
              assigned_staff_name: [user.first_name, user.last_name]
                .filter(Boolean)
                .join(" ") || user.username,
            }
          : {}),
      };

      // Applied to every queue, not just the one on screen, because a row
      // that belongs in a list you have never opened still changes the count
      // that list's stat tile shows — and the tile is rendered from the cached
      // `count` of a query that never mounted.
      TABS.forEach((t) => {
        const key = ["staff-bookings", t.id] as const;
        queryClient.setQueryData<PaginatedResponse<StaffBooking>>(key, (cached) => {
          if (!cached) return cached;

          const patch = (b: StaffBooking) => (b.id === id ? { ...b, ...predicted } : b);
          const inFrom = (cached.results ?? []).some((b) => b.id === id);
          const inTo = tabMatches(t, predicted, user.id);
          const next = inFrom
            ? inTo
              ? cached.results.map(patch)
              : cached.results.filter((b) => b.id !== id)
            : inTo
              ? [...cached.results, predicted]
              : cached.results;

          // The row moved between queues, so the `count` on both sides has to
          // move with it. Derived from the patched list rather than nudged,
          // so one expression cannot disagree with the rows above it.
          const count = cached.count + next.length - cached.results.length;
          return { ...cached, results: next, count: Math.max(0, count) };
        });
      });
    },
    // Synchronous rollback *and* a refetch. `onError` does not invalidate on
    // its own, and the optimistic patch has already moved the row, so without
    // this the queue would keep showing a status the server just refused.
    onError: (err, { id }) => {
      setActionError(err.message);
      void queryClient.invalidateQueries({
        queryKey: ["staff-bookings"],
        refetchType: "all",
      });
      void queryClient.invalidateQueries({ queryKey: ["booking", id], refetchType: "all" });
    },
    onSuccess: async (updated, { id, action }) => {
      // Seed the server's answer before invalidating, so a concurrent refetch
      // cannot land an older body on top of it. Invalidation only marks a
      // query stale; whatever is already in the cache is what renders in the
      // meantime, and that should be the server's answer, not the previous
      // status. This is the last line of defence against a completed job
      // reappearing as in-progress on the customer's screen.
      //
      // Only the status is copied across, and only when the cache entry
      // exists. The action endpoint returns the *staff* view of the
      // booking, which carries the customer's phone and email — more than
      // the customer-facing page needs and more than it had before. Merging
      // just the status keeps the entry exactly as complete as it was, so
      // the customer's timeline and history survive a technician's action
      // instead of being replaced by a differently-shaped body.
      //
      // `claim` is included: it enters the `claimed` milestone like every other
      // stage, so the customer's stepper needs the same correction.
      if (updated.status) {
        queryClient.setQueryData<BookingDetail>(["booking", id], (cached) =>
          cached ? { ...cached, status: updated.status } : cached,
        );
      }

      // The modal and the spinner come down only once the refetch has landed,
      // so the row underneath is already showing its next action. Awaiting
      // first is the whole point: the previous version fired-and-forgot, so
      // the technician watched a stale card sit there while the request
      // completed. The async callbacks are not awaited by TanStack, which is
      // fine — nothing downstream depends on this returning.
      await invalidateAll(id);

      // `claim` also moves the row between two queues, so the server's answer
      // is the authority on where it landed. The optimistic pass already put it
      // there; this awaits the refetch that confirms it before the modal state
      // is torn down, so the technician never sees the card hop.
      if (action === "claim" && updated.assigned_staff_id) {
        queryClient.setQueryData<BookingDetail>(["booking", id], (cached) =>
          cached ? { ...cached, status: updated.status } : cached,
        );
      }

      setModal(null);
      setPendingId(null);
    },
  });

  const claimJob = (booking: StaffBooking) => {
    actionMutation.mutate({ id: booking.id, action: "claim" });
  };

  const openModal = (
    booking: StaffBooking,
    action: StaffBookingAction,
    heading: string,
  ) => {
    setActionError(null);
    setPendingId(booking.id);
    setModal({ booking, action, heading });
  };

  const closeModal = () => {
    if (actionMutation.isPending) return;
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
                  isMine={b.assigned_staff_id === user.id}
                  busy={pendingId === b.id}
                  actorId={user.id}
                  onClaim={() => claimJob(b)}
                  onTransition={(action, heading) => openModal(b, action, heading)}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>

      {modal && (
        <StatusModal
          booking={modal.booking}
          action={modal.action}
          heading={modal.heading}
          pending={actionMutation.isPending}
          error={actionMutation.isError ? actionMutation.error.message : null}
          onClose={closeModal}
          onConfirm={(notes) =>
            actionMutation.mutate({
              id: modal.booking.id,
              action: modal.action,
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
