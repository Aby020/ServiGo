"""
Views for the core app.
"""
from django.shortcuts import render, redirect
from django.contrib import messages
from django.views.generic import TemplateView, FormView
from django.core.mail import send_mail
from django.conf import settings
from django.utils.translation import gettext_lazy as _

from .models import ContactMessage, SiteSettings
from .forms import ContactForm
from services.models import Service, ServiceCategory
from ev_charging.models import EVChargingStation


class HomeView(TemplateView):
    """Homepage view."""
    template_name = "home/index.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["featured_services"] = Service.objects.filter(
            is_available=True, is_featured=True
        ).select_related("category")[:6]

        context["categories"] = ServiceCategory.objects.filter(is_active=True).prefetch_related("services")

        context["ev_stations_count"] = EVChargingStation.objects.filter(is_active=True).count()
        context["site_settings"] = SiteSettings.get_settings()
        return context


class AboutView(TemplateView):
    """About page."""
    template_name = "core/about.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["site_settings"] = SiteSettings.get_settings()
        return context


class ContactView(FormView):
    """Contact page with form."""
    template_name = "core/contact.html"
    form_class = ContactForm
    success_url = "/contact/"

    def form_valid(self, form):
        contact_message = form.save()

        # Send notification email to admin
        try:
            site_settings = SiteSettings.get_settings()
            subject = f"New Contact Message: {contact_message.get_subject_display()}"
            message = f"""
New contact message received:

Name: {contact_message.name}
Email: {contact_message.email}
Phone: {contact_message.phone or 'Not provided'}
Subject: {contact_message.get_subject_display()}

Message:
{contact_message.message}
            """
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [site_settings.contact_email],
                fail_silently=True,
            )
        except Exception:
            pass

        # Send auto-reply to user
        try:
            subject = "Thank you for contacting ServiGo"
            message = f"""
Dear {contact_message.name},

Thank you for reaching out to ServiGo! We've received your message and will get back to you within 24 hours.

Your message summary:
Subject: {contact_message.get_subject_display()}
Message: {contact_message.message[:200]}...

If you have any urgent queries, please call us at {SiteSettings.get_settings().contact_phone}.

Best regards,
The ServiGo Team
            """
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [contact_message.email],
                fail_silently=True,
            )
        except Exception:
            pass

        messages.success(self.request, "Thank you for your message! We'll get back to you soon.")
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["site_settings"] = SiteSettings.get_settings()
        return context


# Error handlers
def handler404(request, exception):
    """Custom 404 handler."""
    return render(request, "errors/404.html", status=404)


def handler403(request, exception):
    """Custom 403 handler."""
    return render(request, "errors/403.html", status=403)


def handler500(request):
    """Custom 500 handler."""
    return render(request, "errors/500.html", status=500)