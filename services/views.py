
"""
Views for services app.
"""
from django.shortcuts import render, get_object_or_404
from django.db.models import Q
from django.core.paginator import Paginator
from django.views.generic import ListView, DetailView

from .models import ServiceCategory, Service


class ServiceListView(ListView):
    """List all services with search and filtering."""
    model = Service
    template_name = "services/list.html"
    context_object_name = "services"
    paginate_by = 12

    def get_queryset(self):
        queryset = Service.objects.filter(is_available=True).select_related("category")

        # Search
        query = self.request.GET.get("q")
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(short_description__icontains=query) |
                Q(description__icontains=query) |
                Q(category__name__icontains=query)
            )

        # Category filter
        category_slug = self.request.GET.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        # Featured filter
        if self.request.GET.get("featured") == "1":
            queryset = queryset.filter(is_featured=True)

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["categories"] = ServiceCategory.objects.filter(is_active=True)
        context["current_category"] = self.request.GET.get("category", "")
        context["search_query"] = self.request.GET.get("q", "")
        context["show_featured"] = self.request.GET.get("featured") == "1"
        return context


class ServiceDetailView(DetailView):
    """Service detail view."""
    model = Service
    template_name = "services/detail.html"
    context_object_name = "service"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        return Service.objects.filter(is_available=True).select_related("category")

    def get_object(self, queryset=None):
        if queryset is None:
            queryset = self.get_queryset()
        category_slug = self.kwargs.get("category_slug")
        slug = self.kwargs.get("slug")
        return get_object_or_404(queryset, category__slug=category_slug, slug=slug)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        service = self.object
        # Related services from same category
        context["related_services"] = Service.objects.filter(
            category=service.category,
            is_available=True
        ).exclude(pk=service.pk)[:4]
        return context


def category_detail(request, slug):
    """View for a specific service category."""
    category = get_object_or_404(ServiceCategory, slug=slug, is_active=True)
    services = Service.objects.filter(category=category, is_available=True)
    categories = ServiceCategory.objects.filter(is_active=True)

    context = {
        "category": category,
        "services": services,
        "categories": categories,
    }
    return render(request, "services/category_detail.html", context)

from django.shortcuts import render, redirect
from .models import *
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.mail import send_mail
from django.conf import settings
from django.views.decorators.cache import cache_page

@cache_page(300)
def service(request):
    service_data = {
        "plum_data": Plumbers.objects.all(),
        "electrical_data": Electricians.objects.all(),
        "tv_data": SmartTv.objects.all(),
        "charging_station_data": Add_Charging_Station.objects.all(),
    }
    return render(request, "service.html", service_data)


def success_booking(request):
    return render(request, "success_booking.html")


@login_required(login_url="sign_in")
def electric_service_booking(request, pk):
    electric_service_data = {
        "electric_data": Electricians.objects.get(pk=pk),
    }
    return render(request, "elec_service_booking.html", electric_service_data)


@login_required(login_url="sign_in")
def electrical_service_booking(request):
    if request.method == "POST":
        try:
            booking_name = request.POST.get("name")
            booking_email = request.POST.get("email")
            booking_phone = request.POST.get("phone")
            booking_location = request.POST.get("location")
            booking_service = request.POST.get("service")
            booking_price = request.POST.get("price")
            booking_address = request.POST.get("address")
            booking_data = Electrical_service_booking.objects.create(
                booking_name=booking_name,
                booking_email=booking_email,
                booking_phone=booking_phone,
                booking_location=booking_location,
                booking_service=booking_service,
                booking_price=booking_price,
                booking_address=booking_address,
            )
            booking_data.save()
            subject = "NanoServ Electrical service booking"
            message = f"Dear {booking_name},\nYou are successfully booked our Electrical Service with NanoServ. Our service advisor will verify your documents and get in touch with you.\nHere are your service details:\n\tName: {booking_name}\n\tEmail:{booking_email}\n\tPhone Number: {booking_phone}\n\tAddress: {booking_address}\n\tLocation: {booking_location}\n\tService Name :{booking_service}\nPlease keep this email for your records and do not forward or share any other person.\nTo get started, please visit our website at https://127.0.0.1:8000/ and use our services.\nFor more details login with NanoServ."
            recipient = booking_email
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient],
                fail_silently=False,
            )
            success_msg = "Successfully Booked"
            messages.success(request, success_msg)
            return redirect("success_booking")
        except Exception as e:
            error_mg = "oops!!"
            messages.error(request, error_mg)
            return redirect("success_booking")


@login_required(login_url="sign_in")
def plum_service_booking(request, pk):
    plum_service_data = {
        "plumbing_data": Plumbers.objects.get(pk=pk),
    }
    return render(request, "plum_service_booking.html", plum_service_data)


@login_required(login_url="sign_in")
def plumbing_service_booking(request):
    if request.method == "POST":
        try:
            booking_name = request.POST.get("name")
            booking_email = request.POST.get("email")
            booking_phone = request.POST.get("phone")
            booking_location = request.POST.get("location")
            booking_service = request.POST.get("service")
            booking_price = request.POST.get("price")
            booking_address = request.POST.get("address")
            booking_data = Plumbing_service_booking.objects.create(
                booking_name=booking_name,
                booking_email=booking_email,
                booking_phone=booking_phone,
                booking_location=booking_location,
                booking_service=booking_service,
                booking_price=booking_price,
                booking_address=booking_address,
            )
            booking_data.save()
            subject = "NanoServ Plumbing service booking"
            message = f"Dear {booking_name},\nYou are successfully booked our Plumbing Service with NanoServ. Our service advisor will verify your documents and get in touch with you.\nHere are your service details:\n\tName: {booking_name}\n\tEmail:{booking_email}\n\tPhone Number: {booking_phone}\n\tAddress: {booking_address}\n\tLocation: {booking_location}\n\tService Name :{booking_service}\nPlease keep this email for your records and do not forward or share any other person.\nTo get started, please visit our website at https://127.0.0.1:8000/ and use our services.\nFor more details login with NanoServ."
            recipient = booking_email
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient],
                fail_silently=False,
            )
            success_msg = "Successfully Booked"
            messages.success(request, success_msg)
            return redirect("success_booking")
        except Exception as e:
            error_mg = "oops!!"
            messages.error(request, error_mg)
            return redirect("success_booking")


@login_required(login_url="sign_in")
def tv_service_booking(request, pk):
    smartTv_service_data = {
        "smart_tv_data": SmartTv.objects.get(pk=pk),
    }
    return render(request, "tv_service_booking.html", smartTv_service_data)


@login_required(login_url="sign_in")
def SmartTv_service_booking(request):
    if request.method == "POST":
        try:
            booking_name = request.POST.get("name")
            booking_email = request.POST.get("email")
            booking_phone = request.POST.get("phone")
            booking_location = request.POST.get("location")
            booking_service = request.POST.get("service")
            booking_price = request.POST.get("price")
            booking_address = request.POST.get("address")
            booking_data = smartTv_service_booking.objects.create(
                booking_name=booking_name,
                booking_email=booking_email,
                booking_phone=booking_phone,
                booking_location=booking_location,
                booking_service=booking_service,
                booking_price=booking_price,
                booking_address=booking_address,
            )
            booking_data.save()
            subject = "NanoServ Smart TV service booking"
            message = f"Dear {booking_name},\nYou are successfully booked our Smart TV service with NanoServ. Our service advisor will verify your documents and get in touch with you.\nHere are your service details:\n\tName: {booking_name}\n\tEmail:{booking_email}\n\tPhone Number: {booking_phone}\n\tAddress: {booking_address}\n\tLocation: {booking_location}\n\tService Name :{booking_service}\nPlease keep this email for your records and do not forward or share any other person.\nTo get started, please visit our website at https://127.0.0.1:8000/ and use our services.\nFor more details login with NanoServ."
            recipient = booking_email
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient],
                fail_silently=False,
            )
            success_msg = "Successfully Booked"
            messages.success(request, success_msg)
            return redirect("success_booking")
        except Exception as e:
            error_mg = "oops!!"
            messages.error(request, error_mg)
            return redirect("success_booking")
     
        
@login_required(login_url="sign_in")     
def Book_charging_station(request, pk):
    charging_station_data = {
        "charging_station_data": Add_Charging_Station.objects.get(pk=pk),
    }
    return render(request, 'book_electric_station.html', charging_station_data)


@login_required(login_url="sign_in")
def Booking_charging_station(request):
    if request.method == "POST":
        try:
            booking_name = request.POST.get("name")
            booking_email = request.POST.get("email")
            booking_phone = request.POST.get("phone")
            station_location = request.POST.get("location")
            station_name = request.POST.get("station")
            station_price = request.POST.get("price")
            booking_data = Charging_station_booking.objects.create(
                booking_name=booking_name,
                booking_email=booking_email,
                booking_phone_no=booking_phone,
                station_location=station_location,
                station_name=station_name,
                station_price=station_price,
            )
            booking_data.save()
            subject = "NanoServ Charging Station Booking"
            message = f"Dear {booking_name},\nYou are successfully booked your Charging slot with NanoServ. Our service advisor will hold your slot and get in touch with you.\nHere are your service details:\n\tName: {booking_name}\n\tEmail:{booking_email}\n\tPhone Number: {booking_phone}\n\tLocation: {station_location}\n\tService Name :{station_name}\nPlease keep this email for your records and do not forward or share any other person.\nTo get started, please visit our website at https://127.0.0.1:8000/ and use our services.\nFor more details login with NanoServ."
            recipient = booking_email
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient],
                fail_silently=True,
            )
            success_msg = "Successfully Booked"
            messages.success(request, success_msg)
            return redirect("success_booking")
        except Exception as e:
            error_mg = "oops!!"
            messages.error(request, error_mg)
            return redirect("success_booking")



