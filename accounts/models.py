"""
Custom User model and related models for ServiGo.
"""
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    """
    Custom user model for ServiGo with role-based access.
    """

    class Role(models.TextChoices):
        CUSTOMER = "customer", _("Customer")
        STAFF = "staff", _("Staff / Service Provider")
        ADMIN = "admin", _("Admin")

    email = models.EmailField(_("email address"), unique=True)
    role = models.CharField(
        _("role"),
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
    )
    phone = models.CharField(_("phone number"), max_length=20, blank=True)
    address = models.TextField(_("address"), blank=True)
    city = models.CharField(_("city"), max_length=100, blank=True)
    state = models.CharField(_("state"), max_length=100, blank=True)
    pincode = models.CharField(_("pincode"), max_length=10, blank=True)
    profile_image = models.ImageField(
        _("profile image"),
        upload_to="profiles/",
        blank=True,
        null=True,
    )
    is_verified = models.BooleanField(_("verified"), default=False)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    @property
    def is_customer(self):
        return self.role == self.Role.CUSTOMER

    @property
    def is_staff_user(self):
        return self.role == self.Role.STAFF

    @property
    def is_admin_user(self):
        return self.role == self.Role.ADMIN

    def get_full_name(self):
        """Return the user's full name or username if not set."""
        full_name = super().get_full_name()
        return full_name if full_name else self.username

    def get_short_name(self):
        """Return the user's first name or username."""
        return self.first_name if self.first_name else self.username


class StaffProfile(models.Model):
    """
    Extended profile for staff/service providers.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        verbose_name=_("user"),
    )
    employee_id = models.CharField(_("employee ID"), max_length=20, unique=True)
    specialization = models.CharField(_("specialization"), max_length=100, blank=True)
    experience_years = models.PositiveIntegerField(_("experience years"), default=0)
    hourly_rate = models.DecimalField(
        _("hourly rate"),
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    is_available = models.BooleanField(_("available"), default=True)
    rating = models.DecimalField(
        _("rating"),
        max_digits=3,
        decimal_places=2,
        default=0.00,
    )
    total_jobs = models.PositiveIntegerField(_("total jobs"), default=0)
    bio = models.TextField(_("bio"), blank=True)
    certifications = models.TextField(_("certifications"), blank=True)
    working_radius_km = models.PositiveIntegerField(
        _("working radius (km)"),
        default=25,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("staff profile")
        verbose_name_plural = _("staff profiles")

    def save(self, *args, **kwargs):
        if not self.employee_id:
            self.employee_id = self._generate_employee_id()
        super().save(*args, **kwargs)

    def _generate_employee_id(self):
        """Generate a unique employee ID, e.g. SG-1042."""
        prefix = "SG"
        base = 1000
        last = (
            type(self).objects.filter(employee_id__startswith=f"{prefix}-")
            .order_by("-employee_id")
            .values_list("employee_id", flat=True)
            .first()
        )
        if last:
            try:
                base = int(last.split("-")[-1]) + 1
            except ValueError:
                pass
        while type(self).objects.filter(employee_id=f"{prefix}-{base}").exists():
            base += 1
        return f"{prefix}-{base}"

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.employee_id})"


class CustomerProfile(models.Model):
    """
    Extended profile for customers.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="customer_profile",
        verbose_name=_("user"),
    )
    date_of_birth = models.DateField(_("date of birth"), null=True, blank=True)
    preferred_payment_method = models.CharField(
        _("preferred payment method"),
        max_length=50,
        blank=True,
    )
    loyalty_points = models.PositiveIntegerField(_("loyalty points"), default=0)
    total_bookings = models.PositiveIntegerField(_("total bookings"), default=0)
    total_spent = models.DecimalField(
        _("total spent"),
        max_digits=12,
        decimal_places=2,
        default=0.00,
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("customer profile")
        verbose_name_plural = _("customer profiles")

    def __str__(self):
        return f"{self.user.get_full_name()}"