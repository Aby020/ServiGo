"""
Tests for accounts views: registration, login, logout, profile, password.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from accounts.models import CustomerProfile, StaffProfile
from tests.accounts.factories import make_admin, make_customer, make_staff

User = get_user_model()

PASSWORD = "Strongpass123!"


class RegisterViewTests(TestCase):
    def register_data(self, **overrides):
        data = {
            "username": "newbie",
            "email": "newbie@example.com",
            "phone": "",
            "password1": PASSWORD,
            "password2": PASSWORD,
        }
        data.update(overrides)
        return data

    def test_get_renders_registration_form(self):
        response = self.client.get(reverse("accounts:register"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "form")

    def test_get_does_not_render_a_role_field(self):
        # The template offered an "I am a…" dropdown. It must be gone from the
        # page as well as the form — a hidden field would still be bound by a
        # crafted POST, and a rendered one would be an invitation.
        response = self.client.get(reverse("accounts:register"))
        self.assertNotIn('name="role"', response.content.decode())
        self.assertNotIn("form.role", response.content.decode())

    def test_post_creates_customer_and_redirects_to_login(self):
        response = self.client.post(
            reverse("accounts:register"), self.register_data()
        )
        self.assertRedirects(response, reverse("accounts:login"))
        user = User.objects.get(email="newbie@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertTrue(CustomerProfile.objects.filter(user=user).exists())

    def test_post_cannot_self_assign_the_staff_role(self):
        """A crafted POST claiming `staff` still lands as a customer."""
        response = self.client.post(
            reverse("accounts:register"),
            self.register_data(role="staff"),
        )
        self.assertRedirects(response, reverse("accounts:login"))
        user = User.objects.get(email="newbie@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertTrue(CustomerProfile.objects.filter(user=user).exists())
        self.assertFalse(StaffProfile.objects.filter(user=user).exists())

    def test_post_cannot_self_assign_the_admin_role(self):
        response = self.client.post(
            reverse("accounts:register"),
            self.register_data(role="admin"),
        )
        user = User.objects.get(email="newbie@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_post_duplicate_email_rerenders_with_error(self):
        make_customer(email="newbie@example.com", username="existing")
        response = self.client.post(
            reverse("accounts:register"), self.register_data()
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "already exists")

    def test_success_message_shown(self):
        response = self.client.post(
            reverse("accounts:register"), self.register_data(), follow=True
        )
        self.assertContains(response, "Account created successfully!")


class LoginViewTests(TestCase):
    def setUp(self):
        self.customer = make_customer(
            email="cust@example.com", username="cust", password=PASSWORD
        )

    def test_get_renders_login_form(self):
        response = self.client.get(reverse("accounts:login"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Email or Username")

    def test_authenticated_user_redirected_to_dashboard(self):
        self.client.force_login(self.customer)
        response = self.client.get(reverse("accounts:login"))
        self.assertRedirects(response, reverse("dashboard:customer"))

    def test_customer_login_redirects_to_customer_dashboard(self):
        response = self.client.post(
            reverse("accounts:login"),
            {"username": "cust@example.com", "password": PASSWORD},
        )
        self.assertRedirects(response, reverse("dashboard:customer"))

    def test_staff_login_redirects_to_staff_dashboard(self):
        make_staff(email="staff@example.com", username="staff", password=PASSWORD)
        response = self.client.post(
            reverse("accounts:login"),
            {"username": "staff", "password": PASSWORD},
        )
        self.assertRedirects(response, reverse("dashboard:staff"))

    def test_admin_login_redirects_to_admin_index(self):
        make_admin(email="admin@example.com", username="admin", password=PASSWORD)
        response = self.client.post(
            reverse("accounts:login"),
            {"username": "admin@example.com", "password": PASSWORD},
        )
        self.assertRedirects(response, reverse("admin:index"))

    def test_invalid_credentials_show_error(self):
        response = self.client.post(
            reverse("accounts:login"),
            {"username": "cust@example.com", "password": "wrong"},
            follow=True,
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Invalid email/username or password.")

    def test_next_relative_path_is_followed(self):
        response = self.client.post(
            reverse("accounts:login") + "?next=/services/",
            {"username": "cust", "password": PASSWORD},
        )
        self.assertRedirects(response, "/services/")

    def test_next_protocol_relative_open_redirect_blocked(self):
        response = self.client.post(
            reverse("accounts:login") + "?next=//evil.com",
            {"username": "cust", "password": PASSWORD},
        )
        self.assertRedirects(response, reverse("dashboard:customer"))

    def test_next_absolute_open_redirect_blocked(self):
        response = self.client.post(
            reverse("accounts:login") + "?next=https://evil.com/phish",
            {"username": "cust", "password": PASSWORD},
        )
        self.assertRedirects(response, reverse("dashboard:customer"))


class LogoutViewTests(TestCase):
    def test_logout_logs_out_and_redirects_home(self):
        customer = make_customer()
        self.client.force_login(customer)
        response = self.client.post(reverse("accounts:logout"))
        self.assertRedirects(response, reverse("core:home"))
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_logout_requires_login(self):
        response = self.client.get(reverse("accounts:logout"))
        expected = f"{reverse('accounts:login')}?next={reverse('accounts:logout')}"
        self.assertRedirects(response, expected)


class ProfileViewTests(TestCase):
    def test_requires_login(self):
        response = self.client.get(reverse("accounts:profile"))
        expected = f"{reverse('accounts:login')}?next={reverse('accounts:profile')}"
        self.assertRedirects(response, expected)

    def test_customer_profile_view_renders(self):
        customer = make_customer()
        self.client.force_login(customer)
        response = self.client.get(reverse("accounts:profile"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["profile_user"], customer)

    def test_staff_profile_created_when_missing(self):
        staff = make_staff()
        staff.staff_profile.delete()
        self.client.force_login(staff)
        response = self.client.get(reverse("accounts:profile"))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(StaffProfile.objects.filter(user=staff).exists())
        self.assertEqual(response.context["staff_profile"].user, staff)


class ProfileUpdateViewTests(TestCase):
    def profile_data(self, **overrides):
        data = {
            "first_name": "New",
            "last_name": "Name",
            "email": "cust@example.com",
            "phone": "111",
            "address": "addr",
            "city": "City",
            "state": "State",
            "pincode": "123456",
        }
        data.update(overrides)
        return data

    def test_requires_login(self):
        response = self.client.get(reverse("accounts:profile_edit"))
        expected = (
            f"{reverse('accounts:login')}?next={reverse('accounts:profile_edit')}"
        )
        self.assertRedirects(response, expected)

    def test_updates_user_and_redirects_to_profile(self):
        customer = make_customer(email="cust@example.com")
        self.client.force_login(customer)
        response = self.client.post(
            reverse("accounts:profile_edit"), self.profile_data()
        )
        self.assertRedirects(response, reverse("accounts:profile"))
        customer.refresh_from_db()
        self.assertEqual(customer.first_name, "New")
        self.assertEqual(customer.city, "City")

    def test_success_message_shown(self):
        customer = make_customer(email="cust@example.com")
        self.client.force_login(customer)
        response = self.client.post(
            reverse("accounts:profile_edit"), self.profile_data(), follow=True
        )
        self.assertContains(response, "Profile updated successfully!")


class StaffProfileUpdateViewTests(TestCase):
    def staff_data(self, **overrides):
        data = {
            "specialization": "Plumbing",
            "experience_years": 5,
            "hourly_rate": "50.00",
            "bio": "bio",
            "certifications": "cert",
            "working_radius_km": 25,
        }
        data.update(overrides)
        return data

    def test_get_renders_form_for_staff(self):
        staff = make_staff()
        self.client.force_login(staff)
        response = self.client.get(reverse("accounts:staff_profile_edit"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("form", response.context)

    def test_staff_can_update_own_profile(self):
        staff = make_staff()
        self.client.force_login(staff)
        response = self.client.post(
            reverse("accounts:staff_profile_edit"), self.staff_data()
        )
        self.assertRedirects(response, reverse("dashboard:staff"))
        staff.staff_profile.refresh_from_db()
        self.assertEqual(staff.staff_profile.specialization, "Plumbing")
        self.assertEqual(staff.staff_profile.hourly_rate, 50.00)

    def test_customer_blocked_from_staff_profile(self):
        customer = make_customer()
        self.client.force_login(customer)
        response = self.client.post(
            reverse("accounts:staff_profile_edit"), self.staff_data()
        )
        self.assertRedirects(response, reverse("dashboard:customer"))


class CustomerProfileUpdateViewTests(TestCase):
    def customer_data(self, **overrides):
        data = {
            "date_of_birth": "1990-01-01",
            "preferred_payment_method": "UPI",
        }
        data.update(overrides)
        return data

    def test_get_renders_form_for_customer(self):
        customer = make_customer()
        self.client.force_login(customer)
        response = self.client.get(reverse("accounts:customer_profile_edit"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("form", response.context)

    def test_customer_can_update_own_profile(self):
        customer = make_customer()
        self.client.force_login(customer)
        response = self.client.post(
            reverse("accounts:customer_profile_edit"), self.customer_data()
        )
        self.assertRedirects(response, reverse("dashboard:customer"))
        customer.customer_profile.refresh_from_db()
        self.assertEqual(customer.customer_profile.preferred_payment_method, "UPI")

    def test_staff_blocked_from_customer_profile(self):
        staff = make_staff()
        self.client.force_login(staff)
        response = self.client.post(
            reverse("accounts:customer_profile_edit"), self.customer_data()
        )
        self.assertRedirects(response, reverse("dashboard:staff"))


class PasswordChangeViewTests(TestCase):
    def test_requires_login(self):
        response = self.client.get(reverse("accounts:password_change"))
        expected = (
            f"{reverse('accounts:login')}?next={reverse('accounts:password_change')}"
        )
        self.assertRedirects(response, expected)

    def test_change_password_succeeds(self):
        customer = make_customer(password="Oldpass123!")
        self.client.force_login(customer)
        response = self.client.post(
            reverse("accounts:password_change"),
            {
                "old_password": "Oldpass123!",
                "new_password1": "Newpass123!",
                "new_password2": "Newpass123!",
            },
        )
        self.assertRedirects(response, reverse("accounts:password_change_done"))
        customer.refresh_from_db()
        self.assertTrue(customer.check_password("Newpass123!"))

    def test_wrong_old_password_rejected(self):
        customer = make_customer(password="Oldpass123!")
        self.client.force_login(customer)
        response = self.client.post(
            reverse("accounts:password_change"),
            {
                "old_password": "wrong",
                "new_password1": "Newpass123!",
                "new_password2": "Newpass123!",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertFormError(
            response.context["form"],
            "old_password",
            "Your old password was entered incorrectly. Please enter it again.",
        )

    def test_done_page_renders(self):
        customer = make_customer()
        self.client.force_login(customer)
        response = self.client.get(reverse("accounts:password_change_done"))
        self.assertEqual(response.status_code, 200)
