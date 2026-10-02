"""
Tests for bay allocation in `EVBookingCreateSerializer`.

The station's ``available_ports`` column is a single number for the whole
station, decremented on booking creation and incremented on cancellation.
Nothing runs it back up when a session completes, and nothing reconciles it with
the reservations that actually exist — so it drifts permanently in both
directions. Availability therefore has to be computed from the reservations
covering the requested window, which is what these tests pin down.
"""
from datetime import time, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from api.serializers import (
    EVBookingCreateSerializer,
    count_active_bookings_overlapping,
)
from ev_charging.models import EVChargingBooking, EVChargingStation
from tests.accounts.factories import make_customer

BOOKINGS_URL = "/api/ev/bookings/"


def make_station(**overrides):
    defaults = {
        "name": "Test Hub",
        "slug": "test-hub",
        "address": "1 Test Road",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
        "charging_speed_kw": 60,
        "price_per_kwh": Decimal("18.00"),
        "total_ports": 2,
        "available_ports": 2,
        "opens_at": time(0, 0),
        "closes_at": time(23, 59),
        "is_24_hours": True,
    }
    defaults.update(overrides)
    return EVChargingStation.objects.create(**defaults)


def next_slot_start(hours_ahead=2):
    """A published 30-minute window start, comfortably in the future."""
    now = timezone.localtime()
    candidate = now.replace(minute=0, second=0, microsecond=0) + timedelta(
        hours=hours_ahead
    )
    # The grid only publishes windows on the half hour.
    return candidate.replace(minute=0 if candidate.minute < 30 else 30)


def make_booking(customer, station, date, start, end, status):
    return EVChargingBooking.objects.create(
        customer=customer,
        customer_name=customer.username,
        customer_email=customer.email,
        customer_phone="",
        station=station,
        vehicle_number="KA01AB1234",
        booking_date=date,
        start_time=start,
        end_time=end,
        estimated_kwh=Decimal("20"),
        estimated_cost=Decimal("360"),
        status=status,
    )


class OverlapCountTests(APITestCase):
    def setUp(self):
        self.station = make_station()
        self.customer = make_customer(email="cust@example.com", username="cust")
        self.date = timezone.localtime().date() + timedelta(days=1)

    def count(self, start, end):
        return count_active_bookings_overlapping(
            self.station, self.date, start, end
        )

    def test_no_bookings_means_nothing_overlaps(self):
        self.assertEqual(self.count(time(10, 0), time(10, 30)), 0)

    def test_identical_window_overlaps(self):
        make_booking(
            self.customer, self.station, self.date, time(10, 0), time(10, 30),
            EVChargingBooking.Status.CONFIRMED,
        )
        self.assertEqual(self.count(time(10, 0), time(10, 30)), 1)

    def test_partially_overlapping_window_overlaps(self):
        make_booking(
            self.customer, self.station, self.date, time(10, 0), time(11, 30),
            EVChargingBooking.Status.CONFIRMED,
        )
        # 11:00-11:30 sits inside the 10:00-11:30 booking.
        self.assertEqual(self.count(time(11, 0), time(11, 30)), 1)
        # So does 10:30-11:00.
        self.assertEqual(self.count(time(10, 30), time(11, 0)), 1)

    def test_abutting_window_does_not_overlap(self):
        """Half-open: a bay handed over at 10:00 is free at 10:00."""
        make_booking(
            self.customer, self.station, self.date, time(10, 0), time(10, 30),
            EVChargingBooking.Status.CONFIRMED,
        )
        self.assertEqual(self.count(time(10, 30), time(11, 0)), 0)
        self.assertEqual(self.count(time(9, 30), time(10, 0)), 0)

    def test_containing_and_contained_windows_overlap(self):
        make_booking(
            self.customer, self.station, self.date, time(10, 0), time(11, 0),
            EVChargingBooking.Status.CONFIRMED,
        )
        self.assertEqual(self.count(time(10, 15), time(10, 45)), 1)
        self.assertEqual(self.count(time(9, 0), time(12, 0)), 1)

    def test_cancelled_and_completed_bookings_release_the_bay(self):
        for index, status in enumerate(
            (
                EVChargingBooking.Status.CANCELLED,
                EVChargingBooking.Status.COMPLETED,
            )
        ):
            with self.subTest(status=status):
                make_booking(
                    self.customer, self.station, self.date,
                    time(10, 0), time(10, 30), status,
                )
                self.assertEqual(self.count(time(10, 0), time(10, 30)), 0)

    def test_other_stations_and_other_days_are_not_counted(self):
        elsewhere = make_station(
            name="Other", slug="other-hub", total_ports=1, available_ports=1
        )
        make_booking(
            self.customer, elsewhere, self.date, time(10, 0), time(10, 30),
            EVChargingBooking.Status.CONFIRMED,
        )
        self.assertEqual(self.count(time(10, 0), time(10, 30)), 0)

    def test_excluded_booking_is_ignored(self):
        booking = make_booking(
            self.customer, self.station, self.date, time(10, 0), time(10, 30),
            EVChargingBooking.Status.CONFIRMED,
        )
        self.assertEqual(
            count_active_bookings_overlapping(
                self.station, self.date, time(10, 0), time(10, 30),
                exclude_booking_id=booking.pk,
            ),
            0,
        )


class BookingValidationTests(APITestCase):
    def setUp(self):
        # One bay. A single-bay station turns "is this window full?" into a
        # yes/no question, which is the thing actually under test — a second
        # free bay would mask an off-by-one in the count.
        self.station = make_station(total_ports=1, available_ports=1)
        self.customer = make_customer(email="cust@example.com", username="cust")
        self.client.force_authenticate(self.customer)
        self.when = next_slot_start()
        self.date = self.when.date()
        self.start = self.when.time().replace(second=0, microsecond=0)
        self.end = (
            self.when + timedelta(minutes=30)
        ).time().replace(second=0, microsecond=0)

    def book(self, vehicle="KA01AB1234"):
        return self.client.post(
            BOOKINGS_URL,
            {
                "station_id": self.station.pk,
                "slot_time": self.when.isoformat(),
                "vehicle_number": vehicle,
            },
            format="json",
        )

    def reserve_directly(self, start, end, status=EVChargingBooking.Status.CONFIRMED):
        make_booking(
            self.customer, self.station, self.date, start, end, status
        )

    def test_first_booking_succeeds(self):
        response = self.book()
        self.assertEqual(response.status_code, 201, response.content)

    def test_bays_are_limited_per_window(self):
        """`total_ports` is the ceiling for one window, not per window."""
        self.reserve_directly(self.start, self.end)
        # The one bay is held, so the next request has nowhere to go.
        response = self.book()
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("slot_time", response.json())

    def test_a_held_bay_caps_a_wider_station(self):
        """The ceiling scales with the station, and is per window."""
        wide = make_station(
            name="Wide Hub",
            slug="wide-hub",
            total_ports=2,
            available_ports=2,
        )
        make_booking(
            self.customer, wide, self.date, self.start, self.end,
            EVChargingBooking.Status.CONFIRMED,
        )

        def book_once(vehicle):
            return self.client.post(
                BOOKINGS_URL,
                {
                    "station_id": wide.pk,
                    "slot_time": self.when.isoformat(),
                    "vehicle_number": vehicle,
                },
                format="json",
            )

        self.assertEqual(book_once("KA01AB1234").status_code, 201)
        self.assertEqual(book_once("KA01AB5678").status_code, 400)

    def test_a_later_window_is_unaffected(self):
        """The whole point: the window, not the station, is what's scarce."""
        self.reserve_directly(self.start, self.end)
        later = self.when + timedelta(hours=2)
        response = self.client.post(
            BOOKINGS_URL,
            {
                "station_id": self.station.pk,
                "slot_time": later.isoformat(),
                "vehicle_number": "KA01AB1234",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_stale_counter_does_not_close_a_station_with_free_bays(self):
        """
        The regression this replaces.

        `available_ports` had already been driven to zero — a completed
        session nobody cancelled — while the reservations table showed the
        requested window entirely free. Validation used to consult the counter
        and refuse, which is how a station became permanently unbookable.
        """
        self.station.available_ports = 0
        self.station.save(update_fields=["available_ports"])

        response = self.book()
        self.assertEqual(response.status_code, 201, response.content)

        # The counter is a display figure and is clamped, never negative.
        self.station.refresh_from_db()
        self.assertEqual(self.station.available_ports, 0)

    def test_counter_drifting_high_cannot_exceed_total_ports(self):
        """
        The mirror case: the counter says two bays free when one is held.

        Validation counts the reservation rather than trusting the column, so
        the hold still counts against the request that would over-subscribe the
        bay.
        """
        self.reserve_directly(self.start, self.end)
        self.station.available_ports = 2
        self.station.save(update_fields=["available_ports"])

        response = self.book()
        self.assertEqual(response.status_code, 400, response.content)

    def test_booking_a_full_station_does_not_write_a_row(self):
        self.reserve_directly(self.start, self.end)
        before = EVChargingBooking.objects.count()
        self.book()
        self.assertEqual(EVChargingBooking.objects.count(), before)

    def test_overlapping_long_session_blocks_its_interior_window(self):
        """A 10:00-11:30 session blocks 10:30, which is not its start time."""
        self.reserve_directly(self.start, (self.when + timedelta(hours=1)).time())
        inside = self.when + timedelta(minutes=30)
        response = self.client.post(
            BOOKINGS_URL,
            {
                "station_id": self.station.pk,
                "slot_time": inside.isoformat(),
                "vehicle_number": "KA01AB1234",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)

    def test_serialiser_agrees_with_the_helper(self):
        """`validate` must use the count, not the grid's cached availability."""
        self.reserve_directly(self.start, self.end)
        serializer = EVBookingCreateSerializer(
            data={
                "station_id": self.station.pk,
                "slot_time": self.when.isoformat(),
                "vehicle_number": "KA01AB1234",
            },
            context={"request": None},
        )
        self.assertFalse(serializer.is_valid(), serializer.errors)
        self.assertIn("slot_time", serializer.errors)