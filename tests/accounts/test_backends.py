"""
Tests for accounts.backends.EmailOrUsernameBackend.

The backend accepts either the email or the username (case-insensitively),
matching the login form's "Email or Username" field.
"""
from django.test import TestCase

from accounts.backends import EmailOrUsernameBackend
from tests.accounts.factories import make_user


class EmailOrUsernameBackendTests(TestCase):
    def setUp(self):
        self.password = "Secret123!"
        self.user = make_user(
            email="alice@example.com",
            username="alice",
            password=self.password,
        )
        self.backend = EmailOrUsernameBackend()

    def authenticate(self, identifier, password):
        return self.backend.authenticate(
            request=None, username=identifier, password=password
        )

    def test_authenticate_by_email(self):
        self.assertEqual(
            self.authenticate("alice@example.com", self.password), self.user
        )

    def test_authenticate_by_username(self):
        self.assertEqual(self.authenticate("alice", self.password), self.user)

    def test_authenticate_email_case_insensitive(self):
        self.assertEqual(
            self.authenticate("ALICE@Example.COM", self.password), self.user
        )

    def test_authenticate_username_case_insensitive(self):
        self.assertEqual(self.authenticate("ALICE", self.password), self.user)

    def test_wrong_password_returns_none(self):
        self.assertIsNone(self.authenticate("alice@example.com", "wrong"))

    def test_unknown_user_returns_none(self):
        self.assertIsNone(self.authenticate("ghost@example.com", self.password))

    def test_inactive_user_returns_none(self):
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])
        self.assertIsNone(self.authenticate("alice@example.com", self.password))

    def test_missing_credentials_return_none(self):
        self.assertIsNone(self.authenticate(None, self.password))
        self.assertIsNone(self.authenticate("alice@example.com", None))
        self.assertIsNone(self.authenticate(None, None))

    def test_ambiguous_identifier_returns_none(self):
        # "alice" matches user1's username AND user2's email. The backend
        # must refuse to authenticate rather than pick either user.
        make_user(email="alice", username="bob")
        self.assertIsNone(self.authenticate("alice", self.password))

    def test_get_user_returns_user(self):
        self.assertEqual(self.backend.get_user(self.user.pk), self.user)

    def test_get_user_missing_returns_none(self):
        self.assertIsNone(self.backend.get_user(999999))
