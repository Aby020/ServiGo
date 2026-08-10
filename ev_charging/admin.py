"""
Admin configuration for the ev_charging app.
"""
from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import EVChargingStation, EVChargingBooking


@admin.register(EVChargingStation)
class EVChargingStationAdmin(admin.ModelAdmin):
    list_display = (
        "name", "city", "charger_type", "charging_speed_kw",
        "price_per_kwh", "status", "is_active",
    )
    list_filter = ("status", "charger_type", "is_active", "city")
    search_fields = ("name", "slug", "city", "address")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("name", "slug", "description")}),
        (_("Location"), {"fields": ("address", "city", "state", "pincode")}),
        (
            _("Map"),
            {"fields": ("latitude", "longitude", "google_maps_url")},
        ),
        (_("Charging"), {"fields": ("charger_type", "charging_speed_kw", "price_per_kwh")}),
        (_("Availability"), {"fields": ("status", "is_active")}),
        (_("Timestamps"), {"fields": ("created_at", "updated_at")}),
    )


@admin.register(EVChargingBooking)
class EVChargingBookingAdmin(admin.ModelAdmin):
    list_display = (
        "id", "customer_name", "station", "booking_date",
        "start_time", "end_time", "estimated_kwh", "status",
    )
    list_filter = ("status", "booking_date", "station")
    search_fields = ("customer_name", "customer_email", "customer_phone", "station__name")
    date_hierarchy = "booking_date"
    autocomplete_fields = ("customer", "station")
    readonly_fields = (
        "customer_name", "customer_email", "customer_phone",
        "estimated_cost", "created_at", "updated_at",
    )
    fieldsets = (
        (_("Customer"), {"fields": ("customer", "customer_name", "customer_email", "customer_phone")}),
        (_("Station"), {"fields": ("station", "status")}),
        (_("Slot"), {"fields": ("booking_date", "start_time", "end_time")}),
        (_("Energy"), {"fields": ("estimated_kwh", "estimated_cost")}),
        (_("Notes"), {"fields": ("notes",)}),
        (_("Timestamps"), {"fields": ("created_at", "updated_at")}),
    )
