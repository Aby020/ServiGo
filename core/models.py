"""
Models for the core app.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _


class ContactMessage(models.Model):
    """
    Contact form messages from visitors.
    """

    class Subject(models.TextChoices):
        GENERAL = "general", _("General Inquiry")
        BOOKING = "booking", _("Booking Related")
        EV_CHARGING = "ev_charging", _("EV Charging")
        COMPLAINT = "complaint", _("Complaint")
        FEEDBACK = "feedback", _("Feedback")
        PARTNERSHIP = "partnership", _("Partnership")
        OTHER = "other", _("Other")

    name = models.CharField(_("name"), max_length=100)
    email = models.EmailField(_("email"))
    phone = models.CharField(_("phone"), max_length=20, blank=True)
    subject = models.CharField(
        _("subject"),
        max_length=20,
        choices=Subject.choices,
        default=Subject.GENERAL,
    )
    message = models.TextField(_("message"))
    is_read = models.BooleanField(_("read"), default=False)
    is_replied = models.BooleanField(_("replied"), default=False)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("contact message")
        verbose_name_plural = _("contact messages")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} - {self.get_subject_display()}"


class SiteSettings(models.Model):
    """
    Singleton model for site-wide settings.
    """
    site_name = models.CharField(_("site name"), max_length=100, default="ServiGo")
    site_tagline = models.CharField(_("site tagline"), max_length=200, default="Your trusted home services partner")
    contact_email = models.EmailField(_("contact email"), default="support@servigo.com")
    contact_phone = models.CharField(_("contact phone"), max_length=20, default="+91 98765 43210")
    address = models.TextField(_("address"), blank=True)
    facebook_url = models.URLField(_("Facebook URL"), blank=True)
    twitter_url = models.URLField(_("Twitter URL"), blank=True)
    instagram_url = models.URLField(_("Instagram URL"), blank=True)
    linkedin_url = models.URLField(_("LinkedIn URL"), blank=True)
    youtube_url = models.URLField(_("YouTube URL"), blank=True)
    maintenance_mode = models.BooleanField(_("maintenance mode"), default=False)
    maintenance_message = models.TextField(_("maintenance message"), blank=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("site settings")
        verbose_name_plural = _("site settings")

    def __str__(self):
        return "Site Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_settings(cls):
        settings, created = cls.objects.get_or_create(pk=1)
        return settings