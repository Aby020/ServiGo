"""
Forms for the EV charging app.
"""
from django import forms
from django.utils import timezone
from .models import EVChargingStation, EVChargingBooking


class EVStationSearchForm(forms.Form):
    """Form for searching EV charging stations."""

    location = forms.CharField(
        required=False,
        widget=forms.TextInput(attrs={
            "class": "form-control",
            "placeholder": "Search by city, area, or address...",
        })
    )
    charger_type = forms.ChoiceField(
        required=False,
        choices=[("", "All Types")] + list(EVChargingStation.ChargerType.choices),
        widget=forms.Select(attrs={"class": "form-select"}),
    )
    max_price = forms.DecimalField(
        required=False,
        max_digits=6,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            "class": "form-control",
            "placeholder": "Max ₹/kWh",
            "step": "0.50",
            "min": "0",
        })
    )
    available_only = forms.BooleanField(
        required=False,
        initial=True,
        widget=forms.CheckboxInput(attrs={"class": "form-check-input"}),
    )


class EVBookingForm(forms.ModelForm):
    """Form for creating an EV charging booking."""

    booking_date = forms.DateField(
        widget=forms.DateInput(attrs={
            "class": "form-control",
            "type": "date",
            "min": timezone.now().date().isoformat(),
        })
    )
    start_time = forms.TimeField(
        widget=forms.TimeInput(attrs={
            "class": "form-control",
            "type": "time",
        })
    )
    end_time = forms.TimeField(
        widget=forms.TimeInput(attrs={
            "class": "form-control",
            "type": "time",
        })
    )
    estimated_kwh = forms.DecimalField(
        max_digits=6,
        decimal_places=2,
        widget=forms.NumberInput(attrs={
            "class": "form-control",
            "step": "0.1",
            "min": "1",
            "placeholder": "Estimated kWh needed",
        })
    )
    notes = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            "class": "form-control",
            "rows": 3,
            "placeholder": "Any special instructions (optional)",
        })
    )

    class Meta:
        model = EVChargingBooking
        fields = ("booking_date", "start_time", "end_time", "estimated_kwh", "notes")

    def __init__(self, *args, **kwargs):
        self.station = kwargs.pop("station", None)
        super().__init__(*args, **kwargs)

    def clean(self):
        cleaned_data = super().clean()
        start_time = cleaned_data.get("start_time")
        end_time = cleaned_data.get("end_time")
        booking_date = cleaned_data.get("booking_date")

        if start_time and end_time and start_time >= end_time:
            raise forms.ValidationError("End time must be after start time.")

        if booking_date and booking_date < timezone.now().date():
            raise forms.ValidationError("Booking date cannot be in the past.")

        # Check if station is open during requested time
        if self.station and not self.station.is_24_hours:
            opens_at = self.station.opens_at
            closes_at = self.station.closes_at
            if opens_at and closes_at:
                if opens_at <= closes_at:
                    if not (opens_at <= start_time < closes_at and opens_at < end_time <= closes_at):
                        raise forms.ValidationError(
                            f"Station operates from {opens_at.strftime('%H:%M')} to {closes_at.strftime('%H:%M')}."
                        )

        return cleaned_data

    def save(self, commit=True):
        booking = super().save(commit=False)
        if self.station:
            booking.station = self.station
            # Calculate estimated cost
            estimated_kwh = self.cleaned_data.get("estimated_kwh", 0)
            booking.estimated_cost = estimated_kwh * self.station.price_per_kwh
        if commit:
            booking.save()
        return booking