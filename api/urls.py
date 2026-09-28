"""
URL patterns for the ServiGo REST API (/api/).
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    LoginView,
    MeView,
    RegisterView,
    ServiceCategoryListView,
    ServiceListView,
    ServiceDetailView,
    BookingListCreateView,
    BookingDetailView,
    BookingCancelView,
)

urlpatterns = [
    # Auth
    path("auth/register/", RegisterView.as_view(), name="api-register"),
    path("auth/login/", LoginView.as_view(), name="api-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="api-token-refresh"),
    path("auth/me/", MeView.as_view(), name="api-me"),

    # Services catalogue (public)
    path("service-categories/", ServiceCategoryListView.as_view(), name="api-service-categories"),
    path("services/", ServiceListView.as_view(), name="api-services"),
    path("services/<int:pk>/", ServiceDetailView.as_view(), name="api-service-detail"),

    # Bookings (authenticated)
    path("bookings/", BookingListCreateView.as_view(), name="api-bookings"),
    path("bookings/<int:pk>/", BookingDetailView.as_view(), name="api-booking-detail"),
    path("bookings/<int:pk>/cancel/", BookingCancelView.as_view(), name="api-booking-cancel"),
]
