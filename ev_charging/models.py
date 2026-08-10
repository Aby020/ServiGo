"""
Models for the EV charging app.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.conf import settings
from django.urls import reverse


class EVChargingStation(models.Model):
    """
    EV Charging Station model.
    """

    class ChargerType(models.TextChoices):
        TYPE_1 = "type1", _("Type 1 (SAE J1772)")
        TYPE_2 = "type2", _("Type 2 (Mennekes)")
        CCS1 = "ccs1", _("CCS1 (Combo 1)")
        CCS2 = "ccs2", _("CCS2 (Combo 2)")
        CHADEMO = "chademo", _("CHAdeMO")
        TESLA = "tesla", _("Tesla Supercharger")
        GB_T = "gb_t", _("GB/T")

    class Status(models.TextChoices):
        AVAILABLE = "available", _("Available")
        IN_USE = "in_use", _("In Use")
        MAINTENANCE = "maintenance", _("Under Maintenance")
        OFFLINE = "offline", _("Offline")

    name = models.CharField(_("station name"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=200, unique=True)
    description = models.TextField(_("description"), blank=True)

    # Location
    address = models.TextField(_("address"))
    city = models.CharField(_("city"), max_length=100)
    state = models.CharField(_("state"), max_length=100)
    pincode = models.CharField(_("pincode"), max_length=10)
    latitude = models.DecimalField(
        _("latitude"),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
    )
    longitude = models.DecimalField(
        _("longitude"),
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
    )
    google_maps_url = models.URLField(_("Google Maps URL"), blank=True)

    # Charging details
    charger_type = models.CharField(
        _("charger type"),
        max_length=20,
        choices=ChargerType.choices,
        default=ChargerType.CCS2,
    )
    charging_speed_kw = models.PositiveIntegerField(
        _("charging speed (kW)"),
        help_text="Maximum charging speed in kW",
    )
    price_per_kwh = models.DecimalField(
        _("price per kWh"),
        max_digits=6,
        decimal_places=2,
    )

    # Availability
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.AVAILABLE,
    )
    total_ports = models.PositiveIntegerField(_("total ports"), default=1)
    available_ports = models.PositiveIntegerField(_("available ports"), default=1)

    # Operating hours
    opens_at = models.TimeField(_("opens at"), help_text="24-hour format")
    closes_at = models.TimeField(_("closes at"), help_text="24-hour format")
    is_24_hours = models.BooleanField(_("24 hours"), default=False)

    # Media
    image = models.ImageField(_("station image"), upload_to="ev_stations/", blank=True, null=True)

    # Metadata
    is_active = models.BooleanField(_("active"), default=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("EV charging station")
        verbose_name_plural = _("EV charging stations")
        ordering = ["name"]

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse("ev_charging:station_detail", kwargs={"slug": self.slug})

    def get_formatted_price(self):
        return f"₹{self.price_per_kwh:,.2f}/kWh"

    def is_open_now(self):
        """Check if station is currently open."""
        if self.is_24_hours:
            return True
        from django.utils import timezone
        now = timezone.now().time()
        if self.opens_at <= self.closes_at:
            return self.opens_at <= now <= self.closes_at
        # Overnight hours (e.g., 22:00 - 06:00)
        return now >= self.opens_at or now <= self.closes_at


class EVChargingBooking(models.Model):
    """
    EV Charging slot booking.
    """

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        CONFIRMED = "confirmed", _("Confirmed")
        ACTIVE = "active", _("Charging Active")
        COMPLETED = "completed", _("Completed")
        CANCELLED = "cancelled", _("Cancelled")

    # Customer info
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ev_bookings",
        verbose_name=_("customer"),
    )
    customer_name = models.CharField(_("customer name"), max_length=100)
    customer_email = models.EmailField(_("customer email"))
    customer_phone = models.CharField(_("customer phone"), max_length=20)

    # Station info
    station = models.ForeignKey(
        EVChargingStation,
        on_delete=models.CASCADE,
        related_name="bookings",
        verbose_name=_("station"),
    )

    # Booking details
    booking_date = models.DateField(_("booking date"))
    start_time = models.TimeField(_("start time"))
    end_time = models.TimeField(_("end time"))
    estimated_kwh = models.DecimalField(
        _("estimated kWh"),
        max_digits=6,
        decimal_places=2,
        help_text="Estimated energy consumption",
    )
    estimated_cost = models.DecimalField(
        _("estimated cost"),
        max_digits=10,
        decimal_places=2,
    )

    # Status
    status = models.CharField(
        _("status"),
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    notes = models.TextField(_("notes"), blank=True)

    # Timestamps
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)
    confirmed_at = models.DateTimeField(_("confirmed at"), null=True, blank=True)
    started_at = models.DateTimeField(_("started at"), null=True, blank=True)
    completed_at = models.DateTimeField(_("completed at"), null=True, blank=True)

    class Meta:
        verbose_name = _("EV charging booking")
        verbose_name_plural = _("EV charging bookings")
        ordering = ["-created_at"]

    def __str__(self):
        return f"EV Booking #{self.pk} - {self.customer_name} - {self.station.name}"

    def get_absolute_url(self):
        return reverse("ev_charging:booking_detail", kwargs={"pk": self.pk})

    def get_status_badge_class(self):
        badge_map = {
            self.Status.PENDING: "warning",
            self.Status.CONFIRMED: "info",
            self.Status.ACTIVE: "primary",
            self.Status.COMPLETED: "success",
            self.Status.CANCELLED: "danger",
        }
        return badge_map.get(self.status, "secondary")