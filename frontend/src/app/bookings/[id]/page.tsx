"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  MessageSquare,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { motion } from "framer-motion";

import { MotionPage } from "@/components/motion";
import {
  FeedbackModal,
  RATING_CAPTION,
  StarRating,
  StarRatingReadonly,
} from "@/components/FeedbackModal";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  cancelBooking,
  getBooking,
  submitFeedback,
  type BookingDetail,
  type BookingStatusHistory,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import {
  BOOKING_TIMELINE as TIMELINE,
  STATUS_TONE,
  canCancelBooking,
  formatBookingDate as formatDate,
  formatBookingTime as formatTime,
  formatPrice as formatPriceValue,
  formatTimestamp,
  isCompletedStatus,
  normalizeStatus,
  statusIndex,
  timelinePercent,
} from "@/lib/booking-ui";
import { loginHref } from "@/lib/session";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

function HistoryRow({ entry }: { entry: BookingStatusHistory }) {
  const from = entry.previous_status
    ? entry.previous_status.replace(/_/g, " ")
    : null;
  const to = entry.new_status.replace(/_/g, " ");
  return (
    <li className="relative pl-7">
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary"
      />
      <p className="text-sm font-medium capitalize text-ink">
        {from ? `${from} → ` : ""}
        {to}
      </p>
      {entry.notes && <p className="mt-0.5 text-sm text-text-soft">{entry.notes}</p>}
      <p className="mt-1 text-xs text-muted">
        {formatTimestamp(entry.created_at)}
        {entry.changed_by_name && ` · ${entry.changed_by_name}`}
      </p>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <Container className="py-12">
      <div role="status" aria-label="Loading booking" className="flex flex-col gap-6">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-8 w-1/2" />
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </Container>
  );
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: booking,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<BookingDetail, Error>({
    queryKey: ["booking", id],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) {
        router.replace(loginHref(`/bookings/${id}`));
        throw new Error("unauthenticated");
      }
      return getBooking(id, token);
    },
    enabled: Number.isInteger(id) && id > 0,
    retry: false,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      setActionError(null);
      const token = await getValidAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return cancelBooking(id, token);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["booking", id], updated);
      // The dashboard list is now stale — refetch it when the user returns.
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      setConfirmOpen(false);
    },
  });

  /**
   * The inline "Rate & Review Service" submission.
   *
   * Kept separate from `FeedbackModal`'s own mutation even though both post the
   * same body: the modal is an overlay the customer can dismiss, this is a
   * card that stays on the page, and sharing one mutation would mean a
   * successful submit in the modal left the inline form's star row still
   * holding a rating that is no longer changeable. Its success state is
   * read straight off the refetched `booking.feedback`, so the card and the
   * header badge can never disagree about whether the review landed.
   */
  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [ratingTouched, setRatingTouched] = useState(false);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      return submitFeedback(id, { rating, comment: reviewComment.trim() }, token);
    },
    onSuccess: () => {
      // The booking payload carries the review's presence, so it has to be
      // re-read or the "Rate" affordance stays on screen for a booking that can
      // no longer be rated. The customer's list and the admin's review feed
      // both render the review too.
      void queryClient.invalidateQueries({ queryKey: ["booking", id] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "feedback"] });
    },
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError || !booking) {
    return (
      <Container className="py-24">
        <Card className="mx-auto flex max-w-md flex-col items-center gap-3 px-8 py-14 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted">
            <AlertCircle size={19} aria-hidden="true" />
          </span>
          <p className="font-display text-lg font-bold text-ink">
            {error?.message === "unauthenticated"
              ? "Sign in to view this booking"
              : "Booking not found"}
          </p>
          <p className="text-sm text-text-soft">
            {error?.message === "unauthenticated"
              ? "Sign in to view this booking."
              : "This booking may have been removed, or it belongs to another account."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {/* A failed *background* refetch must be recoverable by hand. A
                technician can mark a job completed while this tab sits idle;
                the refetch that would have told us fails on a flaky
                connection, and without this button the customer's only
                option is a full reload. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                router.replace(`/bookings/${id}`);
              }}
              leadingIcon={<RefreshCw size={14} aria-hidden="true" />}
            >
              Try again
            </Button>
            <ButtonLink href="/dashboard/customer" variant="ghost" size="sm">
              Back to dashboard
            </ButtonLink>
          </div>
        </Card>
      </Container>
    );
  }

  const priceLabel = formatPriceValue(booking.service_price);

  /**
   * Every status read on this page goes through `normalizeStatus` first.
   *
   * This booking can be sitting in a cache entry written before a technician
   * marked it complete, and the page may render once before its refetch
   * settles. Normalising at the point of use means the timeline cannot
   * misread a value that is merely formatted differently — and, more to the
   * point, `statusIndex` resolves against each step's `statuses` set, so an
   * unrecognised value paints "not yet done" instead of silently un-doing a
   * finished job.
   */
  const status = normalizeStatus(booking.status);

  const isCancelled = status === "cancelled";
  const isCompleted = isCompletedStatus(booking.status);
  const canCancel = status !== null && canCancelBooking(status);
  const currentIndex = statusIndex(booking.status);
  const percent = timelinePercent(booking.status);

  /**
   * The set of milestones the API's audit trail has actually recorded.
   *
   * The stepper's own `currentIndex` is the authority on where the job is *now*
   * — it is derived from the live status, which is what the customer asked
   * about. The trail is the authority on what has *been* done, and the two can
   * legitimately disagree: an admin correcting a status by hand leaves a row
   * that says a later milestone was reached, and a status written by a data
   * import may have no row at all. Lighting a step on the union of the two
   * means the trail can add detail but can never blank out a step the live
   * status already proved.
   */
  const reached = new Set(booking.status_history.map((e) => normalizeStatus(e.new_status)));

  /**
   * The badge tone is looked up through a checked index rather than
   * `STATUS_TONE[booking.status]` directly, because a status this client
   * does not recognise has no entry in the map and would render
   * `undefined` as a tone.
   */
  const tone = status ? STATUS_TONE[status] : "neutral";
  const label = isCompleted
    ? "Completed"
    : booking.status_display || status || "Unknown";

  return (
    <MotionPage>
      <Container className="py-8 sm:py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm">
          <Link
            href="/dashboard/customer"
            className="text-text-soft transition-colors duration-base ease-out hover:text-primary"
          >
            My bookings
          </Link>
          <ChevronRight size={13} className="text-line-strong" aria-hidden="true" />
          <span className="font-medium text-ink">Booking #{booking.id}</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
              Booking #{booking.id}
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight text-ink">
              {booking.service_name}
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Requested {formatTimestamp(booking.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
            <Badge tone={tone} size="md" dot>
              {label}
            </Badge>
            {canCancel && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                Cancel booking
              </Button>
            )}
            {isCompleted &&
              (booking.feedback ? (
                // Already rated. Offering the button again would send the
                // customer into a form whose submit the server rejects as a
                // duplicate, so the saved rating is shown read-only instead.
                <div className="flex items-center gap-2">
                  <StarRatingReadonly value={booking.feedback.rating} />
                  <span className="text-xs text-muted">Your review</span>
                </div>
              ) : (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setFeedbackOpen(true)}
                >
                  Rate &amp; review service
                </Button>
              ))}
          </div>
        </div>

        {actionError && (
          <div
            className="mt-6 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
            role="alert"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
          {/* Main column */}
          <div className="min-w-0">
            {/* Status timeline */}
            <Card className="p-6">
              <h2 className="font-display text-base font-bold text-ink">Status</h2>
              {isCancelled ? (
                <div className="mt-4 flex items-start gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3.5">
                  <X size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-danger">
                      This booking was cancelled
                    </p>
                    <p className="mt-0.5 text-sm text-text-soft">
                      The cancellation is recorded in the history below.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Completion banner.
                      A finished job gets an explicit, unmissable statement of
                      that fact. The stepper below already renders every node
                      filled, but a customer scanning the page for "is my job
                      done?" should not have to read a five-step list to answer
                      it — and the bar gives the 100% figure a place to live
                      that is legible at a glance. */}
                  {isCompleted && (
                    <div
                      role="status"
                      className="mt-4 flex items-start gap-3 rounded-md border border-success/30 bg-success-soft px-4 py-3.5"
                    >
                      <CheckCircle2
                        size={16}
                        className="mt-0.5 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-success">
                          Completed — this job is done
                        </p>
                        <p className="mt-0.5 text-sm text-text-soft">
                          The technician marked it finished. Full breakdown in
                          the history below.
                        </p>
                        <div className="mt-3 flex items-center gap-3">
                          <div
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Booking progress"
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"
                          >
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              transition={{ duration: 0.5, ease: EASE_OUT }}
                              className="h-full rounded-full bg-success"
                            />
                          </div>
                          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-success">
                            {percent}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <ol className={cn(isCompleted && "mt-6")}>
                    {TIMELINE.map((step, i) => {
                      // A step lights on the *status* it stands for. The index
                      // alone would misread the two-status step: `accepted`
                      // resolves to index 1, so a job sitting on `claimed`
                      // would render the same two filled nodes as a job the
                      // technician has already accepted, with nothing
                      // distinguishing them. Matching the set also keeps the
                      // customer from seeing step 2 dim while their technician
                      // has already picked the job up.
                      const done =
                        i <= currentIndex || step.statuses.some((s) => reached.has(s));
                      const active = i === currentIndex;
                      return (
                        <li key={step.status} className="relative flex gap-4 pb-6 last:pb-0">
                          {/* Connector */}
                          {i < TIMELINE.length - 1 && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                "absolute left-[11px] top-6 h-full w-0.5",
                                i < currentIndex
                                  ? isCompleted
                                    ? "bg-success"
                                    : "bg-primary"
                                  : "bg-line",
                              )}
                            />
                          )}
                          {/* Node */}
                          <motion.span
                            aria-hidden="true"
                            initial={false}
                            animate={done ? { scale: 1 } : { scale: 0.85 }}
                            transition={{ duration: 0.3, ease: EASE_OUT }}
                            className={cn(
                              "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                              done
                                ? isCompleted
                                  ? "border-success bg-success text-white"
                                  : "border-primary bg-primary text-on-primary"
                                : "border-line bg-surface text-muted",
                              active && !isCompleted && "ring-4 ring-primary/20",
                            )}
                          >
                            {done ? (
                              <Check size={12} strokeWidth={3} />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                            )}
                          </motion.span>
                          {/* Label */}
                          <div className="-mt-0.5 min-w-0 pt-0.5">
                            <p
                              className={cn(
                                "text-sm font-semibold",
                                done ? "text-ink" : "text-muted",
                              )}
                            >
                              {step.label}
                              {active && (
                                <span
                                  className={cn(
                                    "ml-2 text-xs font-medium",
                                    isCompleted ? "text-success" : "text-primary",
                                  )}
                                >
                                  {isCompleted ? "Finished" : "Current"}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-sm text-muted">{step.blurb}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </Card>

            {/* Rating trigger. Gated on `completed` alone — a review is only
                meaningful about work that finished, and `feedback.serializers`
                enforces the same rule, so offering the form at any other
                status could only ever produce a 400. It sits directly under
                the stepper because that is where a customer lands after
                watching the last node fill, and it is the one thing they are
                newly able to do. */}
            {isCompleted && (
              <Card
                elevation="raised"
                className="mt-6 border-accent/30 p-6"
                aria-labelledby="rate-review-title"
              >
                {booking.feedback ? (
                  // Already reviewed. The server holds one review per booking,
                  // so re-opening the form would submit a duplicate the API
                  // rejects. The saved review is shown instead — the state is
                  // read from the payload, not from a local flag, so it
                  // survives a reload and cannot be lost by a refetch.
                  <div className="flex flex-col items-start gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <CheckCircle2 size={17} aria-hidden="true" />
                      </span>
                      <h2
                        id="rate-review-title"
                        className="font-display text-base font-bold text-ink"
                      >
                        Thanks for your review
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarRatingReadonly value={booking.feedback.rating} />
                      <span className="text-sm text-text-soft">
                        {booking.feedback.rating} out of 5
                      </span>
                    </div>
                    {booking.feedback.comment && (
                      <p className="w-full whitespace-pre-line rounded-md border border-line bg-surface-3 px-4 py-3 text-sm leading-relaxed text-text-soft">
                        {booking.feedback.comment}
                      </p>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setRatingTouched(true);
                      if (rating === 0 || reviewMutation.isPending) return;
                      reviewMutation.mutate();
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <Star size={17} aria-hidden="true" />
                      </span>
                      <h2
                        id="rate-review-title"
                        className="font-display text-base font-bold text-ink"
                      >
                        Rate &amp; Review Service
                      </h2>
                    </div>
                    <p className="mt-1.5 text-sm text-text-soft">
                      {booking.service_name} is complete. How did it go?
                    </p>

                    <fieldset
                      className="mt-4 flex flex-col gap-1.5"
                      onBlur={() => setRatingTouched(true)}
                    >
                      <legend className="sr-only">
                        Rate this service out of 5 stars
                      </legend>
                      <StarRating
                        value={rating}
                        onChange={setRating}
                        disabled={reviewMutation.isPending}
                      />
                      <p
                        className={cn(
                          "text-xs",
                          ratingTouched && rating === 0
                            ? "text-danger"
                            : "text-muted",
                        )}
                      >
                        {ratingTouched && rating === 0
                          ? "Please pick a rating before submitting."
                          : (RATING_CAPTION[rating] ??
                            "Tap a star to rate this service.")}
                      </p>
                    </fieldset>

                    <div className="mt-4">
                      <Textarea
                        label="Tell us more"
                        hint="Optional — what went well, or what we should fix."
                        rows={4}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="e.g. The technician arrived on time and fixed the issue in 20 minutes."
                        disabled={reviewMutation.isPending}
                      />
                    </div>

                    {reviewMutation.isError && (
                      <p
                        role="alert"
                        className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
                      >
                        <AlertCircle
                          size={14}
                          className="mt-px shrink-0"
                          aria-hidden="true"
                        />
                        {reviewMutation.error.message}
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Button
                        type="submit"
                        variant="accent"
                        size="sm"
                        loading={reviewMutation.isPending}
                      >
                        Submit review
                      </Button>
                      <button
                        type="button"
                        onClick={() => setFeedbackOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
                      >
                        <MessageSquare size={13} aria-hidden="true" />
                        Rate in a larger window
                      </button>
                    </div>
                  </form>
                )}
              </Card>
            )}

            {/* Audit trail. Rendered oldest-first — the API returns the rows in
                the order things happened, matching the stepper above it, so
                the list reads as a narrative rather than a reversed one. */}
            <Card className="mt-6 p-6">
              <h2 className="font-display text-base font-bold text-ink">History</h2>
              <p className="mt-1 text-sm text-text-soft">
                Every status change on this booking, oldest first.
              </p>
              {booking.status_history.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No history recorded yet.</p>
              ) : (
                <ul className="mt-5 space-y-5 border-l border-line pl-0">
                  {booking.status_history.map((entry) => (
                    <HistoryRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Side rail — the booking snapshot */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="p-6">
              <h2 className="font-display text-base font-bold text-ink">
                Booking details
              </h2>

              <dl className="mt-4 space-y-3.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-text-soft">Service</dt>
                  <dd className="text-right font-medium text-ink">
                    {booking.service_name}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-text-soft">Price</dt>
                  <dd className="text-right font-display text-base font-bold tabular-nums text-ink">
                    {priceLabel}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5 text-text-soft">
                    <CalendarDays size={13} aria-hidden="true" />
                    Date
                  </dt>
                  <dd className="text-right font-medium text-ink">
                    {formatDate(booking.preferred_date)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5 text-text-soft">
                    <Clock size={13} aria-hidden="true" />
                    Time
                  </dt>
                  <dd className="text-right font-medium text-ink">
                    {formatTime(booking.preferred_time)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5 text-text-soft">
                    <MapPin size={13} aria-hidden="true" />
                    Location
                  </dt>
                  <dd className="text-right font-medium text-ink">
                    {booking.location}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-line pt-5">
                <p className="text-xs font-medium tracking-wide text-text-soft">
                  Full address
                </p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-soft">
                  {booking.address}
                </p>
              </div>

              {booking.notes && (
                <div className="mt-5 border-t border-line pt-5">
                  <p className="text-xs font-medium tracking-wide text-text-soft">
                    Your notes
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-text-soft">
                    {booking.notes}
                  </p>
                </div>
              )}
            </Card>

            <ButtonLink
              href="/services"
              variant="ghost"
              size="sm"
              className="mt-4 w-full"
              leadingIcon={<ArrowLeft size={14} aria-hidden="true" />}
            >
              Book another service
            </ButtonLink>
          </aside>
        </div>
      </Container>

      {/* Cancel confirmation modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="w-full max-w-sm"
          >
            <Card elevation="floating" className="p-6">
              <h2 id="cancel-title" className="font-display text-lg font-bold text-ink">
                Cancel this booking?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-soft">
                {booking.service_name} on {formatDate(booking.preferred_date)} at{" "}
                {formatTime(booking.preferred_time)}. This can&apos;t be undone — you
                can submit a new request if you change your mind.
              </p>

              {cancelMutation.isError && (
                <p role="alert" className="mt-4 text-sm text-danger">
                  {cancelMutation.error.message}
                </p>
              )}

              <div className="mt-6 flex gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setConfirmOpen(false)}
                  disabled={cancelMutation.isPending}
                >
                  Keep booking
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  className="flex-1"
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  {cancelMutation.isPending ? "Cancelling…" : "Yes, cancel"}
                </Button>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Review modal. `refetch` after a successful submit so the header
          swaps the button for the saved rating — the cache is invalidated by
          the modal itself, but this view is the one that has to re-render. */}
      {feedbackOpen && (
        <FeedbackModal
          bookingId={booking.id}
          serviceName={booking.service_name}
          onClose={() => setFeedbackOpen(false)}
          onSubmitted={() => {
            refetch();
            setFeedbackOpen(false);
          }}
        />
      )}
    </MotionPage>
  );
}
