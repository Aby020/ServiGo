"""
Forms for accounts app.
"""
from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from .models import (
    ALLOWED_PROFILE_IMAGE_EXTENSIONS,
    User,
    StaffProfile,
    CustomerProfile,
    validate_profile_image_size,
)


class UserRegistrationForm(UserCreationForm):
    """
    Form for public user registration.

    Privilege guard
    ---------------
    There is no ``role`` field. Self-registration provisions exactly one kind of
    account — a customer — and the role is assigned from the constant in
    :meth:`save` rather than from any submitted value. An earlier version
    offered a dropdown, which meant anyone could POST ``role=staff`` and land on
    the technician dashboard; the dropdown also existed in the template, so
    removing the widget alone would not have closed it.

    Technicians and admins are provisioned by an admin
    (``api.views.AdminStaffCreateSerializer``, the Django admin, or the seed
    commands), never by the public signup form. The REST equivalent,
    ``api.serializers.RegisterSerializer``, hardcodes the role the same way.
    """

    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={
            "class": "form-control",
            "placeholder": "Enter your email",
        })
    )
    username = forms.CharField(
        required=True,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Choose a username",
        })
    )
    password1 = forms.CharField(
        label="Password",
        widget=forms.PasswordInput(attrs={
            "class": "form-control",
            "placeholder": "Create a password",
        })
    )
    password2 = forms.CharField(
        label="Confirm Password",
        widget=forms.PasswordInput(attrs={
            "class": "form-control",
            "placeholder": "Confirm your password",
        })
    )
    phone = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Phone number (optional)",
        })
    )

    class Meta:
        model = User
        fields = ("username", "email", "phone", "password1", "password2")

    def clean_email(self):
        email = self.cleaned_data.get("email")
        if User.objects.filter(email=email).exists():
            raise forms.ValidationError("A user with this email already exists.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        # Server-assigned, never client-influenced. See the class docstring.
        user.role = User.Role.CUSTOMER
        user.phone = self.cleaned_data["phone"]
        if commit:
            user.save()
            CustomerProfile.objects.get_or_create(user=user)
        return user


class UserLoginForm(AuthenticationForm):
    """Form for user login."""

    username = forms.CharField(
        label="Email or Username",
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Enter email or username",
            "autofocus": True,
        })
    )
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput(attrs={
            "class": "form-control",
            "placeholder": "Enter your password",
        })
    )


class UserProfileForm(forms.ModelForm):
    """Form for updating user profile."""

    class Meta:
        model = User
        fields = ("first_name", "last_name", "email", "phone", "address", "city", "state", "pincode", "profile_image")
        widgets = {
            "first_name": forms.TextInput(attrs={"class": "form-control", "placeholder": "First name"}),
            "last_name": forms.TextInput(attrs={"class": "form-control", "placeholder": "Last name"}),
            "email": forms.EmailInput(attrs={"class": "form-control", "placeholder": "Email"}),
            "phone": forms.TextInput(attrs={"class": "form-control", "placeholder": "Phone number"}),
            "address": forms.Textarea(attrs={"class": "form-control", "rows": 3, "placeholder": "Full address"}),
            "city": forms.TextInput(attrs={"class": "form-control", "placeholder": "City"}),
            "state": forms.TextInput(attrs={"class": "form-control", "placeholder": "State"}),
            "pincode": forms.TextInput(attrs={"class": "form-control", "placeholder": "PIN code"}),
            "profile_image": forms.FileInput(attrs={
                "class": "form-control",
                "accept": ",".join(
                    f".{ext}" for ext in ALLOWED_PROFILE_IMAGE_EXTENSIONS
                ),
            }),
        }

    def clean_profile_image(self):
        """
        Reject an oversized upload, and say so on the field.

        The same rule is a model validator (so the admin and any direct
        construction are covered too), but a ModelForm's model validation
        reports through ``non_field_errors`` — the message would render in the
        summary block with no indication that the picture was the problem.
        Running it here as well puts the error on the file input itself.
        """
        image = self.cleaned_data.get("profile_image")
        if image:
            validate_profile_image_size(image)
        return image

    def clean_email(self):
        email = self.cleaned_data.get("email")
        if User.objects.filter(email=email).exclude(pk=self.instance.pk).exists():
            raise forms.ValidationError("A user with this email already exists.")
        return email


class StaffProfileForm(forms.ModelForm):
    """Form for staff profile."""

    class Meta:
        model = StaffProfile
        fields = ("specialization", "experience_years", "hourly_rate", "bio", "certifications", "working_radius_km")
        widgets = {
            "specialization": forms.TextInput(attrs={"class": "form-control", "placeholder": "e.g., Electrical, Plumbing"}),
            "experience_years": forms.NumberInput(attrs={"class": "form-control", "min": 0}),
            "hourly_rate": forms.NumberInput(attrs={"class": "form-control", "step": "0.01", "min": 0}),
            "bio": forms.Textarea(attrs={"class": "form-control", "rows": 4, "placeholder": "Tell us about yourself"}),
            "certifications": forms.Textarea(attrs={"class": "form-control", "rows": 3, "placeholder": "List your certifications"}),
            "working_radius_km": forms.NumberInput(attrs={"class": "form-control", "min": 1}),
        }


class CustomerProfileForm(forms.ModelForm):
    """Form for customer profile."""

    class Meta:
        model = CustomerProfile
        fields = ("date_of_birth", "preferred_payment_method")
        widgets = {
            "date_of_birth": forms.DateInput(attrs={"class": "form-control", "type": "date"}),
            "preferred_payment_method": forms.TextInput(attrs={"class": "form-control", "placeholder": "e.g., Card, UPI, Cash"}),
        }