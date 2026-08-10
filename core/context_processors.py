"""
Global context processors.
"""
from .models import SiteSettings


def site_settings(request):
    """Expose SiteSettings in every template context."""
    return {"site_settings": SiteSettings.get_settings()}
