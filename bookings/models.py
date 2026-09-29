"""
Models for the bookings app.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from django.urls import reverse


class Booking(models.Model):
    """
    Base booking model for all service bookings.
    """

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        CONFIRMED = "confirmed", _("Confirmed")
        # Declared between CONFIRMED and IN_PROGRESS deliberately: the member
        # order is the dispatch order, and every consumer that walks the
        # lifecycle (the customer timeline, the admin filters, the badge map)
        # reads these in sequence.
        ON_SITE = "on_site", _("Technician on site")
        IN_PROGRESS = "in_progress", _("In Progress")
        COMPLETED = "completed", _("Completed")
        CANCELLED = "cancelled", _("Cancelled")

    # Customer info
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="bookings",
        verbose_name=_("customer"),
    )
    customer_name = models.CharField(_("customer name"), max_length=100)
    customer_email = models.EmailField(_("customer email"))
    customer_phone = models.CharField(_("customer phone"), max_length=20)

    # Service info
    service_name = models.CharField(_("service name"), max_length=200)
    service_price = models.DecimalField(_("service price"), max_digits=10, decimal_places=2)

    # Location
    location = models.CharField(_("location"), max_length=200)
    address = models.TextField(_("address"))

    # Booking details
    preferred_date = models.DateField(_("preferred date"))
    preferred_time = models.TimeField(_("preferred time"))
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    notes = models.TextField(_("notes"), blank=True)

    # Staff assignment
    assigned_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_bookings",
        null=True,
        blank=True,
        verbose_name=_("assigned staff"),
    )

    # Timestamps
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    confirmed_at = models.DateTimeField(_("confirmed at"), null=True, blank=True)
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("booking")
        verbose_name_plural = _("bookings")
        ordering = ["-created_at"]

    def __str__(self):
        return f"Booking #{self.pk} - {self.customer_name} - {self.service_name}"

    def get_absolute_url(self):
        return reverse("bookings:detail", kwargs={"pk": self.pk})

    def get_status_badge_class(self):
        """Return Bootstrap badge class for status."""
        badge_map = {
            self.Status.PENDING: "warning",
            self.Status.CONFIRMED: "info",
            self.Status.ON_SITE: "dark",
            self.Status.IN_PROGRESS: "primary",
            self.Status.COMPLETED: "success",
            self.Status.CANCELLED: "danger",
        }
        return badge_map.get(self.status, "secondary")


class BookingStatusHistory(models.Model):
    """
    Track booking status changes.
    """
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="status_history",
        verbose_name=_("booking"),
    )
    previous_status = models.CharField(_("previous status"), max_length=20, blank=True)
    new_status = models.CharField(_("new status"), max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_("changed by"),
    )
    notes = models.TextField(_("notes"), blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("booking status history")
        verbose_name_plural = _("booking status histories")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.booking} - {self.previous_status} → {self.new_status}"