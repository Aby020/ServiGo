"""
Tests for the admin command hub and the shared profile endpoint.

Four contracts, each of which has a way of failing quietly rather than
loudly:

  1. ``IsAdminUser`` excludes customers, technicians and anonymous callers.
     A guard that admitted any authenticated user would still let every
     happy-path test pass.
  2. Staff provisioning cannot mint an administrator. The payload carries no
     privilege fields, so a smuggled ``role`` must be ignored — and the
     assertion is on the *saved* row, not on the response, because a
     response that echoes back what was asked for proves nothing.
  3. Metrics are computed from the booking's **snapshotted** price, so
     repricing a service does not retroactively change past revenue.
  4. ``PATCH /api/auth/profile/`` updates the caller's own fields and cannot
     escalate a customer's role.
"""
from datetime import time
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import StaffProfile
from bookings.models import Booking, BookingStatusHistory
from ev_charging.models import EVChargingBooking, EVChargingStation

from tests.accounts.factories import make_admin, make_customer, make_staff

User = get_user_model()

STAFF_URL = "/api/admin/staff/"
METRICS_URL = "/api/admin/metrics/"
PROFILE_URL = "/api/auth/profile/"

GOOD_PASSWORD = "Dispatch2024!"


def make_booking(customer, **kwargs):
    """A service booking with the snapshot columns every other field defaults."""
    defaults = {
        "service_name": "Doorstep AC Service",
        "service_price": Decimal("1200.00"),
        "customer_name": customer.first_name or customer.username,
        "customer_email": customer.email,
        "customer_phone": "9876543210",
        "location": "Flat 4B, Brigade Road",
        "preferred_date": "2026-01-15",
        "preferred_time": "10:00",
    }
    defaults.update(kwargs)
    return Booking.objects.create(customer=customer, **defaults)


def make_ev_booking(customer, **kwargs):
    # get_or_create, not create: several EV bookings in one test share a
    # station, and the slug is unique.
    station, _ = EVChargingStation.objects.get_or_create(
        slug="mg-road-charger",
        defaults={
            "name": "MG Road Charger",
            "address": "100 MG Road",
            "city": "Bengaluru",
            "state": "Karnataka",
            "pincode": "560001",
            "charging_speed_kw": 50,
            "price_per_kwh": Decimal("12.50"),
            "total_ports": 4,
            "available_ports": 4,
            "opens_at": time(6, 0),
            "closes_at": time(23, 0),
        },
    )
    defaults = {
        "customer_name": customer.first_name or customer.username,
        "customer_email": customer.email,
        "customer_phone": "9876543210",
        "booking_date": "2026-01-15",
        "start_time": "10:00",
        "end_time": "11:00",
        "estimated_kwh": Decimal("20.00"),
        "estimated_cost": Decimal("250.00"),
    }
    defaults.update(kwargs)
    return EVChargingBooking.objects.create(customer=customer, station=station, **defaults)


# ── IsAdminUser ───────────────────────────────────────────────────────────────


class AdminPermissionTests(APITestCase):
    """The guard is only as good as what it turns away."""

    def setUp(self):
        self.admin = make_admin()
        self.staff = make_staff()
        self.customer = make_customer()

    def test_anonymous_is_rejected(self):
        for url in (STAFF_URL, METRICS_URL):
            with self.subTest(url=url):
                self.assertIn(
                    self.client.get(url).status_code, (401, 403), msg=url
                )

    def test_customer_is_rejected(self):
        self.client.force_authenticate(self.customer)
        for url in (STAFF_URL, METRICS_URL):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403, msg=url)

    def test_staff_is_rejected(self):
        """Staff are not administrators. This is the Step-4 sidebar bug's
        server-side twin: a technician must not reach the roster or the
        platform aggregate even with a valid token."""
        self.client.force_authenticate(self.staff)
        for url in (STAFF_URL, METRICS_URL):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 403, msg=url)

    def test_staff_cannot_provision(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            STAFF_URL,
            {
                "username": "sneaky",
                "email": "sneaky@example.com",
                "password": GOOD_PASSWORD,
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="sneaky").exists())

    def test_admin_is_allowed(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(METRICS_URL).status_code, 200)

    def test_superuser_is_allowed_without_the_admin_role(self):
        """An operator promoted through Django admin may carry
        ``is_superuser`` while their ``role`` is still the default."""
        su = make_user_superuser()
        self.client.force_authenticate(su)
        self.assertEqual(self.client.get(METRICS_URL).status_code, 200)


def make_user_superuser():
    return User.objects.create_user(
        username="root",
        email="root@example.com",
        password="Strongpass123!",
        is_staff=True,
        is_superuser=True,
    )


# ── Staff provisioning ────────────────────────────────────────────────────────


class AdminStaffListTests(APITestCase):
    def setUp(self):
        self.admin = make_admin()
        self.customer = make_customer()
        self.technician = make_staff()
        self.client.force_authenticate(self.admin)

    def test_lists_staff_with_roster_fields(self):
        response = self.client.get(STAFF_URL)
        self.assertEqual(response.status_code, 200)

        rows = {row["username"]: row for row in response.json()}
        self.assertIn("staff", rows)
        row = rows["staff"]
        for field in (
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_active",
            "date_joined",
            "employee_id",
            "total_jobs",
        ):
            self.assertIn(field, row)
        # A staff member made through the factory does have a profile row,
        # so the employee id must be populated rather than null.
        self.assertEqual(row["employee_id"], self.technician.staff_profile.employee_id)

    def test_excludes_customers_and_admins(self):
        """The roster is the technician list. Admins are not technicians and
        customers are certainly not."""
        response = self.client.get(STAFF_URL)
        usernames = {row["username"] for row in response.json()}
        self.assertNotIn("customer", usernames)
        self.assertNotIn("admin", usernames)

    def test_deactivated_staff_stays_visible(self):
        """Deactivation is a badge, not a deletion — an operator who just
        deactivated someone needs to see the row to remember why."""
        self.technician.is_active = False
        self.technician.save(update_fields=["is_active"])

        response = self.client.get(STAFF_URL)
        rows = {row["username"]: row for row in response.json()}
        self.assertIn("staff", rows)
        self.assertFalse(rows["staff"]["is_active"])

    def test_staff_without_profile_serialises_as_null(self):
        """An account promoted straight through Django admin has no
        StaffProfile. One incomplete row must not 500 the whole roster."""
        make_staff(username="noprofile", email="noprofile@example.com")
        StaffProfile.objects.filter(user__username="noprofile").delete()

        response = self.client.get(STAFF_URL)
        self.assertEqual(response.status_code, 200)
        rows = {row["username"]: row for row in response.json()}
        self.assertIsNone(rows["noprofile"]["employee_id"])


class AdminStaffCreateTests(APITestCase):
    def setUp(self):
        self.admin = make_admin()
        self.client.force_authenticate(self.admin)
        self.payload = {
            "username": "ravi_tech",
            "email": "Ravi.Tech@Example.com",
            "password": GOOD_PASSWORD,
            "first_name": "Ravi",
            "last_name": "Menon",
            "phone": "+91 98765 43210",
        }

    def test_creates_staff_with_role_and_staff_flag(self):
        response = self.client.post(STAFF_URL, self.payload)
        self.assertEqual(response.status_code, 201, response.content)

        user = User.objects.get(username="ravi_tech")
        self.assertEqual(user.role, User.Role.STAFF)
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_active)
        self.assertEqual(user.email, "ravi.tech@example.com")

    def test_creates_a_usable_password(self):
        """The account is worthless if the temporary password was stored
        hashed-and-wrong. Actually authenticate with it."""
        self.client.post(STAFF_URL, self.payload)
        user = User.objects.get(username="ravi_tech")
        self.assertTrue(user.check_password(GOOD_PASSWORD))

    def test_creates_a_staff_profile_with_employee_id(self):
        self.client.post(STAFF_URL, self.payload)
        user = User.objects.get(username="ravi_tech")
        self.assertTrue(StaffProfile.objects.filter(user=user).exists())
        self.assertTrue(user.staff_profile.employee_id.startswith("SG-"))

    def test_response_matches_list_shape(self):
        """The created row is the same shape as a listed row so the admin
        table can re-read rather than splice a differently-shaped object in."""
        created = self.client.post(STAFF_URL, self.payload).json()
        listed = {
            row["username"]: row for row in self.client.get(STAFF_URL).json()
        }["ravi_tech"]
        self.assertEqual(set(created), set(listed))

    def test_cannot_mint_an_admin(self):
        """The privilege guard, asserted against the database."""
        response = self.client.post(STAFF_URL, {**self.payload, "role": "admin"})
        self.assertEqual(response.status_code, 201, response.content)

        user = User.objects.get(username="ravi_tech")
        self.assertEqual(user.role, User.Role.STAFF)
        self.assertFalse(user.is_superuser)

    def test_cannot_smuggle_is_superuser(self):
        self.client.post(
            STAFF_URL,
            {
                **self.payload,
                "is_superuser": True,
                "is_staff": False,
                "is_active": False,
            },
        )
        user = User.objects.get(username="ravi_tech")
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_active)

    def test_rejects_duplicate_email(self):
        make_staff(email="taken@example.com", username="taken")
        response = self.client.post(
            STAFF_URL, {**self.payload, "email": "taken@example.com"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_rejects_weak_password(self):
        response = self.client.post(STAFF_URL, {**self.payload, "password": "123"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.assertFalse(User.objects.filter(username="ravi_tech").exists())

    def test_rejects_malformed_phone(self):
        response = self.client.post(STAFF_URL, {**self.payload, "phone": "call me"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("phone", response.json())

    def test_rejects_bad_username_characters(self):
        response = self.client.post(STAFF_URL, {**self.payload, "username": "bad name!"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json())


# ── Metrics ───────────────────────────────────────────────────────────────────


class AdminMetricsTests(APITestCase):
    def setUp(self):
        self.admin = make_admin()
        self.customer = make_customer()
        self.staff = make_staff()
        self.client.force_authenticate(self.admin)

        self.completed = make_booking(self.customer, status=Booking.Status.COMPLETED)
        self.in_progress = make_booking(
            self.customer, status=Booking.Status.IN_PROGRESS
        )
        self.pending = make_booking(self.customer, status=Booking.Status.PENDING)
        self.cancelled = make_booking(
            self.customer, status=Booking.Status.CANCELLED
        )
        self.ev_done = make_ev_booking(
            self.customer, status=EVChargingBooking.Status.COMPLETED
        )
        make_ev_booking(self.customer, status=EVChargingBooking.Status.PENDING)

    def metrics(self):
        response = self.client.get(METRICS_URL)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_counts(self):
        data = self.metrics()
        self.assertEqual(data["total_bookings"], 6)  # 4 service + 2 EV
        self.assertEqual(data["ev_bookings"], 2)
        self.assertEqual(data["active_jobs"], 2)  # pending + in_progress
        self.assertEqual(data["completed_jobs"], 1)
        self.assertEqual(data["cancelled_jobs"], 1)

    def test_revenue_counts_completed_work_only(self):
        """1200.00 service + 250.00 EV. A pending or cancelled booking is
        money that was never taken."""
        data = self.metrics()
        self.assertEqual(Decimal(data["total_revenue"]), Decimal("1450.00"))

    def test_revenue_uses_the_snapshot_not_the_live_price(self):
        """Repricing must not retroactively change what past bookings were
        worth — the whole point of snapshotting the price on the booking.
        `Booking` has no FK to `Service` at all, so there is no live row for
        the figure to drift towards; the new booking carries its own 999.00
        and the earlier 1200.00 stands."""
        make_booking(
            self.customer, status=Booking.Status.COMPLETED, service_price=Decimal("999.00")
        )
        # 1200.00 (the original completed booking) + 250.00 (completed EV) + 999.00.
        self.assertEqual(
            Decimal(self.metrics()["total_revenue"]), Decimal("2449.00")
        )

    def test_people_counts(self):
        data = self.metrics()
        self.assertEqual(data["registered_customers"], 1)
        self.assertEqual(data["total_staff"], 1)
        self.assertEqual(data["active_staff"], 1)

    def test_active_staff_excludes_deactivated(self):
        self.staff.is_active = False
        self.staff.save(update_fields=["is_active"])
        data = self.metrics()
        self.assertEqual(data["total_staff"], 1)
        self.assertEqual(data["active_staff"], 0)

    def test_breakdown_groups_by_snapshotted_service_name(self):
        buckets = {b["label"]: b for b in self.metrics()["services_breakdown"]}
        # 4 service bookings × the 1200.00 snapshotted on each. The bucket
        # sums every status, not just completed ones — it answers "what does
        # the platform sell", while `total_revenue` answers "what did it
        # take". A pending booking is booked work that has not been paid.
        self.assertEqual(buckets["Doorstep AC Service"]["count"], 4)
        self.assertEqual(
            Decimal(buckets["Doorstep AC Service"]["revenue"]), Decimal("4800.00")
        )

    def test_breakdown_carries_an_ev_bucket(self):
        buckets = {b["label"]: b for b in self.metrics()["services_breakdown"]}
        self.assertIn("EV Charging", buckets)
        self.assertEqual(buckets["EV Charging"]["count"], 2)
        self.assertEqual(Decimal(buckets["EV Charging"]["revenue"]), Decimal("500.00"))

    def test_recent_activity_reports_the_last_five_shifts(self):
        for i in range(7):
            BookingStatusHistory.objects.create(
                booking=self.completed,
                previous_status=Booking.Status.IN_PROGRESS,
                new_status=Booking.Status.COMPLETED,
                changed_by=self.staff,
                notes=f"shift {i}",
            )

        feed = self.metrics()["recent_activity"]
        self.assertEqual(len(feed), 5)
        # Newest first — the notes were written in order, so index 0 is shift 6.
        self.assertEqual(feed[0]["notes"], "shift 6")
        self.assertEqual(feed[0]["booking_id"], self.completed.id)
        self.assertEqual(feed[0]["service_name"], self.completed.service_name)
        self.assertEqual(feed[0]["customer_name"], self.completed.customer_name)
        self.assertEqual(feed[0]["changed_by_name"], self.staff.username)

    def test_empty_platform_reports_zero_not_null(self):
        """A brand-new deployment has no bookings at all. The aggregate sums
        to NULL, and a client should not have to special-case that."""
        Booking.objects.all().delete()
        EVChargingBooking.objects.all().delete()
        BookingStatusHistory.objects.all().delete()

        data = self.metrics()
        self.assertEqual(Decimal(data["total_revenue"]), Decimal("0"))
        self.assertEqual(data["total_bookings"], 0)
        self.assertEqual(data["active_jobs"], 0)
        self.assertEqual(data["services_breakdown"], [])
        self.assertEqual(data["recent_activity"], [])


# ── Profile patch ─────────────────────────────────────────────────────────────


class ProfileUpdateTests(APITestCase):
    def setUp(self):
        self.customer = make_customer(first_name="Cora")
        self.staff = make_staff()
        self.admin = make_admin()

    def test_anonymous_is_rejected(self):
        self.assertIn(
            self.client.patch(PROFILE_URL, {"first_name": "X"}).status_code,
            (401, 403),
        )

    def test_updates_own_fields(self):
        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            PROFILE_URL,
            {
                "first_name": "Corina",
                "last_name": "Abiodun",
                "phone": "+91 90000 12345",
            },
        )
        self.assertEqual(response.status_code, 200, response.content)

        body = response.json()
        self.assertEqual(body["first_name"], "Corina")
        self.assertEqual(body["last_name"], "Abiodun")
        # The validator normalises to digits so the same number entered with
        # and without spaces is stored identically — otherwise a customer
        # who retypes their number with punctuation creates a second copy of
        # themselves in the contact list.
        self.assertEqual(body["phone"], "+919000012345")

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.first_name, "Corina")
        self.assertEqual(self.customer.phone, "+919000012345")

    def test_partial_patch_leaves_other_fields_alone(self):
        """Omitting a field must not blank it. A form that sends only the
        dirty field is the normal case, not an edge case."""
        self.client.force_authenticate(self.customer)
        self.client.patch(PROFILE_URL, {"first_name": "Corina", "last_name": "Ng"})

        self.client.patch(PROFILE_URL, {"last_name": "Okafor"})
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.first_name, "Corina")
        self.assertEqual(self.customer.last_name, "Okafor")

    def test_all_roles_can_edit_their_own_profile(self):
        for user in (self.customer, self.staff, self.admin):
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                response = self.client.patch(
                    PROFILE_URL, {"first_name": "Shared", "last_name": "Editor"}
                )
                self.assertEqual(response.status_code, 200, response.content)
                user.refresh_from_db()
                self.assertEqual(user.first_name, "Shared")

    def test_cannot_escalate_own_role(self):
        self.client.force_authenticate(self.customer)
        response = self.client.patch(
            PROFILE_URL, {"role": "admin", "is_superuser": True, "email": "new@x.com"}
        )
        self.assertEqual(response.status_code, 200, response.content)

        self.customer.refresh_from_db()
        self.assertEqual(self.customer.role, User.Role.CUSTOMER)
        self.assertFalse(self.customer.is_superuser)
        self.assertEqual(self.customer.email, "customer@example.com")

    def test_cannot_edit_another_account(self):
        """There is no id in the path, so the only account reachable is the
        caller's own. Asserted by patching as `customer` and confirming the
        staff account is untouched."""
        self.client.force_authenticate(self.customer)
        self.client.patch(PROFILE_URL, {"first_name": "Corina"})

        self.staff.refresh_from_db()
        self.assertNotEqual(self.staff.first_name, "Corina")

    def test_rejects_malformed_phone(self):
        self.client.force_authenticate(self.customer)
        response = self.client.patch(PROFILE_URL, {"phone": "ring me maybe"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("phone", response.json())
