from django.shortcuts import render, redirect
from .models import Contact
from django.contrib import messages
from django.core.mail import send_mail
from django.conf import settings
from django.views.decorators.cache import cache_page

# Create your views here.
def index(request):
    return render(request, "index.html")


def about_us(request):
    return render(request, "about.html")


def blog(request):
    return render(request, "blog.html")

@cache_page(300)
def privacy_policy(request):
    return render(request, "privacy-policy.html")


def contact(request):
    if request.method == "POST":
        try:
            name = request.POST.get("name")
            email = request.POST.get("email")
            phone = request.POST.get("phone")
            service = request.POST.get("service")
            msg = request.POST.get("msg")
            contact_data = Contact.objects.create(
                name=name, email=email, phone=phone, service=service, message=msg
            )
            contact_data.save()
            subject = "NanoServ Services"
            message = f"Dear {name},\nThank You for your feedback with NanoServ. Our services will help you to fix your home appliance problem. Our advisor will verify your complements and get in touch with you.\nPlease keep this email for your records and do not forward or share any other person.\nTo get started, please visit our website at https://127.0.0.1:8000/ and use our services.\nFor more details login with NanoServ."
            recipient = email
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient],
                fail_silently=False,
            )
            success_msg = "Successfully submitted"
            messages.success(request, success_msg)
            return redirect("contact")
        except Exception as e:
            error_msg = "Server Unreachable"
            messages.error(request, error_msg)
            return redirect("contact")
    return render(request, "contact.html")
