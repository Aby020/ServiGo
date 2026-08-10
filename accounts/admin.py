"""
Admin configuration for the accounts app.
"""
from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.utils.translation import gettext_lazy as _

from .models import User, StaffProfile, CustomerProfile


class ServiGoUserCreationForm(UserCreationForm):
    """User creation form bound to the custom User model."""

    email = forms.EmailField(required=True)
    role = forms.ChoiceField(choices=User.Role.choices, initial=User.Role.CUSTOMER)

    class Meta:
        model = User
        fields = ("username", "email", "role", "password1", "password2")

    def clean_email(self):
        email = self.cleaned_data.get("email")
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError("A user with this email already exists.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.role = self.cleaned_data["role"]
        if commit:
            user.save()
            if user.role == User.Role.CUSTOMER:
                CustomerProfile.objects.get_or_create(user=user)
            elif user.role == User.Role.STAFF:
                StaffProfile.objects.get_or_create(user=user)
        return user


class ServiGoUserChangeForm(UserChangeForm):
    """User change form bound to the custom User model."""

    class Meta:
        model = User
        fields = ("username", "email", "role")


class StaffProfileInline(admin.StackedInline):
    """Inline editor for staff profiles."""
    model = StaffProfile
    extra = 0
    can_delete = False
    fields = (
        "employee_id", "specialization", "experience_years", "hourly_rate",
        "working_radius_km", "is_available", "rating", "total_jobs", "bio",
        "certifications",
    )


class CustomerProfileInline(admin.StackedInline):
    """Inline editor for customer profiles."""
    model = CustomerProfile
    extra = 0
    can_delete = False
    fields = (
        "date_of_birth", "preferred_payment_method",
        "loyalty_points", "total_bookings", "total_spent",
    )


class UserAdmin(DjangoUserAdmin):
    """Admin for the custom User model (email login)."""

    list_display = (
        "email", "username", "role", "is_verified", "is_active",
        "is_staff", "date_joined",
    )
    list_filter = ("role", "is_verified", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "username", "first_name", "last_name", "phone")
    ordering = ("-date_joined",)
    inlines = (StaffProfileInline, CustomerProfileInline)

    add_form = ServiGoUserCreationForm
    form = ServiGoUserChangeForm
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("username", "email", "role", "password1", "password2"),
        }),
    )
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Personal info"), {"fields": ("username", "first_name", "last_name", "phone")}),
        (_("Address"), {"fields": ("address", "city", "state", "pincode")}),
        (_("ServiGo"), {"fields": ("role", "is_verified", "profile_image")}),
        (
            _("Permissions"),
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined", "created_at", "updated_at")}),
    )
    readonly_fields = ("last_login", "date_joined", "created_at", "updated_at")


admin.site.register(User, UserAdmin)
admin.site.register(StaffProfile)
admin.site.register(CustomerProfile)
