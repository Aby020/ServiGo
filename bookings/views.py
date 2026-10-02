"""
Views for the bookings app.
"""
from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.generic import ListView, DetailView, CreateView
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.core.mail import send_mail
from django.conf import settings
from django.db.models import Q

from .models import Booking, BookingStatusHistory
from .forms import BookingForm, BookingStatusUpdateForm
from services.models import Service
from ev_charging.models import EVChargingBooking


class BookingCreateView(LoginRequiredMixin, CreateView):
    """Create a new service booking."""
    model = Booking
    form_class = BookingForm
    template_name = "bookings/create.html"

    def dispatch(self, request, *args, **kwargs):
        self.service = get_object_or_404(Service, pk=kwargs.get("service_pk"), is_available=True)
        return super().dispatch(request, *args, **kwargs)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["initial"] = {
            "service_name": self.service.name,
            "service_price": self.service.price,
        }
        return kwargs

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["service"] = self.service
        return context

    def form_valid(self, form):
        booking = form.save(commit=False)
        booking.customer = self.request.user
        booking.customer_name = self.request.user.get_full_name() or self.request.user.username
        booking.customer_email = self.request.user.email
        booking.customer_phone = self.request.user.phone
        booking.service_name = self.service.name
        booking.service_price = self.service.price
        booking.save()

        # Send confirmation email
        self.send_confirmation_email(booking)

        messages.success(self.request, "Booking request submitted successfully! We'll confirm shortly.")
        return redirect("bookings:confirmation", pk=booking.pk)

    def send_confirmation_email(self, booking):
        """Send booking confirmation email."""
        try:
            subject = f"Booking Confirmation - {booking.service_name} - ServiGo"
            message = f"""
Dear {booking.customer_name},

Thank you for booking with ServiGo! Your booking request has been received.

Booking Details:
- Service: {booking.service_name}
- Price: ₹{booking.service_price:,.2f}
- Preferred Date: {booking.preferred_date.strftime('%B %d, %Y')}
- Preferred Time: {booking.preferred_time.strftime('%I:%M %p')}
- Location: {booking.location}
- Address: {booking.address}

Your booking is currently {booking.get_status_display()}. Our team will review and confirm shortly.

For any queries, contact us at support@servigo.com

Thank you for choosing ServiGo!
            """
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [booking.customer_email],
                fail_silently=True,
            )
        except Exception:
            # Log error but don't fail the booking
            pass


class BookingConfirmationView(LoginRequiredMixin, DetailView):
    """Booking confirmation page."""
    model = Booking
    template_name = "bookings/confirmation.html"
    context_object_name = "booking"

    def get_queryset(self):
        return Booking.objects.filter(customer=self.request.user)


class BookingListView(LoginRequiredMixin, ListView):
    """List user's bookings."""
    model = Booking
    template_name = "bookings/list.html"
    context_object_name = "bookings"
    paginate_by = 10

    def get_queryset(self):
        queryset = Booking.objects.filter(customer=self.request.user).select_related("assigned_staff")

        # Status filter
        status = self.request.GET.get("status")
        if status:
            queryset = queryset.filter(status=status)

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["status_choices"] = Booking.Status.choices
        context["current_status"] = self.request.GET.get("status", "")
        # EV charging bookings for this customer (same "My Bookings" page)
        context["ev_bookings"] = EVChargingBooking.objects.filter(
            customer=self.request.user
        ).select_related("station").order_by("-booking_date", "-start_time")
        return context


class BookingDetailView(LoginRequiredMixin, DetailView):
    """Booking detail view."""
    model = Booking
    template_name = "bookings/detail.html"
    context_object_name = "booking"

    def get_queryset(self):
        user = self.request.user
        if user.is_staff_user or user.is_admin_user:
            return Booking.objects.all().select_related("customer", "assigned_staff")
        return Booking.objects.filter(customer=user).select_related("assigned_staff")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["status_history"] = self.object.status_history.all()
        return context


@login_required
def booking_cancel(request, pk):
    """Cancel a booking."""
    booking = get_object_or_404(Booking, pk=pk, customer=request.user)

    if booking.status in [Booking.Status.COMPLETED, Booking.Status.CANCELLED]:
        messages.error(request, "This booking cannot be cancelled.")
        return redirect("bookings:detail", pk=pk)

    if request.method == "POST":
        old_status = booking.status
        booking.status = Booking.Status.CANCELLED
        booking.save()

        BookingStatusHistory.objects.create(
            booking=booking,
            previous_status=old_status,
            new_status=Booking.Status.CANCELLED,
            changed_by=request.user,
            notes="Cancelled by customer",
        )

        messages.success(request, "Booking cancelled successfully.")
        return redirect("bookings:list")

    return render(request, "bookings/cancel.html", {"booking": booking})


# Staff/Admin views
class StaffRequiredMixin(LoginRequiredMixin, UserPassesTestMixin):
    """Mixin to require staff or admin role."""
    def test_func(self):
        return self.request.user.is_staff_user or self.request.user.is_admin_user


def staff_assignable_bookings(user):
    """
    The bookings a member of staff is allowed to see.

    A technician sees their own jobs plus the unassigned queue they can claim
    from — never another technician's work, which carries the customer's name,
    phone number and address. Admins see everything: they run the dispatch desk
    and are the ones who reassign jobs, so narrowing their view would leave them
    unable to fix a misassignment.

    Both staff views and the list this backs are defined in terms of this one
    function. They used to each carry their own copy, and the detail view had
    none at all — which meant a technician could open `/bookings/staff/<pk>/`
    for any id, read a customer's contact details and drive the booking through
    the lifecycle with a plain form POST. The filter is what makes the detail
    URL mean the same thing as the list it was reached from.
    """
    queryset = Booking.objects.select_related("customer", "assigned_staff")
    if user.is_staff_user:
        return queryset.filter(
            Q(assigned_staff=user) | Q(assigned_staff__isnull=True)
        )
    return queryset


class StaffBookingListView(StaffRequiredMixin, ListView):
    """Staff view of all bookings."""
    model = Booking
    template_name = "bookings/staff_list.html"
    context_object_name = "bookings"
    paginate_by = 20

    def get_queryset(self):
        queryset = staff_assignable_bookings(self.request.user)

        # Filter by status
        status = self.request.GET.get("status")
        if status:
            queryset = queryset.filter(status=status)

        # Search
        query = self.request.GET.get("q")
        if query:
            queryset = queryset.filter(
                Q(customer_name__icontains=query) |
                Q(customer_email__icontains=query) |
                Q(service_name__icontains=query) |
                Q(location__icontains=query)
            )

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["status_choices"] = Booking.Status.choices
        context["current_status"] = self.request.GET.get("status", "")
        context["search_query"] = self.request.GET.get("q", "")
        return context


class StaffBookingDetailView(StaffRequiredMixin, DetailView):
    """Staff booking detail with status update."""
    model = Booking
    template_name = "bookings/staff_detail.html"
    context_object_name = "booking"

    def get_queryset(self):
        # The whole point of this override: a technician reaching the detail URL
        # by guessing an id gets a 404, exactly as if the booking did not
        # exist. It covers the POST too — `post()` calls `self.get_object()`,
        # so a status change on someone else's job is refused at the same
        # place a read of it is.
        return staff_assignable_bookings(self.request.user)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["status_form"] = BookingStatusUpdateForm(instance=self.object)
        context["status_history"] = self.object.status_history.all()
        return context

    def post(self, request, *args, **kwargs):
        booking = self.get_object()
        form = BookingStatusUpdateForm(request.POST, instance=booking)
        if form.is_valid():
            old_status = booking.status
            new_status = form.cleaned_data["status"]
            booking = form.save()

            if old_status != new_status:
                BookingStatusHistory.objects.create(
                    booking=booking,
                    previous_status=old_status,
                    new_status=new_status,
                    changed_by=request.user,
                    notes=form.cleaned_data.get("notes", ""),
                )
                messages.success(request, f"Booking status updated to {booking.get_status_display()}.")
            else:
                messages.info(request, "Booking updated.")

            return redirect("bookings:staff_detail", pk=booking.pk)

        context = self.get_context_data()
        context["status_form"] = form
        return self.render_to_response(context)