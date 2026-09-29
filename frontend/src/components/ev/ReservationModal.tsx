"use client";

/**
 * Bay reservation dialog for one EV charging station.
 *
 * ── The slot-time contract ───────────────────────────────────────────────────
 * The server publishes a `slot_grid` of 30-minute windows and *rejects* any
 * `slot_time` that does not land exactly on a published `start` — it will not
 * snap a request to the nearest window. So this component never invents a
 * time: it turns the `"HH:MM:SS"` string the grid published into an ISO instant
 * on the grid's own date, and sends that back verbatim. Picking 14:00 means
 * 14:00, and if the grid is stale the server says so rather than quietly
 * booking 14:30.
 *
 * ── Auth gating ──────────────────────────────────────────────────────────────
 * Three states, not two. While the session is still resolving the action is
 * disabled rather than shown as "Sign in" — otherwise a signed-in driver sees
 * the guest CTA flash on every page load. Only a settled guest is offered the
 * login/signup links, and both carry `?redirect=` back to `/ev` so a
 * registration started from here returns to the map.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { X, Zap, CalendarClock, Car, CheckCircle2, AlertCircle } from "lucide-react";

import {
  createEvBooking,
  fetchEvStationDetail,
  type EvStation,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { formatSlotTime } from "@/lib/booking-ui";
import { loginHref, signupHref, useSession } from "@/lib/session";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

/** Default energy estimate — a ~30 kWh top-up, i.e. roughly 120 km. */
const DEFAULT_KWH = 30;

interface ReservationModalProps {
  station: EvStation;
  onClose: () => void;
  onReserved: () => void;
}

/**
 * Combines a grid date with a published `"HH:MM:SS"` wall-clock time and
 * returns a local ISO instant the server will accept.
 *
 * The grid spans more than one calendar day but publishes only times, so the
 * date has to come from the position of the slot in the sequence: the first
 * slot belongs to today, and the sequence rolls over to tomorrow at the first
 * slot whose time is earlier than the one before it. That is the same
 * midnight boundary the server used to build the grid.
 */
function slotToIso(slotStart: string, isoDate: string): string {
  const [h, m, s] = slotStart.split(":").map((n) => parseInt(n, 10) || 0);
  const d = new Date(`${isoDate}T00:00:00`);
  d.setHours(h, m, s, 0);
  return d.toISOString();
}

/** Part-of-day buckets a window can fall into, in the order they are rendered. */
const DAY_PARTS = [
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening", label: "Evening" },
] as const;

type DayPart = (typeof DAY_PARTS)[number]["id"];

interface SlotChip {
  /** Local ISO instant, sent verbatim as `slot_time` once chosen. */
  iso: string;
  /** The grid's own `"HH:MM:SS"` wall clock — what the chip is labelled with. */
  start: string;
  available: boolean;
  ports: number;
}

/**
 * Which bucket a `"HH:MM:SS"` wall clock belongs to.
 *
 * Boundaries are on the hour rather than on the "12/17" convention because a
 * charging station's day is framed by its own peak hours: the 12:00–17:00
 * window is exactly the stretch an operator would call the afternoon build-up,
 * and splitting it further would produce a group too short to read as one.
 */
function partOfDay(start: string): DayPart {
  const hour = Number(start.slice(0, 2));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function ReservationModal({
  station,
  onClose,
  onReserved,
}: ReservationModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useSession();
  const panelRef = useRef<HTMLDivElement>(null);

  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [kwh, setKwh] = useState<string>(String(DEFAULT_KWH));
  const [notes, setNotes] = useState("");
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reserved, setReserved] = useState<{ id: number; slotIso: string } | null>(null);

  // Escape closes, Tab is trapped. A dialog that leaks focus back to the page
  // behind it is worse than no dialog, because the keyboard user is now lost.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while a dialog is up.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const detail = useQuery({
    queryKey: ["ev-station", station.id],
    queryFn: () => fetchEvStationDetail(station.id),
    // The grid is a function of wall-clock time: a window that is free now
    // may be gone in five minutes, so it is never served from cache.
    staleTime: 0,
    gcTime: 5 * 60_000,
  });

  /**
   * Slots grouped by calendar day, then by part of day, so the picker reads as
   * "Today → Morning → 09:00 AM" rather than as 48 undifferentiated times.
   *
   * The grid publishes wall-clock times only, so the date is recovered from the
   * sequence itself: the first window belongs to today, and every time the
   * clock goes *backwards* in the list the grid has crossed midnight. That is
   * exactly the boundary the server used when it built the grid, so the two
   * agree without either side having to publish a date.
   *
   * The order matters and is not interchangeable: part-of-day is nested
   * *inside* the day, never the reverse. `09:00` legitimately appears twice in
   * a 24-hour grid, and the midnight detection above is the only thing that
   * tells the two copies apart. Group by part of day first and that signal is
   * gone — the two `09:00` chips would collide into one group and one of them
   * would become unselectable.
   */
  const slotsByDay = useMemo(() => {
    const slots = detail.data?.slot_grid.slots ?? [];
    if (slots.length === 0) return [];

    const groups: {
      isoDate: string;
      label: string;
      parts: { id: DayPart; label: string; slots: SlotChip[] }[];
    }[] = [];
    let previousMinutes: number | null = null;
    let current: (typeof groups)[number] | null = null;

    for (const slot of slots) {
      const [h, m] = slot.start.split(":").map((n) => parseInt(n, 10) || 0);
      const minutes = h * 60 + m;

      // Time going backwards means the grid has crossed midnight.
      if (current === null || (previousMinutes !== null && minutes < previousMinutes)) {
        const dayOffset = groups.length;
        const day = new Date();
        day.setDate(day.getDate() + dayOffset);
        const isoDate = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

        current = {
          isoDate,
          label:
            dayOffset === 0
              ? "Today"
              : dayOffset === 1
                ? "Tomorrow"
                : day.toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }),
          parts: [],
        };
        groups.push(current);
      }
      previousMinutes = minutes;

      const partId = partOfDay(slot.start);
      let part = current.parts.find((p) => p.id === partId);
      if (!part) {
        part = { id: partId, label: DAY_PARTS.find((p) => p.id === partId)!.label, slots: [] };
        // Slots arrive in chronological order, which is already the DAY_PARTS
        // order — so appending keeps the buckets in morning→evening sequence
        // without a second sort.
        current.parts.push(part);
      }

      part.slots.push({
        iso: slotToIso(slot.start, current.isoDate),
        start: slot.start,
        available: slot.is_available,
        ports: slot.available_ports,
      });
    }

    return groups;
  }, [detail.data]);

  // Preselect the first bookable window so a driver who just wants the next
  // free bay only has to confirm.
  useEffect(() => {
    if (slotIso) return;
    const first = slotsByDay
      .flatMap((g) => g.parts)
      .flatMap((p) => p.slots)
      .find((s) => s.available);
    if (first) setSlotIso(first.iso);
  }, [slotsByDay, slotIso]);

  const mutation = useMutation({
    mutationFn: async (payload: {
      slotTime: string;
      vehicle: string;
      kwh: string;
      notes: string;
    }) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return createEvBooking(
        {
          station_id: station.id,
          slot_time: payload.slotTime,
          vehicle_number: payload.vehicle,
          estimated_kwh: Number(payload.kwh) || DEFAULT_KWH,
          notes: payload.notes || undefined,
        },
        token,
      );
    },
    onSuccess: (booking) => {
      setReserved({ id: booking.id, slotIso: booking.start_at });
      // A reservation moves a bay, so both the list and the map's pin colours
      // are now stale. Invalidate rather than patch — the server is the
      // authority on what is free.
      queryClient.invalidateQueries({ queryKey: ["ev-stations"] });
      queryClient.invalidateQueries({ queryKey: ["ev-bookings"] });
      onReserved();
    },
    onError: (error) => setSubmitError(error instanceof Error ? error.message : "Something went wrong."),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setVehicleError(null);

    const plate = vehicleNumber.trim().toUpperCase();
    if (plate.length < 2) {
      setVehicleError("Enter your registration, e.g. KA05AB1234.");
      return;
    }
    if (!slotIso) {
      setSubmitError("Pick a charging window first.");
      return;
    }
    mutation.mutate({ slotTime: slotIso, vehicle: plate, kwh, notes });
  };

  const selected = useMemo(
    () =>
      slotsByDay
        .flatMap((g) => g.parts)
        .flatMap((p) => p.slots)
        .find((s) => s.iso === slotIso) ?? null,
    [slotsByDay, slotIso],
  );
  const estimate = (Number(kwh) || 0) * station.price_per_kwh;

  const isGuest = status === "guest";
  const isAuthed = status === "authed";
  const isResolving = status === "loading";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-title"
      onMouseDown={(e) => {
        // Clicking the scrim closes; clicking the panel must not bubble up.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-line bg-surface shadow-lg sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-energy">
              <Zap size={13} aria-hidden="true" />
              Reserve a bay
            </p>
            <h2 id="reserve-title" className="mt-1 font-display text-lg font-bold text-ink">
              {station.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {station.city} · {station.charging_speed_kw} kW ·{" "}
              <span className="font-mono">{station.price_display}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-muted transition-colors duration-base ease-out hover:bg-surface-3 hover:text-ink"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {reserved ? (
          /* ── Confirmation ─────────────────────────────────────────────── */
          <div className="p-6 text-center">
            <CheckCircle2
              size={40}
              className="mx-auto text-success"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-display text-lg font-bold text-ink">
              Bay reserved
            </h3>
            <p className="mt-1.5 text-sm text-text-soft">
              {formatSlotTime(reserved.slotIso)} at {station.name}. Reference #
              {reserved.id}.
            </p>
            <p className="mt-1 text-sm text-text-soft">
              Your bay is held for {vehicleNumber.trim().toUpperCase()}.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={onClose} variant="secondary">
                Keep exploring
              </Button>
              <Button onClick={() => router.push("/dashboard/customer")}>
                View my bookings
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="space-y-5 p-5">
              {/* Auth gate. Rendered before the form so a guest never fills in
                  a plate only to be told at submit time that they cannot book. */}
              {isGuest && (
                <div className="rounded-md border border-line bg-surface-2 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <Car size={15} aria-hidden="true" />
                    Sign in to reserve
                  </p>
                  <p className="mt-1 text-xs text-text-soft">
                    Reservations are tied to your account so you can cancel or
                    amend them from your dashboard.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <ButtonLink
                      href={loginHref("/ev")}
                      variant="primary"
                      size="sm"
                      className="sm:flex-1"
                    >
                      Sign in
                    </ButtonLink>
                    <ButtonLink
                      href={signupHref("/ev")}
                      variant="secondary"
                      size="sm"
                      className="sm:flex-1"
                    >
                      Create account
                    </ButtonLink>
                  </div>
                </div>
              )}

              {/* Slot picker */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide text-text-soft">
                  <CalendarClock size={13} aria-hidden="true" />
                  Charging window
                </p>

                {detail.isPending ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-16 rounded-md" />
                    ))}
                  </div>
                ) : detail.isError ? (
                  <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                    Could not load availability.{" "}
                    <button
                      type="button"
                      onClick={() => detail.refetch()}
                      className="underline underline-offset-2"
                    >
                      Retry
                    </button>
                  </p>
                ) : slotsByDay.length === 0 ? (
                  <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
                    No bookable windows in the next{" "}
                    {detail.data?.slot_grid.horizon_hours ?? 24} hours.
                  </p>
                ) : (
                  slotsByDay.map((group) => (
                    <div key={group.isoDate} className="mb-4 last:mb-0">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink">
                        {group.label}
                      </p>
                      {group.parts.map((part) => (
                        <div key={part.id} className="mb-2 last:mb-0">
                          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted">
                            {part.label}
                          </p>
                          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                            {part.slots.map((slot) => {
                              const active = slot.iso === slotIso;
                              return (
                                <button
                                  key={slot.iso}
                                  type="button"
                                  disabled={!slot.available || !isAuthed || isResolving}
                                  aria-pressed={active}
                                  onClick={() => setSlotIso(slot.iso)}
                                  title={
                                    slot.available
                                      ? `${formatSlotTime(slot.start)} · ${slot.ports} bay${slot.ports === 1 ? "" : "s"} free`
                                      : `${formatSlotTime(slot.start)} · fully booked`
                                  }
                                  className={cn(
                                    "flex flex-col items-center justify-center rounded-md border px-1.5 py-1.5",
                                    "transition-[background-color,border-color,color] duration-base ease-out",
                                    !slot.available &&
                                      "cursor-not-allowed border-line bg-surface-2 text-muted",
                                    slot.available &&
                                      !active &&
                                      "border-line bg-surface text-text-soft hover:border-primary/40 hover:text-primary",
                                    active &&
                                      "border-primary bg-primary text-on-primary",
                                  )}
                                >
                                  <span className="font-mono text-xs font-semibold">
                                    {formatSlotTime(slot.start)}
                                  </span>
                                  <span
                                    className={cn(
                                      "mt-0.5 text-[10px] leading-tight",
                                      active
                                        ? "text-on-primary/80"
                                        : slot.available
                                          ? "text-muted"
                                          : "text-muted",
                                    )}
                                  >
                                    {slot.available
                                      ? `${slot.ports} free`
                                      : "Full"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>

              {/* Vehicle + energy */}
              <Input
                id="vehicle-number"
                label="Vehicle registration"
                placeholder="KA05AB1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                error={vehicleError ?? undefined}
                hint="The bay is held against this plate on arrival."
                maxLength={32}
                autoComplete="off"
                disabled={isGuest || isResolving}
                leadingIcon={<Car size={15} />}
              />

              <Input
                id="estimated-kwh"
                label="Energy needed (kWh)"
                type="number"
                min={1}
                max={500}
                step="0.5"
                value={kwh}
                onChange={(e) => setKwh(e.target.value)}
                hint={
                  estimate > 0 ? (
                    <>
                      About{" "}
                      <span className="font-mono font-semibold text-ink">
                        ₹{estimate.toFixed(2)}
                      </span>{" "}
                      at this station&apos;s rate.
                    </>
                  ) : (
                    "A 30 kWh top-up is roughly 120 km of range."
                  )
                }
                disabled={isGuest || isResolving}
              />

              <Textarea
                id="reserve-notes"
                label="Notes (optional)"
                placeholder="Arriving with a trailer, need a CCS2 gun, …"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                disabled={isGuest || isResolving}
              />

              {submitError && (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
                >
                  <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
                  {submitError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">
                {isResolving
                  ? "Checking your session…"
                  : isGuest
                    ? "Sign in to continue"
                    : selected
                      ? `${formatSlotTime(selected.start)} · ${selected.ports} bay${selected.ports === 1 ? "" : "s"} free`
                      : "No window selected"}
              </p>
              <Button
                type="submit"
                loading={mutation.isPending}
                disabled={!isAuthed || isResolving || !slotIso}
                className="sm:min-w-40"
              >
                {isResolving ? "Checking…" : "Confirm reservation"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
