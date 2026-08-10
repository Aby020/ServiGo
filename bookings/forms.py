"""
Forms for the bookings app.
"""
from django import forms
from django.utils import timezone
from .models import Booking


class BookingForm(forms.ModelForm):
    """Form for creating a service booking."""

    preferred_date = forms.DateField(
        widget=forms.DateInput(attrs={
            "class": "form-control",
            "type": "date",
            "min": timezone.now().date().isoformat(),
        })
    )
    preferred_time = forms.TimeField(
        widget=forms.TimeInput(attrs={
            "class": "form-control",
            "type": "time",
        })
    )
    location = forms.CharField(
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "e.g., Kochi, Ernakulam",
        })
    )
    address = forms.CharField(
        widget=forms.Textarea(attrs={
            "class": "form-control",
            "rows": 3,
            "placeholder": "Full address with landmarks",
        })
    )
    notes = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            "class": "form-control",
            "rows": 3,
            "placeholder": "Any special instructions or notes (optional)",
        })
    )

    class Meta:
        model = Booking
        fields = ("preferred_date", "preferred_time", "location", "address", "notes")

    def clean_preferred_date(self):
        date = self.cleaned_data.get("preferred_date")
        if date and date < timezone.now().date():
            raise forms.ValidationError("Preferred date cannot be in the past.")
        return date


class BookingStatusUpdateForm(forms.ModelForm):
    """Form for staff to update booking status."""

    class Meta:
        model = Booking
        fields = ("status", "assigned_staff", "notes")
        widgets = {
            "status": forms.Select(attrs={"class": "form-select"}),
            "assigned_staff": forms.Select(attrs={"class": "form-select"}),
            "notes": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import User
        self.fields["assigned_staff"].queryset = User.objects.filter(role=User.Role.STAFF)