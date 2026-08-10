"""
URL configuration for bookings app.
"""
from django.urls import path
from . import views

app_name = "bookings"

urlpatterns = [
    # Customer booking views
    path("service/<int:service_pk>/book/", views.BookingCreateView.as_view(), name="create"),
    path("confirmation/<int:pk>/", views.BookingConfirmationView.as_view(), name="confirmation"),
    path("", views.BookingListView.as_view(), name="list"),
    path("<int:pk>/", views.BookingDetailView.as_view(), name="detail"),
    path("<int:pk>/cancel/", views.booking_cancel, name="cancel"),

    # Staff booking views
    path("staff/", views.StaffBookingListView.as_view(), name="staff_list"),
    path("staff/<int:pk>/", views.StaffBookingDetailView.as_view(), name="staff_detail"),
]