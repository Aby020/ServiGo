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
    StaffBookingListView,
    StaffBookingAssignView,
    StaffBookingStatusView,
    EVStationListView,
    EVStationDetailView,
    EVBookingListCreateView,
    EVBookingDetailView,
    EVBookingCancelView,
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

    # Staff dispatch (service staff only)
    path("staff/bookings/", StaffBookingListView.as_view(), name="api-staff-bookings"),
    path("staff/bookings/<int:pk>/assign/", StaffBookingAssignView.as_view(), name="api-staff-booking-assign"),
    path("staff/bookings/<int:pk>/status/", StaffBookingStatusView.as_view(), name="api-staff-booking-status"),

    # EV charging — stations are public, reservations require a session
    path("ev/stations/", EVStationListView.as_view(), name="api-ev-stations"),
    path("ev/stations/<int:pk>/", EVStationDetailView.as_view(), name="api-ev-station-detail"),
    path("ev/bookings/", EVBookingListCreateView.as_view(), name="api-ev-bookings"),
    path("ev/bookings/<int:pk>/", EVBookingDetailView.as_view(), name="api-ev-booking-detail"),
    path("ev/bookings/<int:pk>/cancel/", EVBookingCancelView.as_view(), name="api-ev-booking-cancel"),
]
