"""
URL configuration for ServiGo project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from urllib.parse import urljoin

from django.contrib import admin
from django.contrib.staticfiles.storage import staticfiles_storage
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponsePermanentRedirect
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)


def favicon_redirect(request):
    """Answer the bare `/favicon.ico` that browsers request unprompted.

    Resolved per request rather than at import time for two reasons:
    STATIC_URL is relative in this project ("static/"), so the target has to be
    made absolute against the current host, and `staticfiles_storage` is what
    knows the hashed filename under the production manifest storage backend.
    """
    target = urljoin(f"{request.scheme}://{request.get_host()}/", staticfiles_storage.url("images/favicon.ico"))
    return HttpResponsePermanentRedirect(target)


urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),

    # Browsers request this path directly, so it must be declared before the
    # catch-all core:home route below.
    path("favicon.ico", favicon_redirect),

    # REST API
    path("api/", include("api.urls")),

    # API docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    # Redoc reference rendering of the same document. Handy for reading the
    # API top-to-bottom; Swagger UI above stays the one to poke endpoints with.
    path(
        "api/schema/swagger-ui/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),

    # Core app - home, about, contact, etc.
    path("", include("core.urls", namespace="core")),

    # Accounts - authentication
    path("accounts/", include("accounts.urls", namespace="accounts")),

    # Services catalog
    path("services/", include("services.urls", namespace="services")),

    # Bookings
    path("bookings/", include("bookings.urls", namespace="bookings")),

    # EV Charging
    path("ev/", include("ev_charging.urls", namespace="ev_charging")),

    # Dashboard
    path("dashboard/", include("dashboard.urls", namespace="dashboard")),
]

# Error handlers
handler404 = "core.views.handler404"
handler403 = "core.views.handler403"
handler500 = "core.views.handler500"

# Serve media files in development
if settings.DEBUG:
    urlpatterns += [
        path("__reload__/", include("django_browser_reload.urls")),
        *static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT),
        *static(settings.STATIC_URL, document_root=settings.STATIC_ROOT),
    ]