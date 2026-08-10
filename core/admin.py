"""
Admin configuration for the core app.
"""
from django.contrib import admin
from django.utils.translation import gettext_lazy as _

from .models import ContactMessage, SiteSettings


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    """Settings singleton — only the single row may be edited."""

    list_display = ("site_name", "site_tagline", "contact_email", "contact_phone", "updated_at")
    fieldsets = (
        (_("Branding"), {"fields": ("site_name", "site_tagline")}),
        (_("Contact"), {"fields": ("contact_email", "contact_phone", "address")}),
        (_("Social"), {"fields": ("facebook_url", "twitter_url", "instagram_url", "linkedin_url", "youtube_url")}),
        (_("Maintenance"), {"fields": ("maintenance_mode", "maintenance_message", "updated_at")}),
    )
    readonly_fields = ("updated_at",)

    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "subject", "is_read", "is_replied", "created_at")
    list_filter = ("is_read", "is_replied", "created_at")
    search_fields = ("name", "email", "subject", "message")
    readonly_fields = ("name", "email", "phone", "subject", "message", "created_at")
    date_hierarchy = "created_at"
    fieldsets = (
        (_("Message"), {"fields": ("name", "email", "phone", "subject", "message")}),
        (_("Status"), {"fields": ("is_read", "is_replied")}),
        (_("Received"), {"fields": ("created_at",)}),
    )

    def has_add_permission(self, request):
        return False
