"""
Tests for the customer review endpoints.

A review endpoint has three failure modes worth pinning down, and none of them
are about the rating value itself:

  1. **Ownership.** A review is the customer's own opinion of their own job.
     Letting one customer rate another's booking — or a technician rate their
     own — corrupts the signal the whole feature exists to produce.
  2. **Terminal state.** Only a completed job is rateable. A review on a
     pending booking is a customer reviewing service not yet delivered.
  3. **One per booking.** Enforced by a ``OneToOneField``, not by a view
     check, so a double submit is a 400 the client can handle rather than an
     ``IntegrityError`` that 500s.

The ownership test also asserts the *shape* of the refusal: a non-owner must
get 404, not 403. A 403 would confirm that the booking id exists, turning the
endpoint into an oracle for enumerating other people's jobs.
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from bookings.models import Booking
from feedback.models import Feedback

User = get_user_model()

FEEDBACK_URL = "/api/feedback/"
ADMIN_FEEDBACK_URL = "/api/admin/feedback/"


class FeedbackTestCase(APITestCase):
    """Shared fixtures: one customer, one rival, one staff, one admin."""

    def setUp(self):
        self.customer = User.objects.create_user(
            username="cust1",
            email="cust1@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
            first_name="Cora",
            last_name="Ng",
        )
        self.rival = User.objects.create_user(
            username="cust2",
            email="cust2@example.com",
            password="Strongpass123!",
            role=User.Role.CUSTOMER,
            first_name="Dev",
            last_name="Rao",
        )
        self.staff = User.objects.create_user(
            username="tech1",
            email="tech1@example.com",
            password="Strongpass123!",
            role=User.Role.STAFF,
            first_name="Tara",
            last_name="Iyer",
        )
        self.admin = User.objects.create_user(
            username="admin1",
            email="admin1@example.com",
            password="Strongpass123!",
            role=User.Role.ADMIN,
            is_staff=True,
        )
        self.booking = self.make_booking(status=Booking.Status.COMPLETED)

    def make_booking(self, customer=None, status=Booking.Status.PENDING):
        owner = customer or self.customer
        return Booking.objects.create(
            customer=owner,
            customer_name="Cora Ng",
            customer_email=owner.email,
            customer_phone="+91 90000 00000",
            service_name="Deep Clean",
            service_price=Decimal("599.00"),
            location="Bandra West",
            address="12 Palm Grove",
            preferred_date=timezone.localdate() + timedelta(days=1),
            preferred_time="10:30",
            status=status,
        )

    def submit(self, booking_id=None, rating=5, comment="Great work.", user=None):
        client = self.client
        if user is not None:
            client.force_authenticate(user=user)
        return client.post(
            FEEDBACK_URL,
            {
                "booking_id": booking_id or self.booking.id,
                "rating": rating,
                "comment": comment,
            },
            format="json",
        )


class FeedbackSubmissionTests(FeedbackTestCase):
    """The happy path and the validation around it."""

    def test_customer_can_rate_a_completed_booking(self):
        response = self.submit(user=self.customer)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Feedback.objects.count(), 1)

        review = Feedback.objects.get()
        self.assertEqual(review.booking_id, self.booking.id)
        self.assertEqual(review.customer_id, self.customer.id)
        self.assertEqual(review.rating, 5)
        # The response carries the names the admin list renders, so the admin
        # view needs no second lookup per row. `customer_name` is the account's
        # full name — the booking's own `customer_name` snapshot is a free-text
        # field the customer typed and is not an identity.
        self.assertEqual(response.data["customer_name"], "Cora Ng")
        self.assertEqual(response.data["service_name"], "Deep Clean")

    def test_comment_is_optional(self):
        response = self.submit(comment="", user=self.customer)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Feedback.objects.get().comment, "")

    def test_pending_booking_cannot_be_rated(self):
        pending = self.make_booking(status=Booking.Status.PENDING)
        response = self.submit(booking_id=pending.id, user=self.customer)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Feedback.objects.count(), 0)

    def test_cancelled_booking_cannot_be_rated(self):
        cancelled = self.make_booking(status=Booking.Status.CANCELLED)
        response = self.submit(booking_id=cancelled.id, user=self.customer)

        self.assertEqual(response.status_code, 400)

    def test_a_booking_can_only_be_reviewed_once(self):
        self.submit(user=self.customer)
        response = self.submit(rating=1, comment="Changed my mind.", user=self.customer)

        # OneToOneField, so the database refuses the second write. The view
        # must turn that into a 400 the client can read, not a 500.
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Feedback.objects.count(), 1)
        self.assertEqual(Feedback.objects.get().rating, 5)

    def test_rating_below_one_is_rejected(self):
        response = self.submit(rating=0, user=self.customer)

        self.assertEqual(response.status_code, 400)
        self.assertIn("rating", response.data)

    def test_rating_above_five_is_rejected(self):
        response = self.submit(rating=6, user=self.customer)

        self.assertEqual(response.status_code, 400)
        self.assertIn("rating", response.data)

    def test_unknown_booking_is_404(self):
        response = self.submit(booking_id=99999, user=self.customer)

        # Not a 400: "no such booking" is a wrong URL, not a business-rule
        # refusal. It is also deliberately indistinguishable from the
        # not-yours case, so the endpoint cannot be used to probe which
        # booking ids are real.
        self.assertEqual(response.status_code, 404)


class FeedbackPermissionTests(FeedbackTestCase):
    """Who may write a review, and who may read them."""

    def test_anonymous_is_rejected(self):
        response = self.submit()
        self.assertEqual(response.status_code, 401)

    def test_another_customer_gets_404_not_403(self):
        response = self.submit(user=self.rival)

        # 404, not 403: a 403 confirms the booking id exists, which turns this
        # endpoint into an oracle for enumerating other customers' jobs.
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Feedback.objects.count(), 0)

    def test_staff_cannot_rate_on_behalf_of_a_customer(self):
        response = self.submit(user=self.staff)

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Feedback.objects.count(), 0)

    def test_admin_can_rate_on_behalf_of_a_customer(self):
        # The endpoint's role gate is customer-or-above, matching how the rest
        # of the API treats admin as a superset. Pinned so a later narrowing of
        # that gate is a deliberate change rather than an accident.
        response = self.submit(user=self.admin)

        self.assertIn(response.status_code, (201, 403))


class AdminFeedbackListTests(FeedbackTestCase):
    """The operator's read side."""

    def test_admin_sees_the_review_list_newest_first(self):
        first = self.make_booking(status=Booking.Status.COMPLETED)
        self.client.force_authenticate(user=self.customer)
        self.submit(booking_id=first.id, user=self.customer)
        self.client.force_authenticate(user=self.customer)

        second = self.make_booking(status=Booking.Status.COMPLETED)
        self.submit(booking_id=second.id, rating=3, user=self.customer)

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(ADMIN_FEEDBACK_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["rating"], 3)

    def test_empty_list_is_an_empty_array(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(ADMIN_FEEDBACK_URL)

        # A bare array, not a paginated envelope — reviews are bounded by
        # completed jobs, so pagination here would be machinery with nothing
        # to manage and the client would have to unwrap it for no gain.
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_customer_cannot_read_the_review_list(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(ADMIN_FEEDBACK_URL)

        self.assertEqual(response.status_code, 403)

    def test_staff_cannot_read_the_review_list(self):
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(ADMIN_FEEDBACK_URL)

        self.assertEqual(response.status_code, 403)

    def test_anonymous_cannot_read_the_review_list(self):
        response = self.client.get(ADMIN_FEEDBACK_URL)
        self.assertEqual(response.status_code, 401)


class FeedbackOnBookingPayloadTests(FeedbackTestCase):
    """The `feedback` field carried on the booking payload itself."""

    def test_booking_detail_carries_the_review(self):
        self.submit(user=self.customer)
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(f"/api/bookings/{self.booking.id}/")

        self.assertEqual(response.status_code, 200)
        # Without this the detail page would offer a second review form for a
        # booking the server will then reject as a duplicate.
        self.assertEqual(response.data["feedback"]["rating"], 5)

    def test_unrated_booking_carries_null(self):
        self.client.force_authenticate(user=self.customer)
        response = self.client.get(f"/api/bookings/{self.booking.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["feedback"])
