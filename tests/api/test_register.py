"""
Tests for ``POST /api/auth/register/``.

Focus is the security contract the endpoint advertises: it provisions a
*customer* and nothing else, hashes the password, enforces the configured
Django password policy, and returns a usable token pair.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import CustomerProfile

User = get_user_model()

URL = "/api/auth/register/"

VALID_PAYLOAD = {
    "username": "johndoe",
    "email": "johndoe@example.com",
    "password": "Strongpass123!",
    "first_name": "John",
    "last_name": "Doe",
}


class RegisterSuccessTests(APITestCase):
    """201 path: the happy contract."""

    def test_creates_customer_and_returns_tokens(self):
        res = self.client.post(URL, VALID_PAYLOAD, format="json")

        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(
            set(res.data), {"user", "tokens"}
        )
        self.assertEqual(set(res.data["tokens"]), {"access", "refresh"})

        user_data = res.data["user"]
        self.assertEqual(user_data["username"], "johndoe")
        self.assertEqual(user_data["email"], "johndoe@example.com")
        self.assertEqual(user_data["first_name"], "John")
        self.assertEqual(user_data["last_name"], "Doe")
        self.assertEqual(user_data["role"], "customer")
        self.assertIn("id", user_data)

    def test_password_is_hashed(self):
        self.client.post(URL, VALID_PAYLOAD, format="json")

        user = User.objects.get(email="johndoe@example.com")
        self.assertNotEqual(user.password, VALID_PAYLOAD["password"])
        self.assertTrue(user.password.startswith("pbkdf2_"))
        self.assertTrue(user.check_password(VALID_PAYLOAD["password"]))

    def test_creates_customer_profile(self):
        self.client.post(URL, VALID_PAYLOAD, format="json")

        user = User.objects.get(email="johndoe@example.com")
        self.assertTrue(CustomerProfile.objects.filter(user=user).exists())

    def test_optional_fields_may_be_omitted(self):
        res = self.client.post(
            URL,
            {
                "username": "minimaluser",
                "email": "minimal@example.com",
                "password": "Strongpass123!",
            },
            format="json",
        )

        self.assertEqual(res.status_code, 201, res.data)
        user = User.objects.get(email="minimal@example.com")
        self.assertEqual(user.first_name, "")
        self.assertEqual(user.phone, "")

    def test_issued_access_token_authenticates(self):
        res = self.client.post(URL, VALID_PAYLOAD, format="json")
        access = res.data["tokens"]["access"]

        me = self.client.get(
            "/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {access}"
        )

        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data["email"], "johndoe@example.com")
        self.assertEqual(me.data["role"], "customer")

    def test_email_is_stored_lowercased(self):
        res = self.client.post(
            URL, {**VALID_PAYLOAD, "email": "MixedCase@Example.COM"}, format="json"
        )

        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(User.objects.filter(email="mixedcase@example.com").exists())


class RegisterPrivilegeEscalationTests(APITestCase):
    """
    Checkpoint 1: a client cannot mint itself an admin.

    Every privilege-bearing field is ignored, whether sent as ``role``,
    ``is_staff`` or ``is_superuser``.
    """

    def test_client_supplied_role_is_ignored(self):
        res = self.client.post(
            URL, {**VALID_PAYLOAD, "role": "admin"}, format="json"
        )

        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["user"]["role"], "customer")
        user = User.objects.get(email="johndoe@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertFalse(user.is_admin_user)

    def test_client_supplied_staff_flags_are_ignored(self):
        res = self.client.post(
            URL,
            {**VALID_PAYLOAD, "is_staff": True, "is_superuser": True},
            format="json",
        )

        self.assertEqual(res.status_code, 201, res.data)
        user = User.objects.get(email="johndoe@example.com")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.is_staff_user)

    def test_staff_role_is_not_reachable(self):
        res = self.client.post(
            URL, {**VALID_PAYLOAD, "role": "staff"}, format="json"
        )

        self.assertEqual(res.status_code, 201, res.data)
        user = User.objects.get(email="johndoe@example.com")
        self.assertEqual(user.role, User.Role.CUSTOMER)

    def test_new_user_is_active(self):
        res = self.client.post(
            URL, {**VALID_PAYLOAD, "is_active": False}, format="json"
        )

        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(User.objects.get(email="johndoe@example.com").is_active)


class RegisterValidationTests(APITestCase):
    """400 path: input constraints, including the password policy."""

    def assertRejected(self, payload, field):
        res = self.client.post(URL, payload, format="json")
        self.assertEqual(res.status_code, 400, res.data)
        self.assertIn(field, res.data, res.data)
        return res

    # ── Checkpoint 2: password policy ───────────────────────────────────────

    def test_weak_password_rejected(self):
        res = self.assertRejected({**VALID_PAYLOAD, "password": "123"}, "password")
        # Django's MinimumLengthValidator message is surfaced verbatim.
        self.assertIn(
            "too short", " ".join(res.data["password"]).lower()
        )

    def test_numeric_only_password_rejected(self):
        self.assertRejected({**VALID_PAYLOAD, "password": "83749261"}, "password")

    def test_password_similar_to_username_rejected(self):
        res = self.assertRejected(
            {**VALID_PAYLOAD, "username": "brianwhite", "password": "brianwhite1"},
            "password",
        )
        self.assertIn("similar", " ".join(res.data["password"]).lower())

    def test_common_password_rejected(self):
        self.assertRejected({**VALID_PAYLOAD, "password": "password123"}, "password")

    def test_no_user_created_on_validation_error(self):
        self.client.post(URL, {**VALID_PAYLOAD, "password": "123"}, format="json")
        self.assertFalse(User.objects.filter(email="johndoe@example.com").exists())

    # ── Field constraints ───────────────────────────────────────────────────

    def test_duplicate_email_rejected_case_insensitively(self):
        User.objects.create_user(
            email="taken@example.com", username="taken", password="Strongpass123!"
        )
        self.assertRejected(
            {**VALID_PAYLOAD, "email": "TAKEN@example.com"}, "email"
        )

    def test_duplicate_username_rejected(self):
        User.objects.create_user(
            email="other@example.com", username="johndoe", password="Strongpass123!"
        )
        self.assertRejected(
            {**VALID_PAYLOAD, "email": "new@example.com"}, "username"
        )

    def test_invalid_email_rejected(self):
        self.assertRejected({**VALID_PAYLOAD, "email": "not-an-email"}, "email")

    def test_short_username_rejected(self):
        self.assertRejected({**VALID_PAYLOAD, "username": "ab"}, "username")

    def test_non_alphanumeric_username_rejected(self):
        res = self.assertRejected(
            {**VALID_PAYLOAD, "username": "john doe!"}, "username"
        )
        self.assertIn("underscores", " ".join(res.data["username"]).lower())

    def test_missing_required_fields_rejected(self):
        for field in ("username", "email", "password"):
            payload = {k: v for k, v in VALID_PAYLOAD.items() if k != field}
            self.assertRejected(payload, field)
