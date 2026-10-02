"""
Tests for the seed commands' refusal to invent account passwords.

Both commands used to fall back to a password literal in the source — a string
committed to the repository that opened an admin account wherever the command
was run without the environment variable set. Neither has a fallback now, and
these tests hold that in place: the only way to get demo accounts is to supply
a password, and `--skip-users` / an absent variable is the supported way to seed
the catalogue alone.
"""
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from core.management.commands.seed_demo import PASSWORD_ENV
from services.management.commands.seed_production_data import (
    DEMO_PASSWORD_ENV,
)

User = get_user_model()

GOOD_PASSWORD = "Seeded-Pass-2026!"


class SeedProductionPasswordTests(TestCase):
    def run_seed(self, **options):
        out = StringIO()
        call_command(
            "seed_production_data", stdout=out, stderr=out, **options
        )
        return out.getvalue()

    def test_refuses_without_the_environment_variable(self):
        with self.assertRaises(CommandError) as ctx:
            self.run_seed()
        self.assertIn(DEMO_PASSWORD_ENV, str(ctx.exception))

    def test_refusal_creates_no_users(self):
        with self.assertRaises(CommandError):
            self.run_seed()
        self.assertFalse(User.objects.exists())

    def test_skip_users_needs_no_password(self):
        output = self.run_seed(skip_users=True)
        self.assertIn("--skip-users", output)
        self.assertFalse(User.objects.exists())

    def test_catalogue_is_seeded_before_the_refusal(self):
        """
        A failed build still leaves the reference data in place.

        The whole `handle` runs inside `@transaction.atomic`, and the password
        check happens last, so the refusal rolls the catalogue back with it.
        That is deliberate: the command either seeds completely or not at all.
        Re-running with the variable set is safe either way because every write
        is a `get_or_create` keyed on a natural key — the retry creates only
        what is missing.
        """
        from services.models import Service, ServiceCategory

        with self.assertRaises(CommandError):
            self.run_seed()
        self.assertFalse(ServiceCategory.objects.exists())
        self.assertFalse(Service.objects.exists())

    def test_creates_users_when_the_variable_is_set(self):
        import os

        os.environ[DEMO_PASSWORD_ENV] = GOOD_PASSWORD
        try:
            self.run_seed()
        finally:
            del os.environ[DEMO_PASSWORD_ENV]

        admin = User.objects.get(email="admin@servigo.com")
        self.assertTrue(admin.check_password(GOOD_PASSWORD))
        self.assertTrue(admin.is_superuser)

    def test_weak_password_is_refused(self):
        import os

        os.environ[DEMO_PASSWORD_ENV] = "12345"
        try:
            with self.assertRaises(CommandError) as ctx:
                self.run_seed()
        finally:
            del os.environ[DEMO_PASSWORD_ENV]
        self.assertIn(DEMO_PASSWORD_ENV, str(ctx.exception))
        self.assertFalse(User.objects.exists())


class SeedDemoPasswordTests(TestCase):
    def run_seed(self, **options):
        out = StringIO()
        call_command("seed_demo", stdout=out, stderr=out, **options)
        return out.getvalue()

    def test_refuses_without_the_environment_variable(self):
        with self.assertRaises(CommandError) as ctx:
            self.run_seed()
        self.assertIn(PASSWORD_ENV, str(ctx.exception))

    def test_refusal_creates_no_users(self):
        with self.assertRaises(CommandError):
            self.run_seed()
        self.assertFalse(User.objects.exists())

    def test_creates_users_when_the_variable_is_set(self):
        import os

        os.environ[PASSWORD_ENV] = GOOD_PASSWORD
        try:
            output = self.run_seed()
        finally:
            del os.environ[PASSWORD_ENV]

        admin = User.objects.get(email="admin@servigo.com")
        self.assertTrue(admin.check_password(GOOD_PASSWORD))
        self.assertTrue(admin.is_superuser)
        # The credentials are echoed by reference, never by value.
        self.assertIn(PASSWORD_ENV, output)
        self.assertNotIn(GOOD_PASSWORD, output)

    def test_weak_password_is_refused(self):
        import os

        os.environ[PASSWORD_ENV] = "password"
        try:
            with self.assertRaises(CommandError) as ctx:
                self.run_seed()
        finally:
            del os.environ[PASSWORD_ENV]
        self.assertIn(PASSWORD_ENV, str(ctx.exception))

    def test_reset_is_refused_before_anything_is_deleted(self):
        """
        The password is resolved first, so a misconfigured run cannot wipe the
        database and then fail.
        """
        import os

        os.environ[PASSWORD_ENV] = GOOD_PASSWORD
        try:
            self.run_seed()
        finally:
            del os.environ[PASSWORD_ENV]
        self.assertTrue(User.objects.exists())

        with self.assertRaises(CommandError):
            self.run_seed(reset=True)
        self.assertTrue(User.objects.exists())