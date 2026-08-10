"""
URL configuration for dashboard app.
"""
from django.urls import path
from . import views

app_name = "dashboard"

urlpatterns = [
    path("customer/", views.customer_dashboard, name="customer"),
    path("staff/", views.staff_dashboard, name="staff"),
    path("admin/", views.admin_dashboard, name="admin"),
]