"""
End-to-end smoke check for the EV charging API.

Run with the development settings against a scratch database::

    python -m scripts.smoke_ev_api

It is a plain script rather than a pytest module so it can be run from a shell
against a live server, but it uses the in-process test client, so it never
binds a port and never touches the real network.
"""
import os
import sys
from datetime import timedelta
from pathlib import Path

import django

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client  # noqa: E402
from django.utils import timezone  # noqa: E402

from accounts.models import User  # noqa: E402
from ev_charging.models import EVChargingBooking, EVChargingStation  # noqa: E402

FAILURES = []


def check(label, condition, detail=""):
    mark = "ok  " if condition else "FAIL"
    if not condition:
        FAILURES.append(label)
    print(f"  [{mark}] {label}{(' — ' + str(detail)) if detail else ''}")


def main():
    station = EVChargingStation.objects.filter(is_24_hours=True).first()
    if station is None:
        print("no 24x7 station in the database; aborting")
        return 1

    station.available_ports = station.total_ports
    station.status = EVChargingStation.Status.AVAILABLE
    station.save(update_fields=["available_ports", "status"])

    username = "ev_smoke"
    user, _ = User.objects.get_or_create(
        username=username, defaults={"email": "ev_smoke@example.com"}
    )
    user.role = User.Role.CUSTOMER
    user.is_staff = False
    user.set_password("Str0ngPass!23")
    user.save()

    client = Client()
    resp = client.post(
        "/api/auth/login/",
        {"identifier": username, "password": "Str0ngPass!23"},
        content_type="application/json",
    )
    check("login", resp.status_code == 200, resp.content[:120])
    token = resp.json()["access"]
    auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    print("\nstations list")
    resp = client.get("/api/ev/stations/")
    body = resp.json()
    check("200 on list", resp.status_code == 200, resp.status_code)
    check("availability_tone present", "availability_tone" in body[0], body[0].keys())
    check(
        "price is a JSON number",
        isinstance(body[0]["price_per_kwh"], (int, float)),
        type(body[0]["price_per_kwh"]).__name__,
    )
    check(
        "fast filter narrows",
        all(
            s["charging_speed_kw"] >= 50
            for s in client.get("/api/ev/stations/?is_fast_charging=true").json()
        ),
    )
    check(
        "available filter narrows",
        all(
            s["available_ports"] > 0
            for s in client.get("/api/ev/stations/?available_only=true").json()
        ),
    )
    check(
        "search works",
        any(
            s["id"] == station.id
            for s in client.get(f"/api/ev/stations/?search={station.name[:6]}").json()
        ),
    )

    print("\nstation detail + slot grid")
    resp = client.get(f"/api/ev/stations/{station.id}/")
    detail = resp.json()
    grid = detail["slot_grid"]
    slots = grid["slots"]
    check("200 on detail", resp.status_code == 200, resp.status_code)
    check("grid is non-empty", len(slots) > 0, len(slots))
    check("slot length published", grid["duration_minutes"] == 30, grid["duration_minutes"])
    check("horizon published", grid["horizon_hours"] == 24, grid["horizon_hours"])
    check("hours display present", bool(detail["hours_display"]), detail["hours_display"])

    print("\nbooking validation")
    resp = client.post(
        "/api/ev/bookings/",
        {
            "station_id": station.id,
            "slot_time": "2020-01-01T10:00:00Z",
            "vehicle_number": "KA05AB1234",
        },
        content_type="application/json",
        **auth,
    )
    check("past slot refused", resp.status_code == 400, resp.content[:160])

    offgrid = (timezone.localtime() + timedelta(hours=3)).replace(minute=7, second=0)
    resp = client.post(
        "/api/ev/bookings/",
        {
            "station_id": station.id,
            "slot_time": offgrid.isoformat(),
            "vehicle_number": "KA05AB1234",
        },
        content_type="application/json",
        **auth,
    )
    check("off-grid slot refused", resp.status_code == 400, resp.content[:160])

    resp = client.post(
        "/api/ev/bookings/",
        {"station_id": station.id, "slot_time": "2020-01-01T10:00:00Z"},
        content_type="application/json",
        **auth,
    )
    check("missing vehicle_number refused", resp.status_code == 400, resp.content[:160])

    print("\nbooking create")
    before = EVChargingStation.objects.get(pk=station.id).available_ports
    chosen = next(s for s in slots if s["is_available"])
    # `start` came back through a JSON render, so it is a wall-clock string
    # like "14:30:00" rather than a `datetime.time`.
    hour, minute, _ = (int(part) for part in chosen["start"].split(":"))
    when = timezone.localtime().replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    if when <= timezone.localtime():
        when += timedelta(days=1)
    resp = client.post(
        "/api/ev/bookings/",
        {
            "station_id": station.id,
            "slot_time": when.isoformat(),
            "vehicle_number": "ka05ab1234",
            "estimated_kwh": "42.5",
        },
        content_type="application/json",
        **auth,
    )
    check("201 on create", resp.status_code == 201, resp.content[:250])
    booking = resp.json()
    check(
        "vehicle number normalised",
        booking.get("vehicle_number") == "KA05AB1234",
        booking.get("vehicle_number"),
    )
    check(
        "cost derived server-side",
        abs(booking.get("estimated_cost", 0) - 42.5 * float(station.price_per_kwh)) < 0.02,
        booking.get("estimated_cost"),
    )
    check(
        "bay decremented",
        EVChargingStation.objects.get(pk=station.id).available_ports == before - 1,
        f"{before} -> {EVChargingStation.objects.get(pk=station.id).available_ports}",
    )

    print("\nbooking list + cancel")
    resp = client.get("/api/ev/bookings/", **auth)
    check("own booking listed", any(b["id"] == booking["id"] for b in resp.json()["results"]))

    resp = client.get(f"/api/ev/bookings/{booking['id']}/", **auth)
    check("200 on own detail", resp.status_code == 200, resp.status_code)

    resp = client.post(
        f"/api/ev/bookings/{booking['id']}/cancel/", {}, content_type="application/json", **auth
    )
    check("200 on cancel", resp.status_code == 200, resp.content[:160])
    check(
        "bay returned",
        EVChargingStation.objects.get(pk=station.id).available_ports == before,
        EVChargingStation.objects.get(pk=station.id).available_ports,
    )

    resp = client.post(
        f"/api/ev/bookings/{booking['id']}/cancel/", {}, content_type="application/json", **auth
    )
    check("double cancel refused", resp.status_code == 400, resp.content[:160])

    EVChargingBooking.objects.filter(pk=booking["id"]).delete()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) failed: {', '.join(FAILURES)}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
