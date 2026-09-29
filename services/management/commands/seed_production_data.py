"""
Idempotent production data seeder.

Render runs this from the build command so a fresh production database is
usable the moment it is created — there is no paid interactive shell on a free
web service to `createsuperuser` or paste fixtures into. That means the command
has to be safe to run on *every* build: builds are frequent, the database
outlives them, and a seeder that appends would duplicate the catalogue a
little more each time. Every row below is therefore created with
``get_or_create`` and a natural key, so a second run is a no-op that reports
"existing" rather than a second copy of the same station.

Nothing here is destructive. Existing rows are never updated or deleted — a
seeded row that an admin has since edited keeps their edit. That does mean a
change to a value in the literals below will *not* propagate to a database
that already has the row; for that, write an explicit data migration.
"""
import os
from decimal import Decimal
from datetime import time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from ev_charging.models import EVChargingStation
from services.models import Service, ServiceCategory

User = get_user_model()


# ── Seed data ─────────────────────────────────────────────────────────────────

CATEGORIES = [
    {
        "name": "Electrical",
        "slug": "electrical",
        "description": "Wiring, panels, lighting and electrical safety inspections.",
        "icon": "bi-lightning-charge",
        "display_order": 1,
    },
    {
        "name": "Home Maintenance",
        "slug": "home-maintenance",
        "description": "Plumbing, carpentry, painting and general household upkeep.",
        "icon": "bi-tools",
        "display_order": 2,
    },
    {
        "name": "Appliance Repair",
        "slug": "appliance-repair",
        "description": "Diagnostics and repair for kitchen and laundry appliances.",
        "icon": "bi-nut",
        "display_order": 3,
    },
    {
        "name": "Cleaning",
        "slug": "cleaning",
        "description": "Deep cleaning, sanitisation and recurring housekeeping plans.",
        "icon": "bi-stars",
        "display_order": 4,
    },
]

# `category` refers to a CATEGORIES slug above, not a primary key, so the
# literals stay readable and a reordering of the categories cannot silently
# repoint a service at the wrong parent.
SERVICES = [
    {
        "category": "electrical",
        "name": "Switchboard & MCB Inspection",
        "slug": "switchboard-mcb-inspection",
        "short_description": "Licensed electrician audits your distribution board and earthing.",
        "description": (
            "A full inspection of the main distribution board: every MCB tested "
            "and labelled, earthing continuity checked, loose or scorched "
            "terminations re-torqued, and a written report on what was found."
        ),
        "price": Decimal("799.00"),
        "estimated_duration": 60,
        "what_included": (
            "MCB trip-test on every circuit\n"
            "Earth continuity and loop impedance readings\n"
            "Torquing and re-labelling of the board\n"
            "Written defect report with photographs"
        ),
        "is_featured": True,
        "display_order": 1,
    },
    {
        "category": "electrical",
        "name": "Ceiling Fan & Fixture Installation",
        "slug": "ceiling-fan-fixture-installation",
        "short_description": "Fan, light or chandelier mounted and wired to an existing point.",
        "description": (
            "Installation of one new ceiling fan, pendant light or chandelier to "
            "an existing supply point. Includes balancing the fan, setting the "
            "reverser for winter operation, and testing from a proper earth."
        ),
        "price": Decimal("599.00"),
        "estimated_duration": 45,
        "what_included": (
            "Mounting bracket and downrod fitted to a sound box\n"
            "Wiring with heat-shrink terminations\n"
            "Fan balancing and reverse-mode test\n"
            "Old unit removed and disposed of"
        ),
        "is_featured": False,
        "display_order": 2,
    },
    {
        "category": "electrical",
        "name": "Full Home Rewiring",
        "slug": "full-home-rewiring",
        "short_description": "Complete rewiring with copper conductors and a modern consumer unit.",
        "description": (
            "A whole-house rewire carried out to current IS standard: all cable "
            "replaced, new consumer unit with RCBOs fitted, and every circuit "
            "re-terminated and labelled. The most invasive job we book, and the "
            "one that removes the most risk from an older installation."
        ),
        "price": Decimal("24999.00"),
        "estimated_duration": 480,
        "what_included": (
            "All existing cable removed and recycled\n"
            "RCBO-protected consumer unit with surge protection\n"
            "Fire-stopping at every penetration\n"
            "Full circuit testing and certification on completion"
        ),
        "is_featured": True,
        "display_order": 3,
    },
    {
        "category": "home-maintenance",
        "name": "Leak Detection & Pipe Repair",
        "slug": "leak-detection-pipe-repair",
        "short_description": "Trace the hidden leak, then make a permanent repair.",
        "description": (
            "Non-invasive leak tracing — acoustic and thermal — to find the "
            "failure without breaking open walls, followed by a permanent repair "
            "at the source rather than a temporary patch over the symptom."
        ),
        "price": Decimal("899.00"),
        "estimated_duration": 90,
        "what_included": (
            "Acoustic and thermal survey of the affected zone\n"
            "Permanent repair at the leak point\n"
            "Pressure test of the repaired run\n"
            "Water-billing of any damage ceiling affected"
        ),
        "is_featured": True,
        "display_order": 1,
    },
    {
        "category": "home-maintenance",
        "name": "Door & Window Repair",
        "slug": "door-window-repair",
        "short_description": "Locks, hinges, handles and closers fixed on site.",
        "description": (
            "Repair of a single door or window: realigning a sagging leaf, "
            "replacing or re-hanging hinges, servicing a multipoint lock, or "
            "fitting new handles. Carried out on site for standard profiles."
        ),
        "price": Decimal("649.00"),
        "estimated_duration": 60,
        "what_included": (
            "Diagnosis of the alignment or hardware fault\n"
            "Locks, hinges or closers replaced as needed\n"
            "Frame and sash re-aligned and adjusted\n"
            "Operation tested through a full cycle"
        ),
        "is_featured": False,
        "display_order": 2,
    },
    {
        "category": "appliance-repair",
        "name": "Washing Machine Repair",
        "slug": "washing-machine-repair",
        "short_description": "Front-load and top-load diagnosis and repair at your door.",
        "description": (
            "On-site diagnosis and repair of front-load and top-load washing "
            "machines: drain pumps, bearings, door interlocks, motors and control "
            "boards. Parts are quoted and fitted only after you approve them."
        ),
        "price": Decimal("699.00"),
        "estimated_duration": 75,
        "what_included": (
            "Full diagnostic and fault trace on site\n"
            "Labour charge with no call-out fee\n"
            "Original spare parts, quoted before fitting\n"
            "Wash cycle completed with the customer present"
        ),
        "is_featured": True,
        "display_order": 1,
    },
    {
        "category": "appliance-repair",
        "name": "Refrigerator & Deep Freezer Repair",
        "slug": "refrigerator-freezer-repair",
        "short_description": "Gas, thermostat and compressor faults serviced at home.",
        "description": (
            "Repair of refrigerators and deep freezers: refrigerant leaks and "
            "recharges, thermostat and defrost faults, compressor and condenser "
            "work, and door seal replacement. Temperature is verified cold before "
            "the technician leaves."
        ),
        "price": Decimal("849.00"),
        "estimated_duration": 90,
        "what_included": (
            "Coolant, compressor and thermostat diagnostics\n"
            "Leak test and refrigerant recharge where required\n"
            "Door gaskets replaced and vacuum-sealed\n"
            "Verified cold for two hours before departure"
        ),
        "is_featured": False,
        "display_order": 2,
    },
    {
        "category": "cleaning",
        "name": "Full Home Deep Clean",
        "slug": "full-home-deep-clean",
        "short_description": "Room-by-room deep clean, sanitised and inspected before sign-off.",
        "description": (
            "A whole-home deep clean covering kitchen, bathrooms, bedrooms and "
            "living spaces: degreasing, descaling, interior glass, skirting and "
            "grout. Completed by a team, then signed off against a checklist with "
            "you present."
        ),
        "price": Decimal("3999.00"),
        "estimated_duration": 300,
        "what_included": (
            "Kitchen degreasing and interior appliance clean\n"
            "Bathroom descaling, grout and sanitisation\n"
            "Interior glass, skirting and door frames\n"
            "Written checklist sign-off with the customer"
        ),
        "is_featured": True,
        "display_order": 1,
    },
    {
        "category": "cleaning",
        "name": "AC Deep Service & Sanitisation",
        "slug": "ac-deep-service-sanitisation",
        "short_description": "Coil, filter and drain serviced with an anti-microbial spray.",
        "description": (
            "A return-air deep service for split and window units: indoor coil and "
            "filter cleaned, condensate drain flushed and treated, and the "
            "housing sanitised. Restores airflow lost to dust and kills the smell "
            "that comes with it."
        ),
        "price": Decimal("899.00"),
        "estimated_duration": 60,
        "what_included": (
            "Indoor coil chemical clean and filter wash\n"
            "Condensate drain flushed and anti-microbial treated\n"
            "Housing and vents sanitised\n"
            "Airflow and drainage re-tested afterwards"
        ),
        "is_featured": False,
        "display_order": 2,
    },
]

# Coordinates are real urban centres so the discovery map has something honest
# to show on a fresh install rather than pins clustered in the ocean. The
# address/pincode pairs are illustrative seed data, not surveyed site addresses.
STATIONS = [
    {
        "name": "Koramangala Hub",
        "slug": "koramangala-hub",
        "description": "Level-2 and DC fast charging in an open forecourt, with a café and restrooms.",
        "address": "80 Feet Road, 4th Block",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560034",
        "latitude": Decimal("12.935200"),
        "longitude": Decimal("77.624500"),
        "charger_type": EVChargingStation.ChargerType.CCS2,
        "charging_speed_kw": 60,
        "price_per_kwh": Decimal("18.00"),
        "total_ports": 8,
        "available_ports": 6,
        "opens_at": time(0, 0),
        "closes_at": time(23, 59),
        "is_24_hours": True,
    },
    {
        "name": "Whitefield Rapid Point",
        "slug": "whitefield-rapid-point",
        "description": "Two 120 kW DC units on a main arterial, positioned for a quick top-up en route.",
        "address": "ITPL Main Road, near Phoenix Mall of Asia",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560066",
        "latitude": Decimal("12.989800"),
        "longitude": Decimal("77.735100"),
        "charger_type": EVChargingStation.ChargerType.CCS2,
        "charging_speed_kw": 120,
        "price_per_kwh": Decimal("22.00"),
        "total_ports": 4,
        "available_ports": 2,
        "opens_at": time(0, 0),
        "closes_at": time(23, 59),
        "is_24_hours": True,
    },
    {
        "name": "Bandra West Charge Point",
        "slug": "bandra-west-charge-point",
        "description": "AC charging bays in a basement car park, with a concierge desk and vehicle valeting.",
        "address": "Pali Hill, near Pali Naka",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400050",
        "latitude": Decimal("19.059600"),
        "longitude": Decimal("72.829500"),
        "charger_type": EVChargingStation.ChargerType.TYPE_2,
        "charging_speed_kw": 22,
        "price_per_kwh": Decimal("15.00"),
        "total_ports": 6,
        "available_ports": 4,
        "opens_at": time(8, 0),
        "closes_at": time(22, 0),
        "is_24_hours": False,
    },
    {
        "name": "Powai Express Charge",
        "slug": "powai-express-charge",
        "description": "Fast charging beside a highway-side food court, open around the clock.",
        "address": "Central Avenue, Hiranandani Gardens",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400076",
        "latitude": Decimal("19.119700"),
        "longitude": Decimal("72.846400"),
        "charger_type": EVChargingStation.ChargerType.CCS2,
        "charging_speed_kw": 60,
        "price_per_kwh": Decimal("20.00"),
        "total_ports": 6,
        "available_ports": 5,
        "opens_at": time(0, 0),
        "closes_at": time(23, 59),
        "is_24_hours": True,
    },
    {
        "name": "Hinjewadi Station",
        "slug": "hinjewadi-station",
        "description": "Workplace-district charging with CCS2 and CHAdeMO, sheltered from the monsoon.",
        "address": "Rajiv Gandhi Infotech Park, Phase 1",
        "city": "Pune",
        "state": "Maharashtra",
        "pincode": "411057",
        "latitude": Decimal("18.591300"),
        "longitude": Decimal("73.738900"),
        "charger_type": EVChargingStation.ChargerType.CHADEMO,
        "charging_speed_kw": 50,
        "price_per_kwh": Decimal("17.00"),
        "total_ports": 10,
        "available_ports": 7,
        "opens_at": time(6, 0),
        "closes_at": time(23, 0),
        "is_24_hours": False,
    },
    {
        "name": "Kondapur EV Hub",
        "slug": "kondapur-ev-hub",
        "description": "Highway-adjacent fast charging with 150 kW units and a lounge for longer stops.",
        "address": "Botanical Garden Road, Kondapur",
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500084",
        "latitude": Decimal("17.443500"),
        "longitude": Decimal("78.377200"),
        "charger_type": EVChargingStation.ChargerType.CCS2,
        "charging_speed_kw": 150,
        "price_per_kwh": Decimal("24.00"),
        "total_ports": 8,
        "available_ports": 0,
        "opens_at": time(0, 0),
        "closes_at": time(23, 59),
        "is_24_hours": True,
    },
]

# Demo accounts for the three roles the dashboards are built around. Render
# sets these from the environment; the fallback keeps a fresh local database
# usable. See the note on the password below before exposing any of this
# publicly.
DEMO_PASSWORD_ENV = "SEED_DEMO_PASSWORD"
DEMO_PASSWORD_FALLBACK = "ServiGo@2024"

USERS = [
    {
        "email": "customer@servigo.com",
        "username": "customer",
        "role": User.Role.CUSTOMER,
        "first_name": "Demo",
        "last_name": "Customer",
        "phone": "9800000001",
    },
    {
        "email": "staff@servigo.com",
        "username": "staff",
        "role": User.Role.STAFF,
        "first_name": "Demo",
        "last_name": "Technician",
        "phone": "9800000002",
    },
    {
        "email": "admin@servigo.com",
        "username": "admin",
        "role": User.Role.ADMIN,
        "first_name": "Demo",
        "last_name": "Admin",
        "phone": "9800000003",
    },
]


class Command(BaseCommand):
    help = "Seed production reference data (categories, services, EV stations, demo accounts). Safe to re-run."

    def add_arguments(self, parser):
        parser.add_argument(
            "--skip-users",
            action="store_true",
            help="Seed the catalogue only; do not create the demo accounts.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("Seeding ServiGo production data"))
        self.stdout.write("")

        created = 0
        existing = 0

        def report(label, name, was_created):
            nonlocal created, existing
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  + created  {label}: {name}"))
            else:
                existing += 1
                self.stdout.write(f"  = existing {label}: {name}")

        for row in self._seed_categories():
            report("category", row["name"], row["_created"])
        for row in self._seed_services():
            report("service", row["name"], row["_created"])
        for row in self._seed_stations():
            report("EV station", row["name"], row["_created"])
        for row in self._seed_users(skip_users=options["skip_users"]):
            report("user", row["email"], row["_created"])

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete - {created} created, {existing} already present."
            )
        )
        if created == 0:
            self.stdout.write("Database was already seeded; nothing to do.")

    # ── Seeders ───────────────────────────────────────────────────────────────

    def _seed_categories(self):
        """Keyed on `slug`, which is unique — the one field a slug cannot drift from."""
        seeded = []
        for data in CATEGORIES:
            obj, was_created = ServiceCategory.objects.get_or_create(
                slug=data["slug"],
                defaults={
                    "name": data["name"],
                    "description": data["description"],
                    "icon": data["icon"],
                    "display_order": data["display_order"],
                },
            )
            seeded.append({**data, "obj": obj, "_created": was_created})
        return seeded

    def _seed_services(self):
        """
        Keyed on the natural pair `(category, slug)`, which the model enforces
        with `unique_together`. The category comes from the categories seeded
        moments ago, so a build against an empty database resolves the FK
        without a second lookup at seed time.
        """
        by_slug = {c["slug"]: c["obj"] for c in self._seed_categories()}
        seeded = []
        for data in SERVICES:
            category = by_slug[data["category"]]
            defaults = {k: v for k, v in data.items() if k != "category"}
            obj, was_created = Service.objects.get_or_create(
                category=category,
                slug=data["slug"],
                defaults=defaults,
            )
            seeded.append({**data, "obj": obj, "_created": was_created})
        return seeded

    def _seed_stations(self):
        """Keyed on `slug`, which the station model declares unique."""
        seeded = []
        for data in STATIONS:
            defaults = {k: v for k, v in data.items() if k != "slug"}
            obj, was_created = EVChargingStation.objects.get_or_create(
                slug=data["slug"],
                defaults=defaults,
            )
            seeded.append({**data, "obj": obj, "_created": was_created})
        return seeded

    def _seed_users(self, skip_users=False):
        """
        Keyed on `email`, the model's `USERNAME_FIELD` and unique column.

        Only the password is set on creation. Re-running must not reset a demo
        password an operator has since changed, and must not touch a role that
        has been promoted or demoted by hand.
        """
        if skip_users:
            self.stdout.write(self.style.WARNING("  ! skipped   demo user accounts (--skip-users)"))
            return []

        password = os.environ.get(DEMO_PASSWORD_ENV) or DEMO_PASSWORD_FALLBACK
        if password == DEMO_PASSWORD_FALLBACK:
            self.stdout.write(
                self.style.WARNING(
                    f"  ! {DEMO_PASSWORD_ENV} is unset - demo accounts get the "
                    f"built-in default password."
                )
            )

        seeded = []
        for data in USERS:
            obj, was_created = User.objects.get_or_create(
                email=data["email"],
                defaults={
                    "username": data["username"],
                    "role": data["role"],
                    "first_name": data["first_name"],
                    "last_name": data["last_name"],
                    "phone": data["phone"],
                    "is_active": True,
                },
            )
            if was_created:
                obj.set_password(password)
                # Django's own admin gate; ServiGo's staff dashboards gate on
                # the custom `role` field, so this stays False for technicians.
                obj.is_staff = data["role"] == User.Role.ADMIN
                obj.is_superuser = data["role"] == User.Role.ADMIN
                obj.save(update_fields=["password", "is_staff", "is_superuser"])
            seeded.append({**data, "obj": obj, "_created": was_created})
        return seeded
