"""
Tests for object-level access on the staff booking views.

`StaffBookingListView` filtered its queryset down to the caller's own jobs plus
the unassigned queue; `StaffBookingDetailView` did not, because it never
overrode `get_queryset()`. A technician could therefore reach any booking by id
— read a customer's name, phone number and address, and drive the booking
through the lifecycle with the plain status form — while the list they were
offered the same URL from showed they had no such job.

The two views are now defined in terms of one shared queryset builder, so a
detail URL can only ever resolve to a booking the list would have shown.
"""
from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from bookings.models import Booking
from services.models import Service, ServiceCategory
from tests.accounts.factories import make_admin, make_customer, make_staff

User = get_user_model()

PASSWORD = "Strongpass123!"


def make_service():
    category, _ = ServiceCategory.objects.get_or_create(
        slug="electrical", defaults={"name": "Electrical"}
    )
    service, _ = Service.objects.get_or_create(
        category=category,
        slug="switchboard-inspection",
        defaults={
            "name": "Switchboard Inspection",
            "short_description": "Board audit",
            "price": "799.00",
            "estimated_duration": 60,
        },
    )
    return service


def make_booking(customer, assigned_staff=None, status=Booking.Status.PENDING):
    return Booking.objects.create(
        customer=customer,
        customer_name=customer.username,
        customer_email=customer.email,
        customer_phone="9800000000",
        service_name="Switchboard Inspection",
        service_price="799.00",
        preferred_date=timezone_today(),
        preferred_time=time(10, 0),
        location="Bengaluru",
        address="House No. 12, Main Road",
        status=status,
        assigned_staff=assigned_staff,
    )


def timezone_today():
    from django.utils import timezone

    return timezone.now().date() + timedelta(days=1)


class StaffBookingDetailAccessTests(TestCase):
    def setUp(self):
        self.service = make_service()
        self.customer = make_customer(email="cust@example.com", username="cust")
        self.staff = make_staff(email="staff@example.com", username="staff")
        self.other_staff = make_staff(
            email="other@example.com", username="other"
        )
        self.admin = make_admin(email="admin@example.com", username="admin")
        self.foreign = make_booking(self.customer, assigned_staff=self.other_staff)

    def detail_url(self, booking):
        return reverse("bookings:staff_detail", kwargs={"pk": booking.pk})

    def login_staff(self, user):
        self.client.force_login(user)

    def test_own_booking_is_readable(self):
        booking = make_booking(self.customer, assigned_staff=self.staff)
        self.login_staff(self.staff)
        response = self.client.get(self.detail_url(booking))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["booking"], booking)

    def test_unassigned_booking_is_readable(self):
        """The claim queue is exactly what the unassigned filter is for."""
        booking = make_booking(self.customer, assigned_staff=None)
        self.login_staff(self.staff)
        self.assertEqual(self.client.get(self.detail_url(booking)).status_code, 200)

    def test_another_technicians_booking_is_not_readable(self):
        self.login_staff(self.staff)
        response = self.client.get(self.detail_url(self.foreign))
        self.assertEqual(response.status_code, 404)

    def test_admin_sees_every_booking(self):
        """The dispatch desk reassigns jobs, so it needs the whole board."""
        self.login_staff(self.admin)
        response = self.client.get(self.detail_url(self.foreign))
        self.assertEqual(response.status_code, 200)

    def test_customer_cannot_reach_the_staff_detail_view(self):
        self.login_staff(self.customer)
        response = self.client.get(self.detail_url(self.foreign))
        # `StaffRequiredMixin` refuses a non-staff caller outright, so the
        # queryset is never consulted and the customer learns nothing about
        # the booking.
        self.assertEqual(response.status_code, 403)

    def test_anonymous_is_redirected_to_login(self):
        response = self.client.get(self.detail_url(self.foreign))
        self.assertEqual(response.status_code, 302)


class StaffBookingMutationTests(TestCase):
    """The POST is the half that actually changes something."""

    def setUp(self):
        self.service = make_service()
        self.customer = make_customer(email="cust@example.com", username="cust")
        self.staff = make_staff(email="staff@example.com", username="staff")
        self.other_staff = make_staff(
            email="other@example.com", username="other"
        )
        self.foreign = make_booking(self.customer, assigned_staff=self.other_staff)
        self.own = make_booking(
            self.customer, assigned_staff=self.staff, status=Booking.Status.CLAIMED
        )

    def post_status(self, booking, status, notes=""):
        return self.client.post(
            reverse("bookings:staff_detail", kwargs={"pk": booking.pk}),
            {"status": status, "notes": notes},
        )

    def test_cannot_update_another_technicians_booking(self):
        self.client.force_login(self.staff)
        response = self.post_status(
            self.foreign, Booking.Status.ACCEPTED, "not mine"
        )
        self.assertEqual(response.status_code, 404)
        self.foreign.refresh_from_db()
        self.assertEqual(self.foreign.status, Booking.Status.PENDING)

    def test_can_update_own_booking(self):
        self.client.force_login(self.staff)
        response = self.post_status(self.own, Booking.Status.ACCEPTED)
        self.assertEqual(response.status_code, 302)
        self.own.refresh_from_db()
        self.assertEqual(self.own.status, Booking.Status.ACCEPTED)

    def test_status_history_is_not_written_for_a_refused_update(self):
        from bookings.models import BookingStatusHistory

        self.client.force_login(self.staff)
        self.post_status(self.foreign, Booking.Status.ACCEPTED)
        self.assertFalse(
            BookingStatusHistory.objects.filter(booking=self.foreign).exists()
        )


class StaffBookingListAccessTests(TestCase):
    def setUp(self):
        self.service = make_service()
        self.customer = make_customer(email="cust@example.com", username="cust")
        self.staff = make_staff(email="staff@example.com", username="staff")
        self.other_staff = make_staff(
            email="other@example.com", username="other"
        )
        self.own = make_booking(self.customer, assigned_staff=self.staff)
        self.unassigned = make_booking(self.customer, assigned_staff=None)
        self.foreign = make_booking(self.customer, assigned_staff=self.other_staff)

    def test_list_excludes_other_technicians_bookings(self):
        self.client.force_login(self.staff)
        response = self.client.get(reverse("bookings:staff_list"))
        listed = {b.pk for b in response.context["bookings"]}
        self.assertEqual(listed, {self.own.pk, self.unassigned.pk})

    def test_list_urls_all_resolve_for_technicians(self):
        """Every link the list offers must be reachable — and nothing else."""
        self.client.force_login(self.staff)
        response = self.client.get(reverse("bookings:staff_list"))
        for booking in response.context["bookings"]:
            with self.subTest(booking=booking.pk):
                detail = self.client.get(
                    reverse("bookings:staff_detail", kwargs={"pk": booking.pk})
                )
                self.assertEqual(detail.status_code, 200)
        self.assertEqual(
            self.client.get(
                reverse("bookings:staff_detail", kwargs={"pk": self.foreign.pk})
            ).status_code,
            404,
        )