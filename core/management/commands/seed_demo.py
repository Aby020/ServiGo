"""
Seed demo data for ServiGo.

Creates:
  - Admin, staff and customer users (with profiles)
  - Service categories (Electrical, Plumbing, Smart TV)
  - Services with pricing, duration and "what's included"
  - EV charging stations
  - A few sample bookings in various states
  - Site settings (singleton)

Usage:
    python manage.py seed_demo
    python manage.py seed_demo --reset      # wipe existing data first
"""
from datetime import time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import CustomerProfile, StaffProfile, User
from bookings.models import Booking, BookingStatusHistory
from core.models import SiteSettings
from ev_charging.models import EVChargingBooking, EVChargingStation
from services.models import Service, ServiceCategory


class Command(BaseCommand):
    help = "Seed ServiGo with realistic demo data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo data before seeding.",
        )

    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write(self.style.WARNING("Resetting existing data..."))
            EVChargingBooking.objects.all().delete()
            BookingStatusHistory.objects.all().delete()
            Booking.objects.all().delete()
            EVChargingStation.objects.all().delete()
            Service.objects.all().delete()
            ServiceCategory.objects.all().delete()
            User.objects.all().delete()

        self.stdout.write("Seeding ServiGo demo data...")
        self._seed_site_settings()
        users = self._seed_users()
        categories = self._seed_categories()
        services = self._seed_services(categories)
        stations = self._seed_stations()
        self._seed_bookings(users, services)
        self._seed_ev_bookings(users, stations)

        self.stdout.write(self.style.SUCCESS("Done! Demo accounts:"))
        self.stdout.write("  Admin:    admin@servigo.com   / admin12345")
        self.stdout.write("  Staff:    staff@servigo.com   / staff12345")
        self.stdout.write("  Customer: customer@servigo.com / customer12345")

    # --------------------------------------------------------------

    def _seed_site_settings(self):
        settings, _ = SiteSettings.objects.get_or_create(
            pk=1,
            defaults={
                "site_name": "ServiGo",
                "site_tagline": "Your trusted home services partner",
                "contact_email": "support@servigo.com",
                "contact_phone": "+91 98765 43210",
                "address": "ServiGo HQ, Tech Park, Bengaluru, Karnataka 560001",
                "facebook_url": "https://facebook.com/servigo",
                "twitter_url": "https://twitter.com/servigo",
                "instagram_url": "https://instagram.com/servigo",
                "linkedin_url": "https://linkedin.com/company/servigo",
                "youtube_url": "https://youtube.com/@servigo",
            },
        )
        self.stdout.write("  [OK] Site settings")
        return settings

    def _seed_users(self):
        users = {}

        # Admin
        admin, created = User.objects.get_or_create(
            email="admin@servigo.com",
            defaults={"username": "admin", "role": User.Role.ADMIN},
        )
        if created:
            admin.first_name = "Abi"
            admin.last_name = "Thomas"
            admin.phone = "+91 90000 00001"
            admin.is_staff = True
            admin.is_superuser = True
            admin.is_verified = True
            admin.set_password("admin12345")
            admin.save()
            self.stdout.write("  [OK] Admin user")

        # Staff users
        staff_specs = [
            ("staff@servigo.com", "Rahul", "Verma", "Electrical", 8, Decimal("450.00"), 30),
            ("staff2@servigo.com", "Suresh", "Menon", "Plumbing", 12, Decimal("400.00"), 25),
            ("staff3@servigo.com", "Kiran", "Reddy", "Smart TV & Home Setup", 6, Decimal("500.00"), 20),
        ]
        for i, (email, first, last, spec, exp, rate, radius) in enumerate(staff_specs, start=1):
            user, created = User.objects.get_or_create(
                email=email,
                defaults={"username": f"staff{i}", "role": User.Role.STAFF},
            )
            if created:
                user.first_name = first
                user.last_name = last
                user.phone = f"+91 90000 0000{i + 1}"
                user.city = ["Bengaluru", "Kochi", "Hyderabad"][i - 1]
                user.is_verified = True
                user.set_password("staff12345")
                user.save()
                StaffProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "employee_id": f"SG-{100 + i}",
                        "specialization": spec,
                        "experience_years": exp,
                        "hourly_rate": rate,
                        "working_radius_km": radius,
                        "is_available": True,
                        "rating": Decimal("4.80"),
                        "total_jobs": 120 + i * 37,
                        "bio": f"Experienced {spec.lower()} professional with {exp}+ years on the job.",
                        "certifications": f"IEC Certified\nPolice Verification Cleared\nFirst Aid Trained",
                    },
                )
                self.stdout.write(f"  [OK] Staff user: {email}")

        # Customer users
        customer_specs = [
            ("customer@servigo.com", "Priya", "Sharma", "Bengaluru"),
            ("customer2@servigo.com", "Anand", "Krishnan", "Kochi"),
            ("customer3@servigo.com", "Meera", "Nair", "Chennai"),
        ]
        for i, (email, first, last, city) in enumerate(customer_specs, start=1):
            user, created = User.objects.get_or_create(
                email=email,
                defaults={"username": f"customer{i}", "role": User.Role.CUSTOMER},
            )
            if created:
                user.first_name = first
                user.last_name = last
                user.phone = f"+91 80000 0000{i + 1}"
                user.city = city
                user.state = "India"
                user.pincode = "560001"
                user.address = f"House No. {i * 12}, Main Road, {city}"
                user.set_password("customer12345")
                user.save()
                CustomerProfile.objects.update_or_create(
                    user=user,
                    defaults={
                        "loyalty_points": 50 * i,
                        "total_bookings": 3 + i,
                        "total_spent": Decimal(1500 + i * 750),
                        "preferred_payment_method": "UPI",
                    },
                )
                self.stdout.write(f"  [OK] Customer user: {email}")

        users["admin"] = admin
        users["staff"] = list(User.objects.filter(role=User.Role.STAFF))
        users["customer"] = list(User.objects.filter(role=User.Role.CUSTOMER))
        return users

    def _seed_categories(self):
        categories = {}
        specs = [
            ("Electrical", "electrical", "bi-lightning-charge",
             "Wiring, fixtures, inverter and complete electrical solutions by certified electricians."),
            ("Plumbing", "plumbing", "bi-droplet",
             "Leaks, fittings, bathrooms and complete plumbing services you can rely on."),
            ("Smart TV", "smart-tv", "bi-tv",
             "Smart TV installation, wall mounting, and home entertainment setup."),
        ]
        for order, (name, slug, icon, desc) in enumerate(specs):
            cat, created = ServiceCategory.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "icon": icon,
                    "description": desc,
                    "is_active": True,
                    "display_order": order,
                },
            )
            categories[slug] = cat
        self.stdout.write(f"  [OK] {len(categories)} service categories")
        return categories

    def _seed_services(self, categories):
        services = []
        specs = [
            ("electrical", [
                ("Electrician Visit", "electrical-visit", "Diagnose and fix common electrical issues in a single visit.",
                 "Inspection of wiring, switches and sockets; minor repairs; safety check.", Decimal("349.00"), 60, True,
                 "Diagnosis of electrical issues\nMinor repairs & replacements\nSafety inspection\nCleanup after job"),
                ("Fan & Light Installation", "fan-light-installation",
                 "Install ceiling fans, tube lights, LED fixtures and chandeliers.",
                 "Professional installation of fans and lights with secure mounting and wiring.",
                 Decimal("499.00"), 90, True,
                 "Fan or light fitting\nWiring & connections\nSwitch board adjustments\nSafety testing"),
                ("Complete Home Wiring", "home-wiring",
                 "Full home rewiring, switch boards, MCB panels and earthing.",
                 "End-to-end home electrical wiring with MCB distribution, earthing and safety compliance.",
                 Decimal("12999.00"), 480, False,
                 "Full house rewiring\nMCB distribution box\nEarthing installation\nElectrical load testing"),
                ("Inverter & UPS Setup", "inverter-setup",
                 "Inverter installation, battery setup and power backup solutions.",
                 "Install and configure inverter, batteries and changeover to keep your home powered.",
                 Decimal("799.00"), 120, True,
                 "Inverter & battery installation\nWiring and changeover\nLoad testing\nUsage guidance"),
            ]),
            ("plumbing", [
                ("Plumber Visit", "plumber-visit", "Fix leaks, blockages and general plumbing issues.",
                 "Diagnose and repair leaking taps, pipes, flush tanks and blocked drains.",
                 Decimal("299.00"), 60, True,
                 "Leak detection & repair\nBlocked drain clearing\nTap & flush repair\nCleanup after job"),
                ("Water Heater Installation", "water-heater-install",
                 "Install geysers and instant water heaters with all fittings.",
                 "Safe installation of electric water heaters with proper piping and earth leakage protection.",
                 Decimal("599.00"), 120, True,
                 "Geyser installation\nMounting & piping\nElectrical connection\nTesting"),
                ("Bathroom Renovation", "bathroom-renovation",
                 "Full bathroom plumbing, fittings and tiling coordination.",
                 "Complete bathroom plumbing overhaul — fittings, taps, concealed pipes and drainage.",
                 Decimal("7999.00"), 480, False,
                 "Bathroom plumbing overhaul\nNew fittings & fixtures\nConcealed pipe routing\nDrainage system"),
            ]),
            ("smart-tv", [
                ("Smart TV Installation", "smart-tv-install",
                 "Mount, install and configure your new Smart TV.",
                 "Wall mounting, cable management, and full setup of your smart TV — on any surface.",
                 Decimal("449.00"), 60, True,
                 "TV wall mounting\nCable management\nTV configuration\nApp setup & demo"),
                ("TV Repair & Maintenance", "tv-repair",
                 "Diagnose and repair display, sound and connectivity issues.",
                 "Expert diagnosis and repair of common Smart TV faults — display, sound, ports and network.",
                 Decimal("549.00"), 90, True,
                 "Fault diagnosis\nDisplay & sound repair\nPort & connectivity fixes\nPost-repair testing"),
                ("Home Theatre Setup", "home-theatre",
                 "Connect soundbars, speakers and streaming devices for cinema sound.",
                 "Full home entertainment setup — soundbar, surround speakers, and streaming devices.",
                 Decimal("899.00"), 120, True,
                 "Soundbar & speaker setup\nStreaming device setup\nWireless configuration\nAudio tuning"),
            ]),
        ]
        for cat_slug, service_list in specs:
            for order, (name, slug, short, desc, price, duration, featured, included) in enumerate(service_list):
                service, created = Service.objects.get_or_create(
                    category=categories[cat_slug],
                    slug=slug,
                    defaults={
                        "name": name,
                        "short_description": short,
                        "description": desc,
                        "price": price,
                        "estimated_duration": duration,
                        "what_included": included,
                        "is_available": True,
                        "is_featured": featured,
                        "display_order": order,
                    },
                )
                services.append(service)
        self.stdout.write(f"  [OK] {len(services)} services")
        return services

    def _seed_stations(self):
        stations = []
        specs = [
            ("EcoCharge Central", "ecocharge-central", "42 MG Road", "Bengaluru", "Karnataka", "560001",
             EVChargingStation.ChargerType.CCS2, 150, Decimal("12.00"), 6, 4, time(0, 0), time(0, 0), True),
            ("VoltHub Junction", "volthub-junction", "Marine Drive", "Kochi", "Kerala", "682031",
             EVChargingStation.ChargerType.CHADEMO, 50, Decimal("10.00"), 4, 2, time(6, 0), time(22, 0), False),
            ("GreenGrid Mall", "greengrid-mall", "SP Road", "Hyderabad", "Telangana", "500003",
             EVChargingStation.ChargerType.TYPE_2, 22, Decimal("9.00"), 8, 6, time(0, 0), time(0, 0), True),
            ("PowerNode Express", "powernode-express", "NH-48 Service Road", "Bengaluru", "Karnataka", "560037",
             EVChargingStation.ChargerType.CCS2, 120, Decimal("13.00"), 5, 3, time(0, 0), time(0, 0), True),
        ]
        for (name, slug, address, city, state, pin, ctype, speed, price, total, avail, open_t, close_t, is24) in specs:
            station, created = EVChargingStation.objects.get_or_create(
                slug=slug,
                defaults={
                    "name": name,
                    "address": address,
                    "city": city,
                    "state": state,
                    "pincode": pin,
                    "charger_type": ctype,
                    "charging_speed_kw": speed,
                    "price_per_kwh": price,
                    "total_ports": total,
                    "available_ports": avail,
                    "opens_at": open_t,
                    "closes_at": close_t,
                    "is_24_hours": is24,
                    "status": EVChargingStation.Status.AVAILABLE,
                    "is_active": True,
                    "description": f"{name} offers fast, reliable charging in {city}. "
                                   "Book ahead to reserve your slot.",
                },
            )
            stations.append(station)
        self.stdout.write(f"  [OK] {len(stations)} EV charging stations")
        return stations

    def _seed_bookings(self, users, services):
        customer = users["customer"][0]
        staff = users["staff"]
        today = timezone.now().date()
        count = 0

        booking_data = [
            # (service, days_offset, date_time, status, assigned_staff_index)
            (services[0], 0, time(10, 0), Booking.Status.COMPLETED, 0),
            (services[4], -1, time(14, 0), Booking.Status.COMPLETED, 1),
            (services[7], 1, time(11, 0), Booking.Status.CONFIRMED, 2),
            (services[1], 2, time(16, 0), Booking.Status.PENDING, None),
            (services[5], 3, time(9, 30), Booking.Status.PENDING, None),
        ]
        for service, day_offset, pref_time, status, staff_idx in booking_data:
            booking, created = Booking.objects.get_or_create(
                customer=customer,
                service_name=service.name,
                preferred_date=today + timedelta(days=day_offset),
                defaults={
                    "customer_name": customer.get_full_name(),
                    "customer_email": customer.email,
                    "customer_phone": customer.phone,
                    "service_price": service.price,
                    "location": "Bengaluru",
                    "address": "House No. 12, Main Road, Bengaluru 560001",
                    "preferred_time": pref_time,
                    "status": status,
                    "assigned_staff": staff[staff_idx] if staff_idx is not None else None,
                },
            )
            if created:
                BookingStatusHistory.objects.create(
                    booking=booking,
                    previous_status="",
                    new_status=status,
                    changed_by=staff[staff_idx] if staff_idx is not None else customer,
                    notes="Seeded demo booking.",
                )
                count += 1
        self.stdout.write(f"  [OK] {count} service bookings")

    def _seed_ev_bookings(self, users, stations):
        customer = users["customer"][0]
        station = stations[0]
        today = timezone.now().date()
        count = 0

        ev_data = [
            (today + timedelta(days=1), time(10, 0), time(11, 30), Decimal("22.5"), EVChargingBooking.Status.CONFIRMED),
            (today + timedelta(days=3), time(15, 0), time(16, 0), Decimal("12.0"), EVChargingBooking.Status.PENDING),
            (today - timedelta(days=2), time(9, 0), time(10, 30), Decimal("20.0"), EVChargingBooking.Status.COMPLETED),
        ]
        for date, start, end, kwh, status in ev_data:
            booking, created = EVChargingBooking.objects.get_or_create(
                customer=customer,
                station=station,
                booking_date=date,
                start_time=start,
                defaults={
                    "customer_name": customer.get_full_name(),
                    "customer_email": customer.email,
                    "customer_phone": customer.phone,
                    "end_time": end,
                    "estimated_kwh": kwh,
                    "estimated_cost": kwh * station.price_per_kwh,
                    "status": status,
                },
            )
            if created:
                count += 1
        self.stdout.write(f"  [OK] {count} EV charging bookings")
