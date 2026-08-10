"""
Tests for accounts forms: registration, profile, staff/customer profiles.
"""
from django.test import TestCase

from accounts.forms import (
    CustomerProfileForm,
    StaffProfileForm,
    UserProfileForm,
    UserRegistrationForm,
)
from accounts.models import CustomerProfile, StaffProfile
from tests.accounts.factories import make_user


class UserRegistrationFormTests(TestCase):
    VALID_DATA = {
        "username": "newbie",
        "email": "newbie@example.com",
        "role": "customer",
        "phone": "9876543210",
        "password1": "Strongpass123!",
        "password2": "Strongpass123!",
    }

    def test_valid_registration_creates_customer(self):
        form = UserRegistrationForm(data=self.VALID_DATA)
        self.assertTrue(form.is_valid(), form.errors)
        user = form.save()
        self.assertEqual(user.email, "newbie@example.com")
        self.assertEqual(user.role, "customer")
        self.assertEqual(user.phone, "9876543210")
        self.assertTrue(CustomerProfile.objects.filter(user=user).exists())

    def test_staff_registration_creates_staff_profile(self):
        data = {**self.VALID_DATA, "role": "staff"}
        form = UserRegistrationForm(data=data)
        self.assertTrue(form.is_valid(), form.errors)
        user = form.save()
        self.assertEqual(user.role, "staff")
        self.assertTrue(StaffProfile.objects.filter(user=user).exists())

    def test_duplicate_email_rejected(self):
        make_user(email="newbie@example.com", username="existing")
        form = UserRegistrationForm(data=self.VALID_DATA)
        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)

    def test_password_mismatch_rejected(self):
        data = {**self.VALID_DATA, "password2": "Different123!"}
        form = UserRegistrationForm(data=data)
        self.assertFalse(form.is_valid())
        self.assertIn("password2", form.errors)

    def test_role_required(self):
        data = {**self.VALID_DATA, "role": ""}
        form = UserRegistrationForm(data=data)
        self.assertFalse(form.is_valid())
        self.assertIn("role", form.errors)


class UserProfileFormTests(TestCase):
    def form_data(self, **overrides):
        base = {
            "first_name": "First",
            "last_name": "Last",
            "email": "p@example.com",
            "phone": "",
            "address": "",
            "city": "",
            "state": "",
            "pincode": "",
        }
        base.update(overrides)
        return base

    def test_valid_update_saves_fields(self):
        user = make_user(email="p@example.com", username="p")
        form = UserProfileForm(
            data=self.form_data(first_name="Pat", city="Delhi"), instance=user
        )
        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        user.refresh_from_db()
        self.assertEqual(user.first_name, "Pat")
        self.assertEqual(user.city, "Delhi")

    def test_own_email_is_allowed(self):
        user = make_user(email="p@example.com", username="p")
        form = UserProfileForm(data=self.form_data(), instance=user)
        self.assertTrue(form.is_valid(), form.errors)

    def test_other_users_email_rejected(self):
        user = make_user(email="p@example.com", username="p")
        make_user(email="taken@example.com", username="taken")
        form = UserProfileForm(
            data=self.form_data(email="taken@example.com"), instance=user
        )
        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)


class StaffProfileFormTests(TestCase):
    def test_valid_data_saves(self):
        staff = make_user(email="s@example.com", username="s")
        profile = StaffProfile.objects.create(user=staff)
        form = StaffProfileForm(
            data={
                "specialization": "Plumbing",
                "experience_years": 5,
                "hourly_rate": "50.00",
                "bio": "Licensed plumber",
                "certifications": "Cert 1",
                "working_radius_km": 25,
            },
            instance=profile,
        )
        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        profile.refresh_from_db()
        self.assertEqual(profile.specialization, "Plumbing")
        self.assertEqual(profile.hourly_rate, 50.00)


class CustomerProfileFormTests(TestCase):
    def test_valid_data_saves(self):
        customer = make_user(email="c@example.com", username="c")
        profile = CustomerProfile.objects.create(user=customer)
        form = CustomerProfileForm(
            data={
                "date_of_birth": "1990-01-01",
                "preferred_payment_method": "UPI",
            },
            instance=profile,
        )
        self.assertTrue(form.is_valid(), form.errors)
        form.save()
        profile.refresh_from_db()
        self.assertEqual(profile.preferred_payment_method, "UPI")
