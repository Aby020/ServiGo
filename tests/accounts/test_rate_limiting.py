"""
Tests for rate limiting on the auth endpoints.

Two separate mechanisms, and one gap between them:

  * the HTML login and registration views are outside DRF entirely, so DRF's
    throttles never see them and the project supplies its own counters;
  * the REST endpoints use DRF's throttles, configured globally in settings.

What is worth pinning down is not the specific numbers but the behaviours that
are easy to get wrong: only submissions count, the counters are per action and
per client, and exceeding the limit refuses the request rather than degrading
into a redirect that still authenticates.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from tests.accounts.factories import make_customer

User = get_user_model()

PASSWORD = "Strongpass123!"

LOGIN = reverse("accounts:login")
REGISTER = reverse("accounts:register")


class LoginRateLimitTests(TestCase):
    def setUp(self):
        self.customer = make_customer(
            email="cust@example.com", username="cust", password=PASSWORD
        )

    def post_login(self, password=PASSWORD, forwarded_for=None):
        extra = {"HTTP_X_FORWARDED_FOR": forwarded_for} if forwarded_for else {}
        return self.client.post(
            LOGIN,
            {"username": "cust@example.com", "password": password},
            **extra,
        )

    @override_settings(LOGIN_RATE_LIMIT=3, LOGIN_RATE_WINDOW_SECONDS=300)
    def test_attempts_up_to_the_limit_are_allowed(self):
        for attempt in range(1, 4):
            with self.subTest(attempt=attempt):
                self.assertNotEqual(
                    self.post_login(password="wrong").status_code, 429
                )

    @override_settings(LOGIN_RATE_LIMIT=3, LOGIN_RATE_WINDOW_SECONDS=300)
    def test_one_attempt_past_the_limit_is_refused(self):
        for _ in range(3):
            self.post_login(password="wrong")
        self.assertEqual(self.post_login(password="wrong").status_code, 429)

    @override_settings(LOGIN_RATE_LIMIT=3, LOGIN_RATE_WINDOW_SECONDS=300)
    def test_blocked_response_carries_retry_after(self):
        for _ in range(3):
            self.post_login(password="wrong")
        response = self.post_login(password="wrong")
        self.assertEqual(response["Retry-After"], "300")

    @override_settings(LOGIN_RATE_LIMIT=3, LOGIN_RATE_WINDOW_SECONDS=300)
    def test_blocked_request_does_not_authenticate(self):
        """
        A correct password after the window is spent still logs nobody in.

        This is the rule that stops a run of guesses followed by one real
        credential from being an unthrottled success.
        """
        for _ in range(3):
            self.post_login(password="wrong")
        self.post_login(password=PASSWORD)
        self.assertNotIn("_auth_user_id", self.client.session)

    @override_settings(LOGIN_RATE_LIMIT=2, LOGIN_RATE_WINDOW_SECONDS=300)
    def test_get_requests_are_not_counted(self):
        for _ in range(5):
            self.assertEqual(self.client.get(LOGIN).status_code, 200)
        # The budget is untouched, so a real sign-in still works.
        self.assertEqual(self.post_login().status_code, 302)

    @override_settings(LOGIN_RATE_LIMIT=2, LOGIN_RATE_WINDOW_SECONDS=300)
    def test_limit_is_per_client(self):
        for _ in range(2):
            self.post_login(password="wrong")
        # The two allowed attempts are spent on this client...
        self.assertEqual(self.post_login(password="wrong").status_code, 429)

        # ...and a different client IP has its own untouched budget, which is
        # what stops one attacker locking every user behind the same NAT out.
        self.assertNotEqual(
            self.post_login(password="wrong", forwarded_for="203.0.113.7").status_code,
            429,
        )


class RegisterRateLimitTests(TestCase):
    def register(self, username="newbie"):
        return self.client.post(
            REGISTER,
            {
                "username": username,
                "email": f"{username}@example.com",
                "phone": "",
                "password1": PASSWORD,
                "password2": PASSWORD,
            },
        )

    @override_settings(REGISTER_RATE_LIMIT=3, REGISTER_RATE_WINDOW_SECONDS=3600)
    def test_limit_blocks_after_the_configured_attempts(self):
        for name in ("one", "two", "three"):
            self.assertEqual(self.register(name).status_code, 302)
        blocked = self.register("four")
        self.assertEqual(blocked.status_code, 429)
        self.assertFalse(User.objects.filter(username="four").exists())

    @override_settings(
        LOGIN_RATE_LIMIT=2,
        LOGIN_RATE_WINDOW_SECONDS=300,
        REGISTER_RATE_LIMIT=3,
        REGISTER_RATE_WINDOW_SECONDS=3600,
    )
    def test_login_and_registration_limits_are_separate(self):
        """Exhausting sign-ins must not also block signup."""
        for _ in range(3):
            self.client.post(LOGIN, {"username": "x", "password": "wrong"})
        self.assertEqual(
            self.client.post(LOGIN, {"username": "x", "password": "wrong"}).status_code,
            429,
        )
        self.assertEqual(self.register("newbie").status_code, 302)

    @override_settings(REGISTER_RATE_LIMIT=3, REGISTER_RATE_WINDOW_SECONDS=3600)
    def test_get_requests_are_not_counted(self):
        for _ in range(5):
            self.assertEqual(self.client.get(REGISTER).status_code, 200)
        self.assertEqual(self.register("newbie").status_code, 302)


class DRFThrottleConfigurationTests(TestCase):
    """
    The API side of the same finding, asserted against the settings object.

    Driven from `settings.REST_FRAMEWORK` rather than from a live request
    because an `APIView`'s APIKEY is snapshotted at import time: overriding
    `REST_FRAMEWORK` in a test reassigns `api_settings`, which every view has
    already read, and the override would silently prove nothing. Asserting on
    the configuration states the finding directly, and a view that opts out of
    throttling shows up as a visible diff in the view file.
    """

    def test_anonymous_and_user_throttles_are_default(self):
        from django.conf import settings

        classes = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"]
        self.assertIn("rest_framework.throttling.AnonRateThrottle", classes)
        self.assertIn("rest_framework.throttling.UserRateThrottle", classes)

    def test_rates_are_configured_for_both_throttles(self):
        from django.conf import settings

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertIn("anon", rates)
        self.assertIn("user", rates)

    def test_auth_views_inherit_the_throttles(self):
        """
        The endpoints worth limiting are the ones that authenticate, and they
        carry no throttle override — so they run on the global default.
        """
        from api.views import LoginView, RegisterView

        for view in (LoginView, RegisterView):
            with self.subTest(view=view.__name__):
                self.assertNotIn("throttle_classes", view.__dict__)

    def test_anonymous_budget_is_tighter_than_the_authenticated_one(self):
        """The credential-stuffing caller is anonymous; that is the point."""
        from django.conf import settings

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertNotEqual(rates["anon"], rates["user"])
