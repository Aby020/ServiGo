"""
Tests for the staff dispatch endpoints.

Covers the three contracts the dashboard depends on:

  1. ``IsStaffUser`` actually excludes customers (and anonymous callers).
  2. Claiming a job assigns it to the caller and writes an audit row.
  3. A status change is refused when it is illegal, and when it is legal it
     lands in ``BookingStatusHistory`` in a form the *customer's* timeline
     can render — technician name and all.

That last point is the one worth a test: the customer view reads
``status_history`` and shows ``changed_by_name``, so a staff-side change that
wrote a history row without ``changed_by`` would leave the customer's
timeline silently anonymous.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from bookings.models import Booking, BookingStatusHistory

User = get_user_model()

LIST_URL = "/api/staff/bookings/"


def assign_url(pk):
    return f"/api/staff/bookings/{pk}/assign/"


def status_url(pk):
    return f"/api/staff/bookings/{pk}/status/"


class StaffDispatchTestCase(APITestCase):
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

    def as_staff(self, user=None):
        self.client.force_authenticate(user or self.staff)
        return self.client


class PermissionTests(StaffDispatchTestCase):
    """`IsStaffUser` is the gate on all three routes."""

    def test_anonymous_is_rejected(self):
        for url in (LIST_URL, assign_url(self.booking.pk), status_url(self.booking.pk)):
            res = self.client.get(url) if url == LIST_URL else self.client.post(url, {}, format="json")
            self.assertEqual(res.status_code, 401, url)

    def test_customer_is_forbidden(self):
        self.client.force_authenticate(self.customer)
        res = self.client.get(LIST_URL)
        self.assertEqual(res.status_code, 403)

    def test_role_staff_is_allowed(self):
        self.as_staff()
        self.assertEqual(self.client.get(LIST_URL).status_code, 200)

    def test_django_is_staff_flag_is_allowed(self):
        """A user promoted via is_staff alone still reaches the desk."""
        superuser = User.objects.create_user(
            username="dispatcher",
            email="dispatcher@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,  # role deliberately NOT staff
        )
        superuser.is_staff = True
        superuser.save(update_fields=["is_staff"])
        self.as_staff(superuser)
        self.assertEqual(self.client.get(LIST_URL).status_code, 200)


class ListQueueTests(StaffDispatchTestCase):
    """Filters, ordering and pagination on the queue."""

    def test_customer_contact_snapshot_is_present(self):
        """Dispatch needs to phone the customer; the customer list must not."""
        self.as_staff()
        res = self.client.get(LIST_URL)
        row = res.data["results"][0]
        self.assertEqual(row["customer_name"], "Cora Ng")
        self.assertEqual(row["customer_phone"], "+91 90000 00000")
        self.assertIsNone(row["assigned_staff_name"])

    def test_customer_list_payload_hides_contacts(self):
        """Regression guard: /api/bookings/ must not grow these fields."""
        self.client.force_authenticate(self.customer)
        row = self.client.get("/api/bookings/").data["results"][0]
        self.assertNotIn("customer_phone", row)
        self.assertNotIn("customer_email", row)

    def test_assigned_unassigned_and_mine(self):
        # Nobody has claimed it yet, so it is in the unassigned queue.
        self.as_staff()
        unassigned = self.client.get(LIST_URL, {"assigned": "unassigned"})
        self.assertEqual(unassigned.data["count"], 1)

        mine = self.client.get(LIST_URL, {"assigned": "mine"})
        self.assertEqual(mine.data["count"], 0)

        # Hand it to the *other* technician, then re-read each queue.
        self.as_staff(self.other_staff)
        self.client.post(assign_url(self.booking.pk), {}, format="json")

        self.assertEqual(
            self.client.get(LIST_URL, {"assigned": "unassigned"}).data["count"], 0
        )
        theirs = self.client.get(LIST_URL, {"assigned": "mine"})
        self.assertEqual(theirs.data["count"], 1)
        self.assertEqual(theirs.data["results"][0]["assigned_staff_name"], "Omar Said")
        self.assertEqual(self.client.get(LIST_URL, {"assigned": "all"}).data["count"], 1)

        # Tara — the technician who did *not* claim it — sees it nowhere in
        # "mine", only in the full backlog.
        self.as_staff()
        self.assertEqual(self.client.get(LIST_URL, {"assigned": "mine"}).data["count"], 0)
        self.assertEqual(self.client.get(LIST_URL, {"assigned": "all"}).data["count"], 1)

    def test_claiming_moves_the_job_into_my_queue(self):
        self.as_staff()
        self.client.post(assign_url(self.booking.pk), {}, format="json")
        mine = self.client.get(LIST_URL, {"assigned": "mine"})
        self.assertEqual(mine.data["count"], 1)
        self.assertEqual(mine.data["results"][0]["assigned_staff_name"], "Tara Iyer")

    def test_status_filter_rejects_unknown_value(self):
        self.as_staff()
        res = self.client.get(LIST_URL, {"status": "not_a_status"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("status", res.data)

    def test_assigned_filter_rejects_unknown_value(self):
        self.as_staff()
        res = self.client.get(LIST_URL, {"assigned": "everyone"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("assigned", res.data)

    def test_ordered_by_preferred_slot(self):
        later = Booking.objects.create(
            customer=self.customer, customer_name="Cora Ng",
            customer_email="c@example.com", customer_phone="1",
            service_name="Plumbing", service_price=Decimal("299.00"),
            location="Andheri", address="1 Lane",
            preferred_date=timezone.localdate(),
            preferred_time="18:00",
        )
        self.as_staff()
        ids = [r["id"] for r in self.client.get(LIST_URL).data["results"]]
        self.assertLess(ids.index(later.pk), ids.index(self.booking.pk))


class AssignTests(StaffDispatchTestCase):
    def test_assign_sets_caller_and_writes_audit_row(self):
        self.as_staff()
        res = self.client.post(assign_url(self.booking.pk), {}, format="json")
        self.assertEqual(res.status_code, 200, res.data)

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.assigned_staff_id, self.staff.id)
        # Claiming enters the `claimed` milestone rather than only recording
        # an assignee; the customer's stepper reads the status, not the FK.
        self.assertEqual(self.booking.status, Booking.Status.CLAIMED)

        row = BookingStatusHistory.objects.get(booking=self.booking)
        self.assertEqual(row.changed_by_id, self.staff.id)
        self.assertEqual(
            row.notes,
            f"{Booking.milestone_note(Booking.Status.CLAIMED)} — "
            "Assigned to technician Tara Iyer",
        )

    def test_reassigning_own_job_is_idempotent(self):
        self.as_staff()
        self.client.post(assign_url(self.booking.pk), {}, format="json")
        res = self.client.post(assign_url(self.booking.pk), {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            BookingStatusHistory.objects.filter(booking=self.booking).count(), 1
        )

    def test_cannot_assign_a_cancelled_booking(self):
        self.booking.status = Booking.Status.CANCELLED
        self.booking.save(update_fields=["status"])
        self.as_staff()
        res = self.client.post(assign_url(self.booking.pk), {}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_missing_booking_is_404(self):
        self.as_staff()
        res = self.client.post(assign_url(99999), {}, format="json")
        self.assertEqual(res.status_code, 404)


class StatusTransitionTests(StaffDispatchTestCase):
    def _claim(self):
        self.as_staff()
        self.client.post(assign_url(self.booking.pk), {}, format="json")

    def test_legal_transition_writes_audited_history(self):
        self._claim()
        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.ACCEPTED, "notes": "Confirmed with the customer"},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.ACCEPTED)

        row = BookingStatusHistory.objects.filter(booking=self.booking).latest("id")
        self.assertEqual(row.previous_status, Booking.Status.CLAIMED)
        self.assertEqual(row.new_status, Booking.Status.ACCEPTED)
        # The stage's fixed description, with the caller's note appended rather
        # than replacing it — the audit row always names the milestone.
        self.assertEqual(
            row.notes,
            f"{Booking.milestone_note(Booking.Status.ACCEPTED)} — "
            "Confirmed with the customer",
        )
        self.assertEqual(row.changed_by_id, self.staff.id)

    def test_out_of_order_transition_is_refused(self):
        self._claim()
        # `in_progress` is three milestones ahead of `claimed`. Accepting it
        # would record work that was never shown to have started.
        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.IN_PROGRESS},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, Booking.Status.CLAIMED)

    def test_completion_stamps_completed_at(self):
        self._claim()
        for status in (
            Booking.Status.ACCEPTED,
            Booking.Status.ARRIVED,
            Booking.Status.IN_PROGRESS,
        ):
            res = self.client.post(
                status_url(self.booking.pk), {"status": status}, format="json"
            )
            self.assertEqual(res.status_code, 200, res.data)

        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.COMPLETED},
            format="json",
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.booking.refresh_from_db()
        self.assertIsNotNone(self.booking.completed_at)

    def test_cannot_leave_a_completed_booking(self):
        self._claim()
        self.booking.status = Booking.Status.COMPLETED
        self.booking.save(update_fields=["status"])
        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.IN_PROGRESS},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_cannot_leave_a_cancelled_booking(self):
        self._claim()
        self.booking.status = Booking.Status.CANCELLED
        self.booking.save(update_fields=["status"])
        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.IN_PROGRESS},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_no_op_transition_rejected(self):
        self._claim()
        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.CLAIMED},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_cannot_drive_someone_elses_job(self):
        self.as_staff(self.other_staff)
        self.client.post(assign_url(self.booking.pk), {}, format="json")

        self.as_staff()  # a different technician
        res = self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.ACCEPTED},
            format="json",
        )
        self.assertEqual(res.status_code, 400)

    def test_unknown_status_rejected(self):
        self._claim()
        res = self.client.post(
            status_url(self.booking.pk), {"status": "teleported"}, format="json"
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("status", res.data)


class CustomerTimelinePropagationTests(StaffDispatchTestCase):
    """
    The end-to-end contract of §3.3: what staff do is visible to the customer.
    """

    def test_customer_sees_technician_name_and_notes(self):
        self.as_staff()
        self.client.post(assign_url(self.booking.pk), {}, format="json")
        self.client.post(
            status_url(self.booking.pk),
            {"status": Booking.Status.ACCEPTED, "notes": "Dispatch confirmed at 10:05"},
            format="json",
        )

        # Same booking, read as the customer through the existing endpoint.
        self.client.force_authenticate(self.customer)
        res = self.client.get(f"/api/bookings/{self.booking.pk}/")
        self.assertEqual(res.status_code, 200)

        self.assertEqual(res.data["status"], Booking.Status.ACCEPTED)

        history = res.data["status_history"]
        self.assertTrue(history, "customer timeline must not be empty")

        # Chronological, oldest first — the customer's stepper reads the array
        # as the order things happened, so a newest-first payload would render
        # the trail backwards.
        self.assertEqual(
            [entry["new_status"] for entry in history],
            [Booking.Status.CLAIMED, Booking.Status.ACCEPTED],
        )
        self.assertEqual(
            [entry["id"] for entry in history],
            sorted(entry["id"] for entry in history),
        )

        top = history[-1]  # newest
        self.assertEqual(top["new_status"], Booking.Status.ACCEPTED)
        self.assertIn("Dispatch confirmed at 10:05", top["notes"])
        self.assertEqual(top["changed_by_name"], "Tara Iyer")

        # The claim itself is on the customer's timeline too.
        self.assertTrue(
            any("Assigned to technician" in (e["notes"] or "") for e in history)
        )
