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
        # The six forward-path members, declared in dispatch order. That order is
        # the contract: `LIFECYCLE` below reads this declaration positionally, and
        # every consumer that walks the lifecycle (the customer stepper, the
        # dispatch buttons, the admin filters, the badge map) reads these in
        # sequence. Inserting a member anywhere but the end changes the meaning
        # of every transition that spans it.
        PENDING = "pending", _("Pending")
        CLAIMED = "claimed", _("Claimed")
        ACCEPTED = "accepted", _("Accepted")
        ARRIVED = "arrived", _("Technician arrived")
        IN_PROGRESS = "in_progress", _("In Progress")
        COMPLETED = "completed", _("Completed")
        # A branch off the path, not a step on it. Declared last so it can never
        # be mistaken for a stage.
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

    #: The forward path, in order. Read from `Status` declaration order rather
    #: than restated, so the enum and the walk-through can never disagree about
    #: which statuses are stages and what order they happen in.
    LIFECYCLE = (
        Status.PENDING,
        Status.CLAIMED,
        Status.ACCEPTED,
        Status.ARRIVED,
        Status.IN_PROGRESS,
        Status.COMPLETED,
    )

    #: The one customer-facing sentence each stage is announced with. This is the
    #: wording the customer reads on their booking timeline, so it is fixed by the
    #: operations contract rather than composed by whichever view happened to write
    #: the row: "Technician arrived at user location" has to survive a technician's
    #: free-text note, an admin's manual correction and a data import, and only a
    #: constant guarantees that.
    MILESTONE_NOTES = {
        Status.PENDING: "Booking submitted",
        Status.CLAIMED: "Technician assigned",
        Status.ACCEPTED: "Technician accepted job dispatch",
        Status.ARRIVED: "Technician arrived at user location",
        Status.IN_PROGRESS: "Work started on task",
        Status.COMPLETED: "Task completed successfully",
    }

    #: Statuses a booking can never leave. Completing or cancelling a job is
    #: terminal: a technician who realises they marked the wrong job done needs a
    #: human to reopen it, not a second click.
    TERMINAL_STATUSES = frozenset({Status.COMPLETED, Status.CANCELLED})

    #: Statuses that still represent work to be done — everything on the path
    #: that is not yet finished. `cancelled` is excluded: a cancelled booking is
    #: finished being, not work in hand, and counting it as "active" would
    #: inflate the dispatch queue an operator is trying to reason about.
    OPEN_STATUSES = frozenset(LIFECYCLE[:-1])

    def __str__(self):
        return f"Booking #{self.pk} - {self.customer_name} - {self.service_name}"

    @classmethod
    def is_terminal_status(cls, status):
        """True once a job has stopped moving: finished or cancelled."""
        return status in cls.TERMINAL_STATUSES

    @classmethod
    def next_status(cls, current):
        """
        The single status `current` may legally advance to, or `None`.

        `None` means there is nowhere to go — either the job is finished, or it
        is sitting on a status the lifecycle does not know. Returning `None`
        rather than raising lets a caller produce a refusal message that fits
        the reason, and lets a caller walking the path treat it as the end.

        `pending` does have a successor: the technician claiming the job. It is
        excluded from *the dispatch actions*, which start one step in, but the
        lifecycle itself is continuous, so this reports it.
        """
        if current not in cls.LIFECYCLE:
            return None
        index = cls.LIFECYCLE.index(current)
        if index == len(cls.LIFECYCLE) - 1:
            return None
        return cls.LIFECYCLE[index + 1]

    @classmethod
    def can_transition(cls, current, target):
        """
        Whether `current` → `target` is one legal step along the forward path.

        Strictly one step. A jump of two (`pending` → `arrived`) is refused even
        though both ends are on the lifecycle, because the intermediate milestone
        is the only evidence that the work between them actually happened — the
        same reason a repeated step is refused: a status that can be reached
        without passing through the stages before it records a job nobody
        travelled.

        Unknown and non-adjacent statuses are both `False`, so callers can treat
        this as the whole rule rather than pairing it with a range check.
        """
        return cls.next_status(current) == target

    @classmethod
    def milestone_note(cls, status):
        """
        The customer-facing description for entering `status`.

        Falls back to the humanised status name so a status outside the six
        (`cancelled` is the only one today) still gets a readable audit row
        rather than an empty notes field.
        """
        return cls.MILESTONE_NOTES.get(status, dict(cls.Status.choices).get(status, status))

    def get_absolute_url(self):
        return reverse("bookings:detail", kwargs={"pk": self.pk})

    def get_status_badge_class(self):
        """Return Bootstrap badge class for status."""
        badge_map = {
            self.Status.PENDING: "warning",
            self.Status.CLAIMED: "info",
            self.Status.ACCEPTED: "info",
            self.Status.ARRIVED: "dark",
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