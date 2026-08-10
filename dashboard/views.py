"""
Views for the dashboard app.
"""
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.views.generic import TemplateView
from django.db.models import Count, Sum, Q
from django.utils import timezone
from datetime import timedelta

from bookings.models import Booking
from ev_charging.models import EVChargingBooking, EVChargingStation
from services.models import Service, ServiceCategory
from accounts.models import User, StaffProfile, CustomerProfile


class StaffRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Mixin to require staff or admin role."""
    def test_func(self):
        return self.request.user.is_staff_user or self.request.user.is_admin_user


class AdminRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Mixin to require admin role."""
    def test_func(self):
        return self.request.user.is_admin_user


@login_required
def customer_dashboard(request):
    """Customer dashboard view."""
    user = request.user
    customer_profile, _ = CustomerProfile.objects.get_or_create(user=user)

    # Upcoming bookings
    upcoming_bookings = Booking.objects.filter(
        customer=user,
        status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS],
        preferred_date__gte=timezone.now().date()
    ).order_by("preferred_date", "preferred_time")[:5]

    # Upcoming EV bookings
    upcoming_ev_bookings = EVChargingBooking.objects.filter(
        customer=user,
        status__in=[EVChargingBooking.Status.PENDING, EVChargingBooking.Status.CONFIRMED],
        booking_date__gte=timezone.now().date()
    ).order_by("booking_date", "start_time")[:5]

    # Recent bookings
    recent_bookings = Booking.objects.filter(customer=user).order_by("-created_at")[:5]
    recent_ev_bookings = EVChargingBooking.objects.filter(customer=user).order_by("-created_at")[:5]

    # Statistics
    total_bookings = Booking.objects.filter(customer=user).count()
    completed_bookings = Booking.objects.filter(customer=user, status=Booking.Status.COMPLETED).count()
    cancelled_bookings = Booking.objects.filter(customer=user, status=Booking.Status.CANCELLED).count()
    total_ev_bookings = EVChargingBooking.objects.filter(customer=user).count()
    completed_ev_bookings = EVChargingBooking.objects.filter(
        customer=user, status=EVChargingBooking.Status.COMPLETED
    ).count()

    # Total spent
    total_spent = Booking.objects.filter(
        customer=user, status=Booking.Status.COMPLETED
    ).aggregate(total=Sum("service_price"))["total"] or 0

    total_ev_spent = EVChargingBooking.objects.filter(
        customer=user, status=EVChargingBooking.Status.COMPLETED
    ).aggregate(total=Sum("estimated_cost"))["total"] or 0

    context = {
        "customer_profile": customer_profile,
        "upcoming_bookings": upcoming_bookings,
        "upcoming_ev_bookings": upcoming_ev_bookings,
        "recent_bookings": recent_bookings,
        "recent_ev_bookings": recent_ev_bookings,
        "stats": {
            "total_bookings": total_bookings,
            "completed_bookings": completed_bookings,
            "cancelled_bookings": cancelled_bookings,
            "total_ev_bookings": total_ev_bookings,
            "completed_ev_bookings": completed_ev_bookings,
            "total_spent": total_spent,
            "total_ev_spent": total_ev_spent,
        },
    }
    return render(request, "dashboard/customer.html", context)


@login_required
def staff_dashboard(request):
    """Staff dashboard view."""
    if not request.user.is_staff_user and not request.user.is_admin_user:
        return redirect("dashboard:customer")

    user = request.user
    staff_profile, _ = StaffProfile.objects.get_or_create(user=user)

    # Today's bookings
    today = timezone.now().date()
    todays_bookings = Booking.objects.filter(
        preferred_date=today,
        status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED, Booking.Status.IN_PROGRESS]
    )

    # If staff (not admin), filter to assigned or unassigned
    if user.is_staff_user and not user.is_admin_user:
        todays_bookings = todays_bookings.filter(
            Q(assigned_staff=user) | Q(assigned_staff__isnull=True)
        )

    todays_bookings = todays_bookings.order_by("preferred_time")[:10]

    # Today's EV bookings
    todays_ev_bookings = EVChargingBooking.objects.filter(
        booking_date=today,
        status__in=[EVChargingBooking.Status.PENDING, EVChargingBooking.Status.CONFIRMED, EVChargingBooking.Status.ACTIVE]
    ).order_by("start_time")[:10]

    # Pending bookings assigned to this staff
    pending_bookings = Booking.objects.filter(
        assigned_staff=user,
        status=Booking.Status.PENDING
    ).order_by("preferred_date", "preferred_time")[:10]

    # Statistics
    total_assigned = Booking.objects.filter(assigned_staff=user).count()
    completed_assigned = Booking.objects.filter(
        assigned_staff=user, status=Booking.Status.COMPLETED
    ).count()
    in_progress_assigned = Booking.objects.filter(
        assigned_staff=user, status=Booking.Status.IN_PROGRESS
    ).count()

    # Recent activity
    recent_bookings = Booking.objects.filter(
        Q(assigned_staff=user) | Q(assigned_staff__isnull=True)
    ).order_by("-created_at")[:10]

    context = {
        "staff_profile": staff_profile,
        "todays_bookings": todays_bookings,
        "todays_ev_bookings": todays_ev_bookings,
        "pending_bookings": pending_bookings,
        "recent_bookings": recent_bookings,
        "stats": {
            "total_assigned": total_assigned,
            "completed_assigned": completed_assigned,
            "in_progress_assigned": in_progress_assigned,
            "todays_count": todays_bookings.count(),
        },
    }
    return render(request, "dashboard/staff.html", context)


@login_required
def admin_dashboard(request):
    """Admin dashboard view."""
    if not request.user.is_admin_user:
        if request.user.is_staff_user:
            return redirect("dashboard:staff")
        return redirect("dashboard:customer")

    # Date ranges
    today = timezone.now().date()
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # User stats
    total_customers = User.objects.filter(role=User.Role.CUSTOMER).count()
    total_staff = User.objects.filter(role=User.Role.STAFF).count()
    new_customers_week = User.objects.filter(
        role=User.Role.CUSTOMER, created_at__date__gte=week_ago
    ).count()

    # Booking stats
    total_bookings = Booking.objects.count()
    pending_bookings = Booking.objects.filter(status=Booking.Status.PENDING).count()
    confirmed_bookings = Booking.objects.filter(status=Booking.Status.CONFIRMED).count()
    in_progress_bookings = Booking.objects.filter(status=Booking.Status.IN_PROGRESS).count()
    completed_bookings = Booking.objects.filter(status=Booking.Status.COMPLETED).count()
    cancelled_bookings = Booking.objects.filter(status=Booking.Status.CANCELLED).count()

    # This week/month
    bookings_week = Booking.objects.filter(created_at__date__gte=week_ago).count()
    bookings_month = Booking.objects.filter(created_at__date__gte=month_ago).count()

    # Revenue
    total_revenue = Booking.objects.filter(
        status=Booking.Status.COMPLETED
    ).aggregate(total=Sum("service_price"))["total"] or 0

    revenue_month = Booking.objects.filter(
        status=Booking.Status.COMPLETED, completed_at__date__gte=month_ago
    ).aggregate(total=Sum("service_price"))["total"] or 0

    # EV stats
    total_ev_stations = EVChargingStation.objects.filter(is_active=True).count()
    total_ev_bookings = EVChargingBooking.objects.count()
    completed_ev_bookings = EVChargingBooking.objects.filter(
        status=EVChargingBooking.Status.COMPLETED
    ).count()

    ev_revenue = EVChargingBooking.objects.filter(
        status=EVChargingBooking.Status.COMPLETED
    ).aggregate(total=Sum("estimated_cost"))["total"] or 0

    # Popular services (grouped by booked service name, since Booking
    # stores the service name denormalized rather than a FK)
    popular_services = list(
        Booking.objects.filter(status=Booking.Status.COMPLETED)
        .values("service_name")
        .annotate(booking_count=Count("id"))
        .order_by("-booking_count")[:5]
    )

    # Recent bookings
    recent_bookings = Booking.objects.select_related("customer", "assigned_staff").order_by("-created_at")[:10]
    recent_ev_bookings = EVChargingBooking.objects.select_related("customer", "station").order_by("-created_at")[:10]

    # Service category stats
    category_stats = ServiceCategory.objects.filter(is_active=True).annotate(
        service_count=Count("services")
    ).order_by("display_order")

    context = {
        "stats": {
            "total_customers": total_customers,
            "total_staff": total_staff,
            "new_customers_week": new_customers_week,
            "total_bookings": total_bookings,
            "pending_bookings": pending_bookings,
            "confirmed_bookings": confirmed_bookings,
            "in_progress_bookings": in_progress_bookings,
            "completed_bookings": completed_bookings,
            "cancelled_bookings": cancelled_bookings,
            "bookings_week": bookings_week,
            "bookings_month": bookings_month,
            "total_revenue": total_revenue,
            "revenue_month": revenue_month,
            "total_ev_stations": total_ev_stations,
            "total_ev_bookings": total_ev_bookings,
            "completed_ev_bookings": completed_ev_bookings,
            "ev_revenue": ev_revenue,
        },
        "popular_services": popular_services,
        "recent_bookings": recent_bookings,
        "recent_ev_bookings": recent_ev_bookings,
        "category_stats": category_stats,
    }
    return render(request, "dashboard/admin.html", context)