"""
URL patterns for the ServiGo REST API (/api/).
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    LoginView,
    MeView,
    RegisterView,
    ProfileUpdateView,
    ServiceCategoryListView,
    ServiceListView,
    ServiceDetailView,
    BookingListCreateView,
    BookingDetailView,
    BookingCancelView,
    StaffBookingListView,
    StaffBookingAssignView,
    StaffBookingStatusView,
    StaffBookingActionView,
    EVStationListView,
    EVStationDetailView,
    EVBookingListCreateView,
    EVBookingDetailView,
    EVBookingCancelView,
    AdminStaffListCreateView,
    AdminMetricsView,
    FeedbackCreateView,
    AdminFeedbackListView,
)

urlpatterns = [
    # Auth
    path("auth/register/", RegisterView.as_view(), name="api-register"),
    path("auth/login/", LoginView.as_view(), name="api-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="api-token-refresh"),
    path("auth/me/", MeView.as_view(), name="api-me"),
    # Profile edit. Any authenticated role may patch its own record — the
    # view is scoped to `request.user`, so there is no id in the path to
    # tamper with. Admin and staff accounts use the same endpoint as
    # customers; only the writable field set is fixed by the serializer.
    path("auth/profile/", ProfileUpdateView.as_view(), name="api-profile"),

    # Services catalogue (public)
    path("service-categories/", ServiceCategoryListView.as_view(), name="api-service-categories"),
    path("services/", ServiceListView.as_view(), name="api-services"),
    path("services/<int:pk>/", ServiceDetailView.as_view(), name="api-service-detail"),

    # Bookings (authenticated)
    path("bookings/", BookingListCreateView.as_view(), name="api-bookings"),
    path("bookings/<int:pk>/", BookingDetailView.as_view(), name="api-booking-detail"),
    path("bookings/<int:pk>/cancel/", BookingCancelView.as_view(), name="api-booking-cancel"),

    # Customer reviews (the booking's own customer only)
    path("feedback/", FeedbackCreateView.as_view(), name="api-feedback"),

    # Staff dispatch (service staff only)
    path("staff/bookings/", StaffBookingListView.as_view(), name="api-staff-bookings"),
    path("staff/bookings/<int:pk>/assign/", StaffBookingAssignView.as_view(), name="api-staff-booking-assign"),
    path("staff/bookings/<int:pk>/status/", StaffBookingStatusView.as_view(), name="api-staff-booking-status"),
    # The four explicit dispatch milestones: claim → reached_location →
    # start_work → complete_work. Strictly ordered; a stage fired twice is a
    # 400, not a silent success.
    path("staff/bookings/<int:pk>/actions/", StaffBookingActionView.as_view(), name="api-staff-booking-action"),

    # EV charging — stations are public, reservations require a session
    path("ev/stations/", EVStationListView.as_view(), name="api-ev-stations"),
    path("ev/stations/<int:pk>/", EVStationDetailView.as_view(), name="api-ev-station-detail"),
    path("ev/bookings/", EVBookingListCreateView.as_view(), name="api-ev-bookings"),
    path("ev/bookings/<int:pk>/", EVBookingDetailView.as_view(), name="api-ev-booking-detail"),
    path("ev/bookings/<int:pk>/cancel/", EVBookingCancelView.as_view(), name="api-ev-booking-cancel"),

    # Admin command hub (administrators only — guarded by IsAdminUser inside
    # the views, not by URL placement)
    path("admin/staff/", AdminStaffListCreateView.as_view(), name="api-admin-staff"),
    path("admin/metrics/", AdminMetricsView.as_view(), name="api-admin-metrics"),
    path("admin/feedback/", AdminFeedbackListView.as_view(), name="api-admin-feedback"),
]
