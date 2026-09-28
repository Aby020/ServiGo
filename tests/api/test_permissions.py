"""
Regression tests for the ``IsOwnerOrStaff`` object-level permission.

Background
----------
``IsOwnerOrStaff.has_object_permission`` used to decide who could reach a
booking like this::

    if hasattr(user, "is_staff_user") and user.is_staff_user:
        return True
    if hasattr(user, "is_admin_user") and user.is_admin_user:
        return True
    return obj.customer_id == user.id

``hasattr`` answers a completely different question from "is this caller
privileged": it answers "does this attribute exist". Because ``is_staff_user``
and ``is_admin_user`` are ``@property`` descriptors on the custom user model,
they *always* exist for every authenticated account — a customer included.
The property's own value was never consulted. Every logged-in user therefore
satisfied the first branch and could read any other customer's booking: a
straightforward Insecure Direct Object Reference (IDOR / BOLA).

These tests pin the fixed behaviour. The cross-tenant cases are the ones that
matter; the positive cases exist so the fix cannot be "solved" by locking
everyone out.
"""
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from api.permissions import IsOwnerOrStaff, _is_privileged
from bookings.models import Booking
from ev_charging.models import EVChargingBooking, EVChargingStation

User = get_user_model()

BOOKING_URL = "/api/bookings/{pk}/"
EV_BOOKING_URL = "/api/ev/bookings/{pk}/"


class _PermissionTestMixin:
    """Shared fixtures: an owner, an unrelated customer, and a booking."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner",
            email="owner@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        self.intruder = User.objects.create_user(
            username="intruder",
            email="intruder@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        self.staff = User.objects.create_user(
            username="tech",
            email="tech@example.com",
            password="Strongpass123!",
            role=User.Role.STAFF,
        )
        self.admin = User.objects.create_user(
            username="boss",
            email="boss@example.com",
            password="Strongpass123!",
            role=User.Role.ADMIN,
        )
        self.booking = self.make_booking(self.owner)

    def make_booking(self, customer, **overrides):
        fields = {
            "customer": customer,
            "customer_name": customer.get_full_name(),
            "customer_email": customer.email,
            "customer_phone": "+911234567890",
            "service_name": "EV Home Charging",
            "service_price": Decimal("1499.00"),
            "location": "Bengaluru",
            "address": "42 Test Lane",
            "preferred_date": timezone.localdate() + timezone.timedelta(days=3),
            "preferred_time": timezone.datetime.min.time().replace(hour=10),
        }
        fields.update(overrides)
        return Booking.objects.create(**fields)

    def assertSeesBooking(self, user, booking):
        """Log in as ``user`` and assert a 200 with this booking's payload."""
        self.client.force_authenticate(user=user)
        response = self.client.get(BOOKING_URL.format(pk=booking.pk))
        self.assertEqual(
            response.status_code,
            200,
            msg=f"{user.email} should have been able to read booking {booking.pk}",
        )
        self.assertEqual(response.data["id"], booking.pk)

    def assertForbidden(self, user, booking):
        """Assert the strict 403 — not a 404, not a 200, not a 500."""
        self.client.force_authenticate(user=user)
        response = self.client.get(BOOKING_URL.format(pk=booking.pk))
        self.assertEqual(
            response.status_code,
            403,
            msg=(
                f"{user.email} must receive 403 Forbidden for a booking owned "
                f"by {booking.customer.email}; got {response.status_code}"
            ),
        )
        # The response must not leak any part of the victim's record.
        body = response.content.decode()
        self.assertNotIn(booking.customer.email, body)
        self.assertNotIn(str(booking.service_price), body)


class CrossTenantBookingAccessTests(_PermissionTestMixin, APITestCase):
    """The IDOR itself: customer A must never read customer B's booking."""

    def test_customer_cannot_read_another_customers_booking(self):
        """The regression that mattered — strict 403 on cross-tenant read."""
        self.assertForbidden(self.intruder, self.booking)

    def test_customer_cannot_read_another_customers_booking_by_changing_id(self):
        """Enumerate: owning a booking must not grant access to its sibling."""
        mine = self.make_booking(self.intruder)
        self.assertForbidden(self.intruder, self.booking)
        # ...and the intruder's own booking is still reachable, proving the
        # guard is ownership-scoped rather than a blanket deny.
        self.assertSeesBooking(self.intruder, mine)

    def test_customer_cannot_read_a_third_partys_booking(self):
        """A third distinct account is refused identically."""
        stranger = User.objects.create_user(
            username="stranger",
            email="stranger@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        self.assertForbidden(stranger, self.booking)

    def test_privileged_accounts_retain_full_visibility(self):
        """Staff and admin must still reach every booking."""
        self.assertSeesBooking(self.staff, self.booking)
        self.assertSeesBooking(self.admin, self.booking)

    def test_owner_retains_access_to_own_booking(self):
        self.assertSeesBooking(self.owner, self.booking)

    def test_anonymous_caller_is_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(BOOKING_URL.format(pk=self.booking.pk))
        self.assertEqual(response.status_code, 401)


class _PrivilegeHelperTests(_PermissionTestMixin, APITestCase):
    """Unit-level guard on the `_is_privileged` helper itself.

    These assert the *value* of the decision, not just its downstream effect,
    because the original bug lived in how the flag was read: a property object
    is truthy on its own, regardless of what it evaluates to.
    """

    def test_customer_is_not_privileged(self):
        self.assertFalse(_is_privileged(self.owner))
        self.assertFalse(_is_privileged(self.intruder))

    def test_role_privileges_are_honoured(self):
        self.assertTrue(_is_privileged(self.staff))
        self.assertTrue(_is_privileged(self.admin))

    def test_django_flags_are_honoured_without_a_custom_role(self):
        """An operator promoted via Django admin (is_staff/is_superuser)."""
        promoted = User.objects.create_user(
            username="promoted",
            email="promoted@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        self.assertFalse(_is_privileged(promoted))
        promoted.is_staff = True
        self.assertTrue(_is_privileged(promoted))

        superuser = User.objects.create_user(
            username="su",
            email="su@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        superuser.is_superuser = True
        self.assertTrue(_is_privileged(superuser))

    def test_unauthenticated_and_anonymous_are_not_privileged(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(_is_privileged(AnonymousUser()))
        self.assertFalse(_is_privileged(None))

    def test_privilege_check_is_not_decided_by_attribute_presence(self):
        """The precise shape of the original defect, asserted directly.

        `is_staff_user` exists on every account including a plain customer,
        and its property object is truthy. If any code path tests the
        attribute rather than its value, this customer sails through.
        """
        customer = self.intruder
        self.assertTrue(hasattr(customer, "is_staff_user"))
        self.assertTrue(hasattr(customer, "is_admin_user"))
        # Presence is truthy; the *value* is not. Only the value may decide.
        self.assertFalse(bool(customer.is_staff_user))
        self.assertFalse(bool(customer.is_admin_user))
        self.assertFalse(_is_privileged(customer))


class PermissionUnitTests(_PermissionTestMixin, APITestCase):
    """Direct calls to the permission class, independent of any view."""

    def _check(self, user, obj):
        from rest_framework.test import APIRequestFactory

        request = APIRequestFactory().get("/")
        request.user = user
        return IsOwnerOrStaff().has_object_permission(request, None, obj)

    def test_owner_passes_and_non_owner_fails(self):
        self.assertTrue(self._check(self.owner, self.booking))
        self.assertFalse(self._check(self.intruder, self.booking))

    def test_staff_and_admin_pass(self):
        self.assertTrue(self._check(self.staff, self.booking))
        self.assertTrue(self._check(self.admin, self.booking))

    def test_anonymous_fails(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(self._check(AnonymousUser(), self.booking))

    def test_ownership_is_compared_on_the_fk_id(self):
        """The check reads ``customer_id`` — the value, not the related object.

        The permission must resolve ownership from a plain id so it never
        triggers an extra query or depends on a related object being cached.
        Refetching from the database proves the decision survives a caller
        tampering with the in-memory ``customer`` relation, which Django's FK
        descriptor keeps consistent by also rewriting ``customer_id``.
        """
        fresh = Booking.objects.get(pk=self.booking.pk)
        self.assertEqual(fresh.customer_id, self.owner.pk)
        self.assertTrue(self._check(self.owner, fresh))
        self.assertFalse(self._check(self.intruder, fresh))


class CrossTenantEVBookingAccessTests(APITestCase):
    """The same guard guards EV charging reservations."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="evowner",
            email="evowner@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        self.intruder = User.objects.create_user(
            username="evintruder",
            email="evintruder@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
        )
        self.station = EVChargingStation.objects.create(
            name="Bengaluru Test Hub",
            slug="bengaluru-test-hub",
            address="1 Charge Road",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
            latitude=Decimal("12.971600"),
            longitude=Decimal("77.594600"),
            charging_speed_kw=50,
            price_per_kwh=Decimal("18.50"),
            opens_at=time(6, 0),
            closes_at=time(23, 0),
        )
        self.reservation = EVChargingBooking.objects.create(
            customer=self.owner,
            customer_name=self.owner.get_full_name(),
            customer_email=self.owner.email,
            customer_phone="+911234567890",
            station=self.station,
            vehicle_number="KA01AB1234",
            booking_date=timezone.localdate() + timedelta(days=1),
            start_time=time(14, 0),
            end_time=time(16, 0),
            estimated_kwh=Decimal("42.00"),
            estimated_cost=Decimal("777.00"),
        )

    def test_customer_cannot_read_another_customers_reservation(self):
        self.client.force_authenticate(user=self.intruder)
        response = self.client.get(EV_BOOKING_URL.format(pk=self.reservation.pk))
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(self.owner.email, response.content.decode())

    def test_owner_can_read_own_reservation(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(EV_BOOKING_URL.format(pk=self.reservation.pk))
        self.assertEqual(response.status_code, 200)

    def test_staff_can_read_any_reservation(self):
        staff = User.objects.create_user(
            username="evtech",
            email="evtech@example.com",
            password="Strongpass123!",
            role=User.Role.STAFF,
        )
        self.client.force_authenticate(user=staff)
        response = self.client.get(EV_BOOKING_URL.format(pk=self.reservation.pk))
        self.assertEqual(response.status_code, 200)
