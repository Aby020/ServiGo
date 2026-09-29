"""
Admin configuration for the feedback app.

Reviews are customer records, so they are read-only in Django admin: a
support agent never edits someone's words, they escalate it. The `service_name`
property is shown alongside the booking so an operator can triage without
opening two tabs.
"""
from django.contrib import admin

from .models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("rating", "service_name", "customer", "booking", "created_at")
    # `service_name` is a property, and `list_filter` only accepts concrete
    # fields — Django's admin check (admin.E116) rejects it outright. Rating
    # and date are the axes an operator actually slices on; the service is
    # reachable through the search box below.
    list_filter = ("rating", "created_at")
    search_fields = ("customer__email", "booking__customer_name", "booking__service_name", "comment")
    readonly_fields = ("customer", "booking", "service_name", "created_at")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        # Reviews are born from completed bookings only, and only customers
        # write them through the API. There is no admin path that should create
        # one.
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        # An operator can archive a review that crossed the line, but never
        # silently — that is a support action, and the UI for it lives in a
        # different tool.
        return False
