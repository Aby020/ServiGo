"""
Models for the services app - Service categories and services.
"""
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.urls import reverse


class ServiceCategory(models.Model):
    """
    Categories for services (Electrical, Plumbing, Smart TV, EV Charging).
    """
    name = models.CharField(_("name"), max_length=100, unique=True)
    slug = models.SlugField(_("slug"), max_length=100, unique=True)
    description = models.TextField(_("description"), blank=True)
    icon = models.CharField(_("icon class"), max_length=50, blank=True, help_text="Bootstrap icon class")
    image = models.ImageField(_("category image"), upload_to="categories/", blank=True, null=True)
    is_active = models.BooleanField(_("active"), default=True)
    display_order = models.PositiveIntegerField(_("display order"), default=0)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("service category")
        verbose_name_plural = _("service categories")
        ordering = ["display_order", "name"]

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse("services:category_detail", kwargs={"slug": self.slug})


class Service(models.Model):
    """
    Individual services offered by ServiGo.
    """
    category = models.ForeignKey(
        ServiceCategory,
        on_delete=models.CASCADE,
        related_name="services",
        verbose_name=_("category"),
    )
    name = models.CharField(_("name"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=200)
    short_description = models.TextField(_("short description"), max_length=500)
    description = models.TextField(_("description"))
    price = models.DecimalField(_("price"), max_digits=10, decimal_places=2)
    estimated_duration = models.PositiveIntegerField(
        _("estimated duration (minutes)"),
        help_text="Estimated duration in minutes",
    )
    image = models.ImageField(_("service image"), upload_to="services/", blank=True, null=True)
    what_included = models.TextField(_("what's included"), blank=True, help_text="One item per line")
    is_available = models.BooleanField(_("available"), default=True)
    is_featured = models.BooleanField(_("featured"), default=False)
    display_order = models.PositiveIntegerField(_("display order"), default=0)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("service")
        verbose_name_plural = _("services")
        ordering = ["category__display_order", "display_order", "name"]
        unique_together = [["category", "slug"]]

    def __str__(self):
        return f"{self.name} ({self.category.name})"

    def get_absolute_url(self):
        return reverse("services:detail", kwargs={"category_slug": self.category.slug, "slug": self.slug})

    def get_formatted_price(self):
        """Return formatted price with currency symbol."""
        return f"₹{self.price:,.2f}"

    def get_what_included_list(self):
        """Return what's included as a list."""
        return [item.strip() for item in self.what_included.split("\n") if item.strip()]