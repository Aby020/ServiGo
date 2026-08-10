"""
Tests for accounts models: the custom User, StaffProfile, CustomerProfile.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from accounts.models import CustomerProfile, StaffProfile
from tests.accounts.factories import make_user

User = get_user_model()


class UserModelTests(TestCase):
    def setUp(self):
        self.user = make_user(
            email="bob@example.com", username="bob", password="Secret123!"
        )

    def test_username_field_is_email(self):
        self.assertEqual(User.USERNAME_FIELD, "email")

    def test_default_role_is_customer(self):
        self.assertEqual(self.user.role, User.Role.CUSTOMER)

    def test_role_properties(self):
        self.user.role = User.Role.CUSTOMER
        self.assertTrue(self.user.is_customer)
        self.assertFalse(self.user.is_staff_user)
        self.assertFalse(self.user.is_admin_user)

        self.user.role = User.Role.STAFF
        self.assertTrue(self.user.is_staff_user)
        self.assertFalse(self.user.is_customer)

        self.user.role = User.Role.ADMIN
        self.assertTrue(self.user.is_admin_user)

    def test_get_full_name_falls_back_to_username(self):
        self.assertEqual(self.user.get_full_name(), "bob")

    def test_get_full_name_uses_names_when_set(self):
        self.user.first_name = "Bob"
        self.user.last_name = "Smith"
        self.user.save(update_fields=["first_name", "last_name"])
        self.assertEqual(self.user.get_full_name(), "Bob Smith")

    def test_get_short_name_falls_back_to_username(self):
        self.assertEqual(self.user.get_short_name(), "bob")

    def test_str_is_email(self):
        self.assertEqual(str(self.user), "bob@example.com")


class StaffProfileModelTests(TestCase):
    def test_employee_id_generated_on_save(self):
        staff = make_user(role=User.Role.STAFF, email="s1@example.com", username="s1")
        profile = StaffProfile(user=staff)
        profile.save()
        self.assertRegex(profile.employee_id, r"^SG-\d+$")

    def test_explicit_employee_id_is_respected(self):
        staff = make_user(role=User.Role.STAFF, email="s2@example.com", username="s2")
        profile = StaffProfile(user=staff, employee_id="SG-CUSTOM")
        profile.save()
        self.assertEqual(profile.employee_id, "SG-CUSTOM")

    def test_employee_ids_are_unique(self):
        staff1 = make_user(role=User.Role.STAFF, email="s3@example.com", username="s3")
        staff2 = make_user(role=User.Role.STAFF, email="s4@example.com", username="s4")
        p1 = StaffProfile.objects.create(user=staff1)
        p2 = StaffProfile.objects.create(user=staff2)
        self.assertNotEqual(p1.employee_id, p2.employee_id)

    def test_non_numeric_existing_id_does_not_break_generation(self):
        # A hand-assigned "SG-LEGACY" ID must not stop generation for others.
        staff = make_user(role=User.Role.STAFF, email="s6@example.com", username="s6")
        StaffProfile.objects.create(user=staff, employee_id="SG-LEGACY")
        staff2 = make_user(role=User.Role.STAFF, email="s7@example.com", username="s7")
        profile = StaffProfile.objects.create(user=staff2)
        self.assertRegex(profile.employee_id, r"^SG-\d+$")

    def test_str_contains_name_and_employee_id(self):
        staff = make_user(
            role=User.Role.STAFF,
            email="s5@example.com",
            username="s5",
            first_name="Sam",
        )
        profile = StaffProfile.objects.create(user=staff)
        self.assertIn("Sam", str(profile))
        self.assertIn(profile.employee_id, str(profile))


class CustomerProfileModelTests(TestCase):
    def test_defaults(self):
        user = make_user(email="c@example.com", username="c")
        profile = CustomerProfile.objects.create(user=user)
        self.assertEqual(profile.loyalty_points, 0)
        self.assertEqual(profile.total_bookings, 0)
        self.assertEqual(profile.total_spent, 0)

    def test_str_contains_user_name(self):
        user = make_user(
            email="c2@example.com", username="c2", first_name="Casey"
        )
        profile = CustomerProfile.objects.create(user=user)
        self.assertIn("Casey", str(profile))
