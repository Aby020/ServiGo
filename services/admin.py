
"""
Admin configuration for the services app.
"""
from django.contrib import admin
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from .models import ServiceCategory, Service


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "icon", "is_active", "display_order", "service_count")
    list_filter = ("is_active",)
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ("display_order", "is_active")
    ordering = ("display_order", "name")

    def service_count(self, obj):
        return obj.services.count()
    service_count.short_description = "Services"


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = (
        "thumbnail", "name", "category", "price", "estimated_duration",
        "is_available", "is_featured", "display_order",
    )
    list_filter = ("is_available", "is_featured", "category")
    search_fields = ("name", "slug", "short_description")
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ("price", "is_available", "is_featured", "display_order")
    autocomplete_fields = ("category",)
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("category", "name", "slug", "price", "estimated_duration")}),
        (_("Copy"), {"fields": ("short_description", "description", "what_included")}),
        (_("Presentation"), {"fields": ("image", "is_available", "is_featured", "display_order")}),
        (_("Timestamps"), {"fields": ("created_at", "updated_at")}),
    )

    def thumbnail(self, obj):
        if obj.image:
            return format_html('<img src="{}" width="60" />', obj.image.url)
        return "-"
    thumbnail.short_description = "Image"

from django.contrib import admin
from . models import *

admin.site.register(Electricians)
admin.site.register(Plumbers)
admin.site.register(SmartTv)
admin.site.register(Electrical_service_booking)
admin.site.register(Plumbing_service_booking)
admin.site.register(smartTv_service_booking)
admin.site.register(Add_Charging_Station)
admin.site.register(Charging_station_booking)

