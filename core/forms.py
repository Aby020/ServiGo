"""
Forms for the core app.
"""
from django import forms
from .models import ContactMessage


class ContactForm(forms.ModelForm):
    """Contact form."""

    class Meta:
        model = ContactMessage
        fields = ("name", "email", "phone", "subject", "message")
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "Your full name",
            }),
            "email": forms.EmailInput(attrs={
                "class": "form-control",
                "placeholder": "your@email.com",
            }),
            "phone": forms.TextInput(attrs={
                "class": "form-control",
                "placeholder": "+91 98765 43210",
            }),
            "subject": forms.Select(attrs={
                "class": "form-select",
            }),
            "message": forms.Textarea(attrs={
                "class": "form-control",
                "rows": 5,
                "placeholder": "How can we help you?",
            }),
        }