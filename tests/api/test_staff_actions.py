"""
Tests for the four-stage dispatch action endpoint.

The dashboard's whole value proposition is that a technician can only move a
job forward one milestone at a time, and that the milestone survives a page
reload (it is derived from ``Booking.status``, not from client state). That
leaves exactly three things worth proving here:

  1. **Ordering is enforced.** ``start_work`` on a job nobody has arrived at
     must be a 400. This is the property a free-form status POST cannot offer,
     and it is the one the UI's single-button-per-job design relies on.
  2. **A repeated stage is a 400, not a silent success.** A double click is the
     realistic failure mode; answering 200 the second time would let a
     technician believe an action landed that did not.
  3. **The audit trail is complete and named.** The customer timeline reads
     ``status_history``, so a stage that moves the status without writing a
     row leaves the customer watching a job change with no explanation.

Plus the permission and ownership rules, because "claim does not change status"
is only safe if everyone else is actually locked out of the other three.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from bookings.models import Booking, BookingStatusHistory

User = get_user_model()


def actions_url(pk):
    return f"/api/staff/bookings/{pk}/actions/"


class StaffActionTestCase(APITestCase):
    """Shared fixtures: one customer, two staff, one pending booking."""

    def setUp(self):
        self.customer = User.objects.create_user(
            username="cust1",
            email="cust1@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
            first_name="Cora",
            last_name="Ng",
        )
        self.staff = User.objects.create_user(
            username="tech1",
            email="tech1@example.com",
            password="Strongpass123!",
            role=User.Role.STAFF,
            first_name="Tara",
            last_name="Iyer",
        )
        self.other_staff = User.objects.create_user(
            username="tech2",
            email="tech2@example.com",
            password="Strongpass123!",
            role=User.Role.STAFF,
            first_name="Omar",
            last_name="Said",
        )
        self.booking = Booking.objects.create(
            customer=self.customer,
            customer_name="Cora Ng",
            customer_email="cust1@example.com",
            customer_phone="+91 90000 00000",
            service_name="Deep Clean",
            service_price=Decimal("599.00"),
            location="Bandra West",
            address="12 Palm Grove",
            preferred_date=timezone.localdate() + timedelta(days=1),
            preferred_time="10:30",
            status=Booking.Status.PENDING,
        )

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def fire(self, action, booking=None, notes="", user=None):
        return self.as_user(user or self.staff).post(
            actions_url((booking or self.booking).id),
            {"action": action, "notes": notes},
            format="json",
        )


class StaffActionOrderingTests(StaffActionTestCase):
    """The full four-stage walk, and the refusals around it."""

    def test_claim_assigns_without_changing_status(self):
        response = self.fire("claim")

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.assigned_staff_id, self.staff.id)
        # Claim is assignment only. If it also confirmed, the audit trail
        # would claim a technician accepted the job before they had seen it.
        self.assertEqual(self.booking.status, Booking.Status.PENDING)

    def test_claim_writes_an_audit_row(self):
        self.fire("claim")

        row = BookingStatusHistory.objects.get(booking=self.booking)
        self.assertEqual(row.changed_by_id, self.staff.id)
        # Claim does not move the status, so the row's status pair is the same
        # value on both sides. What it does record is who took the job.
        self.assertEqual(row.new_status, Booking.Status.PENDING)
        self.assertIn(str(self.staff.first_name), row.notes)

    def test_claim_is_idempotent_and_does_not_double_audit(self):
        self.fire("claim")
        self.assertEqual(
            BookingStatusHistory.objects.filter(booking=self.booking).count(), 1
        )

        response = self.fire("claim")

        # Re-claiming a job you already hold is a no-op, not a 400: the
        # dashboard re-renders and a stale tab can legitimately fire it twice.
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            BookingStatusHistory.objects.filter(booking=self.booking).count(), 1
        )

    def test_reached_location_sets_on_site(self):
        self.fire("claim")
        response = self.fire("reached_location")

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.ON_SITE)
        # Arrival is the first moment the job is demonstrably happening, so it
        # is what stamps confirmed_at on this path.
        self.assertIsNotNone(self.booking.confirmed_at)

    def test_start_work_requires_arrival(self):
        self.fire("claim")
        response = self.fire("start_work")

        self.assertEqual(response.status_code, 400)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.PENDING)

    def test_complete_work_requires_start(self):
        self.fire("claim")
        self.fire("reached_location")
        response = self.fire("complete_work")

        self.assertEqual(response.status_code, 400)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.ON_SITE)

    def test_full_walk_reaches_completed_with_a_row_per_stage(self):
        self.fire("claim")
        self.fire("reached_location")
        self.fire("start_work")
        response = self.fire("complete_work", notes="Replaced the filter.")

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.COMPLETED)
        self.assertIsNotNone(self.booking.completed_at)

        # One audit row per stage, in order. This is the customer-facing
        # timeline, so a missing or reordered row is a visible defect.
        trail = list(
            BookingStatusHistory.objects.filter(booking=self.booking).order_by("id")
        )
        self.assertEqual(len(trail), 4)
        self.assertTrue(all(row.changed_by_id == self.staff.id for row in trail))
        self.assertIn("Replaced the filter.", trail[-1].notes)

    def test_repeating_a_stage_is_refused_not_silently_accepted(self):
        self.fire("claim")
        self.fire("reached_location")
        response = self.fire("reached_location")

        # The realistic failure is a double click. A 200 here would tell the
        # technician an action landed that did nothing.
        self.assertEqual(response.status_code, 400)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.ON_SITE)

    def test_unknown_action_is_a_field_error(self):
        response = self.fire("teleport")

        self.assertEqual(response.status_code, 400)
        self.assertIn("action", response.data)

    def test_completed_booking_cannot_be_claimed(self):
        self.booking.status = Booking.Status.COMPLETED
        self.booking.save()

        response = self.fire("claim")

        self.assertEqual(response.status_code, 400)
        self.booking.refresh_from_db()
        self.assertIsNone(self.booking.assigned_staff_id)

    def test_cancelled_booking_cannot_be_claimed(self):
        self.booking.status = Booking.Status.CANCELLED
        self.booking.save()

        response = self.fire("claim")

        self.assertEqual(response.status_code, 400)


class StaffActionPermissionTests(StaffActionTestCase):
    """Who is allowed to drive a job forward."""

    def test_anonymous_is_rejected(self):
        response = self.client.post(
            actions_url(self.booking.id), {"action": "claim"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_customer_cannot_drive_a_booking(self):
        response = self.fire("claim", user=self.customer)

        self.assertEqual(response.status_code, 403)
        self.booking.refresh_from_db()
        self.assertIsNone(self.booking.assigned_staff_id)

    def test_another_technician_cannot_advance_my_job(self):
        self.fire("claim", user=self.staff)
        response = self.fire("reached_location", user=self.other_staff)

        self.assertEqual(response.status_code, 400)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.PENDING)

    def test_a_second_technician_may_claim_an_unclaimed_job(self):
        # Unclaimed is genuinely up for grabs — that is the queue's purpose.
        response = self.fire("claim", user=self.other_staff)

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.assigned_staff_id, self.other_staff.id)
