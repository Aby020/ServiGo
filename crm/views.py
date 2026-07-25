from django.shortcuts import render
from account_manager.decorators import allowed_users
from services.models import *
from django.contrib.auth.models import User
from themes.models import Contact
from django.db.models import Q
from django.contrib import messages
from django.views.decorators.cache import cache_page

@cache_page(300)
@allowed_users(allowed_roles=["admin"])
def index(request):
    # Total number of service booking
    electric_service_booking = Electrical_service_booking.objects.all()
    plumbing_service_booking = Plumbing_service_booking.objects.all()
    smart_tv_service_booking = smartTv_service_booking.objects.all()
    charging_slot_booking = Charging_station_booking.objects.all()
    total_electric_service_booking = electric_service_booking.count()
    total_plumbing_service_booking = plumbing_service_booking.count()
    total_smart_tv_service_booking = smart_tv_service_booking.count()
    total_charging_slot_booking = charging_slot_booking.count()
    # Total number of customers
    admin = 2
    customers = User.objects.all()
    customers_count = customers.count()
    total_customers = customers_count - admin
    # Total number of customer feedback
    feedback = Contact.objects.all()
    total_feedback = feedback.count()

    total_data = {
        "total_elec_booking": total_electric_service_booking,
        "total_plum_booking": total_plumbing_service_booking,
        "total_tv_booking": total_smart_tv_service_booking,
        "total_charging_slot": total_charging_slot_booking,
        "total_customers": total_customers,
        "total_feedbacks": total_feedback,
        "feedbacks": feedback,
        "elec_data": Electricians.objects.all(),
        "plum_data": Plumbers.objects.all(),
        "tv_data": SmartTv.objects.all(),
        "station_data": Add_Charging_Station.objects.all(),
    }
    return render(request, "crm_templates/index.html", total_data)


@allowed_users(allowed_roles=["admin"])
def electrical_dashboard(request):
    electrical_service = {
        "electrical_data": Electrical_service_booking.objects.all(),
    }
    return render(
        request, "crm_templates/electrical_dashboard.html", electrical_service
    )


@allowed_users(allowed_roles=["admin"])
def plumbing_dashboard(request):
    plumbing_service = {
        "plumbing_data": Plumbing_service_booking.objects.all(),
    }
    return render(request, "crm_templates/plumbing_dashboard.html", plumbing_service)


@allowed_users(allowed_roles=["admin"])
def smart_tv_dashboard(request):
    tv_service = {
        "smart_tv_data": smartTv_service_booking.objects.all(),
    }
    return render(request, "crm_templates/smart_tv_dashboard.html", tv_service)


@allowed_users(allowed_roles=["admin"])
def charging_station_dashboard(request):
    station_slots = {
        "station_data": Charging_station_booking.objects.all(),
    }
    return render(request, "crm_templates/charging_station_dashboard.html", station_slots)


@allowed_users(allowed_roles=["admin"])
def customer_feedback(request):
    customer_feedback = {
        "feedbacks": Contact.objects.all(),
    }
    return render(request, "crm_templates/customer_feedback.html", customer_feedback)

@cache_page(300)
@allowed_users(allowed_roles=["admin"])
def customer_searching(request):
    if request.method == "POST":
        searching_data = request.POST.get("data")
        if searching_data != None:
            search_result = User.objects.filter(
                Q(username__icontains=searching_data)
                | Q(email__icontains=searching_data)
                | Q(id__icontains=searching_data)
            )
            return render(
                request,
                "crm_templates/searching.html",
                {"searching_data": search_result},
            )
    else:
        error_msg = "Customer Not Found"
        messages.error(request, error_msg)
        return render(request, "crm_templates/searching.html")
    return render(request, "crm_templates/searching.html")
