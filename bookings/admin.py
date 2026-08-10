"""
Admin configuration for the bookings app.
"""
from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import Booking, BookingStatusHistory


class BookingStatusHistoryInline(admin.TabularInline):
    """Inline history of status changes."""
    model = BookingStatusHistory
    extra = 0
    can_delete = False
    readonly_fields = ("previous_status", "new_status", "changed_by", "notes", "created_at")
    fields = ("previous_status", "new_status", "changed_by", "notes", "created_at")

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "id", "customer_name", "service_name", "preferred_date", "preferred_time",
        "status", "service_price", "assigned_staff",
    )
    list_filter = ("status", "preferred_date", "location")
    search_fields = ("customer_name", "customer_email", "customer_phone", "service_name", "address")
    date_hierarchy = "preferred_date"
    autocomplete_fields = ("customer", "assigned_staff")
    readonly_fields = (
        "customer_name", "customer_email", "customer_phone",
        "service_name", "service_price", "created_at",
    )
    inlines = (BookingStatusHistoryInline,)
    fieldsets = (
        (_("Customer"), {"fields": ("customer", "customer_name", "customer_email", "customer_phone")}),
        (_("Service"), {"fields": ("service_name", "service_price", "assigned_staff", "status")}),
        (_("Schedule & Location"), {"fields": ("preferred_date", "preferred_time", "location", "address")}),
        (_("Notes"), {"fields": ("notes",)}),
        (_("Timestamps"), {"fields": ("created_at",)}),
    )


@admin.register(BookingStatusHistory)
class BookingStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("booking", "previous_status", "new_status", "changed_by", "created_at")
    list_filter = ("new_status",)
    search_fields = ("booking__customer_name", "notes")
    readonly_fields = ("booking", "previous_status", "new_status", "changed_by", "notes", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
