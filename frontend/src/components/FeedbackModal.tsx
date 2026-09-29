"use client";

/**
 * Customer review dialog for one completed booking.
 *
 * ── Why the rating is a radio group and not five buttons ──────────────────────
 * The five stars are real `<input type="radio">` elements behind a styled
 * label. That is not decoration: a button per star would make the control
 * unreachable by keyboard, would expose nothing to a screen reader beyond five
 * unlabelled buttons, and — worst for a form — could not be submitted without
 * bespoke state. A `fieldset` + `legend` wrapped radio group gets arrow-key
 * navigation, the announced value, and native form semantics for free.
 *
 * ── Hover preview ────────────────────────────────────────────────────────────
 * Previewing on hover/focus is a convenience layered on top of the radio, never
 * a replacement for it: the filled set is derived from the *checked* value, so
 * moving the pointer away restores the committed rating rather than leaving a
 * rating the user never actually chose. A stray mouse-cross would otherwise
 * silently change a review.
 *
 * Focus is trapped and the page behind is scroll-locked, matching
 * `ReservationModal` — a dialog that leaks focus back to the page under it is
 * worse than no dialog, because the keyboard user is now lost.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Star, X } from "lucide-react";

import { submitFeedback } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

const MAX_RATING = 5;

/** The five stars, so the array is the single source of the scale. */
const STARS = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/**
 * Rating → the wording a customer sees under the stars.
 *
 * Exported because the inline "Rate & Review Service" card on the booking
 * detail page shows the same caption under its own star row. Two copies of this
 * table would drift, and a customer who picks 4 stars and sees two different
 * descriptions depending on which control they used is a bug report.
 */
export const RATING_CAPTION: Record<number, string> = {
  1: "Poor — not what we expected",
  2: "Below expectations",
  3: "Fine — met the basics",
  4: "Good — happy with the service",
  5: "Excellent — exactly what we needed",
};

interface StarRatingProps {
  /** The committed rating, `0` when nothing is chosen yet. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/**
 * The interactive 1–5 control.
 *
 * Exported so the admin review list can render the same visual language
 * read-only rather than hand-rolling a second star row that drifts from this
 * one in size and spacing.
 */
export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  const [preview, setPreview] = useState(0);

  // The filled set is the *committed* value, not the preview. Falling back to
  // `value` on pointer-leave is what keeps a hover from committing itself.
  const shown = preview || value;

  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setPreview(0)}
      onBlur={() => setPreview(0)}
    >
      {STARS.map((star) => {
        const filled = star <= shown;
        return (
          <label
            key={star}
            onMouseEnter={() => !disabled && setPreview(star)}
            className={cn(
              "cursor-pointer p-0.5 transition-transform",
              disabled && "cursor-default",
              !disabled && "hover:scale-110",
            )}
          >
            <input
              type="radio"
              name="feedback-rating"
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              disabled={disabled}
              className="sr-only"
            />
            <Star
              size={26}
              aria-hidden="true"
              className={cn(
                "transition-colors",
                filled ? "fill-accent text-accent" : "text-line",
              )}
            />
            <span className="sr-only">
              {star} of {MAX_RATING} stars
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A non-interactive star row, for showing a rating that already exists.
 *
 * Announced as a single string ("4 out of 5 stars") rather than as five
 * separate graphics, which is how a screen reader user actually wants it.
 */
export function StarRatingReadonly({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`${value} out of ${MAX_RATING} stars`}
    >
      {STARS.map((star) => (
        <Star
          key={star}
          size={15}
          aria-hidden="true"
          className={cn(
            star <= value ? "fill-accent text-accent" : "text-line",
          )}
        />
      ))}
    </span>
  );
}

interface FeedbackModalProps {
  bookingId: number;
  /** Shown in the header so the reviewer knows what they are rating. */
  serviceName: string;
  onClose: () => void;
  /** Called after a successful submit, so the caller can refresh the page. */
  onSubmitted: () => void;
}

export function FeedbackModal({
  bookingId,
  serviceName,
  onClose,
  onSubmitted,
}: FeedbackModalProps) {
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  /**
   * A review is one-per-booking at the database level, so a double submit is a
   * real 400 rather than a harmless duplicate. The mutation is what the
   * confirmation state waits on — the dialog is not dismissed optimistically.
   */
  const submit = useMutation({
    mutationFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      return submitFeedback(
        bookingId,
        { rating, comment: comment.trim() },
        token,
      );
    },
    onSuccess: () => {
      // The booking page and the customer's list both carry the review's
      // presence, so both have to be marked stale or the "Rate" button stays
      // on screen for a booking that can no longer be rated.
      queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "feedback"] });
      onSubmitted();
    },
  });

  const ratingMissing = touched && rating === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submit.isPending) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl border border-line bg-surface shadow-lg sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2
              id="feedback-modal-title"
              className="font-display text-base font-bold text-ink"
            >
              Rate &amp; review
            </h2>
            <p className="mt-0.5 text-xs text-muted">{serviceName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submit.isPending}
            aria-label="Close"
            className="rounded p-1 text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <fieldset
            onBlur={() => setTouched(true)}
            className="flex flex-col gap-1.5"
          >
            <legend className="text-sm font-medium text-ink">
              How did we do?
            </legend>
            <StarRating
              value={rating}
              onChange={setRating}
              disabled={submit.isPending}
            />
            <p
              className={cn(
                "text-xs",
                ratingMissing ? "text-danger" : "text-muted",
              )}
            >
              {ratingMissing
                ? "Please pick a rating before submitting."
                : RATING_CAPTION[rating] ?? "Tap a star to rate this service."}
            </p>
          </fieldset>

          <Textarea
            label="Tell us more"
            hint="Optional — what went well, or what we should fix."
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. The technician arrived on time and fixed the issue in 20 minutes."
            disabled={submit.isPending}
          />

          {submit.isError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
              {submit.error.message}
            </p>
          )}

          {submit.isSuccess && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-md bg-success-soft px-3 py-2 text-xs text-success"
            >
              <CheckCircle2 size={14} className="mt-px shrink-0" aria-hidden="true" />
              Thanks — your review has been recorded.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={submit.isPending}
          >
            {submit.isSuccess ? "Close" : "Cancel"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submit.isPending}
            // A rating of 0 is the only invalid state; the server enforces the
            // 1–5 bound itself, so this guard is purely about not spending a
            // round trip to learn something the star row already made obvious.
            onClick={() => {
              setTouched(true);
              if (rating === 0) return;
              submit.mutate();
            }}
          >
            Submit review
          </Button>
        </div>
      </div>
    </div>
  );
}
