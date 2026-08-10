"""
URL configuration for EV charging app.
"""
from django.urls import path
from . import views

app_name = "ev_charging"

urlpatterns = [
    # Public station views
    path("", views.EVStationListView.as_view(), name="station_list"),
    path("station/<slug:slug>/", views.EVStationDetailView.as_view(), name="station_detail"),

    # Customer booking views
    path("station/<slug:slug>/book/", views.EVBookingCreateView.as_view(), name="booking_create"),
    path("booking/<int:pk>/confirmation/", views.EVBookingConfirmationView.as_view(), name="booking_confirmation"),
    path("bookings/", views.EVBookingListView.as_view(), name="booking_list"),
    path("booking/<int:pk>/", views.EVBookingDetailView.as_view(), name="booking_detail"),
    path("booking/<int:pk>/cancel/", views.ev_booking_cancel, name="booking_cancel"),

    # Staff views
    path("staff/stations/", views.StaffEVStationListView.as_view(), name="staff_station_list"),
    path("staff/bookings/", views.StaffEVBookingListView.as_view(), name="staff_booking_list"),
    path("staff/booking/<int:pk>/", views.StaffEVBookingDetailView.as_view(), name="staff_booking_detail"),
]