"""
Models for the feedback app.

A review is the customer's own record of a job that actually happened, so it is
deliberately bound to the booking rather than to the service: a service is
something customers choose from, and rating the catalogue entry says nothing
about whether *this* visit went well.
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class Feedback(models.Model):
    """
    A customer's rating and comment on a completed booking.

    The one-review-per-booking rule is a `OneToOneField` rather than a check in
    a serializer. The API is one of several ways a row can arrive — Django
    admin, a data import, a future mobile client — and a database constraint is
    the only one of them that cannot be forgotten. The serializer still
    validates it, so the caller gets a 400 rather than an `IntegrityError`
    escaping as a 500.
    """

    #: Stars. 1 is "never again", 5 is "excellent".
    RATING_MIN = 1
    RATING_MAX = 5

    booking = models.OneToOneField(
        "bookings.Booking",
        on_delete=models.CASCADE,
        related_name="feedback",
        verbose_name=_("booking"),
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="feedback",
        verbose_name=_("customer"),
    )
    rating = models.PositiveSmallIntegerField(
        _("rating"),
        validators=[MinValueValidator(RATING_MIN), MaxValueValidator(RATING_MAX)],
        help_text=_("1 to 5 stars."),
    )
    comment = models.TextField(
        _("comment"),
        blank=True,
        help_text=_("Free-text note. Optional — a rating alone is a review."),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("feedback")
        verbose_name_plural = _("feedback")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.rating}★ for booking #{self.booking_id}"

    @property
    def service_name(self):
        """The service as it was at booking time, not today's catalogue entry."""
        return self.booking.service_name
