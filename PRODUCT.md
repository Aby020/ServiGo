# ServiGo

Your trusted home-services and EV-charging booking platform.

---

## 1. Project Overview

ServiGo is a **Django 5.2** web application that connects users with verified
home-service professionals and EV charging stations in one place.

**Problem it solves:** Finding a reliable electrician, plumber, or Smart TV
expert — and knowing exactly what you'll pay and when they'll arrive — is
hard. ServiGo lets a user pick a published service (fixed price, fixed
duration, "what's included"), book a date/time, and get a confirmation, all
without phone calls. It also solves the "where do I charge my EV?" problem by
listing charging stations with live availability and letting users reserve a
slot.

**Scope:** Customer-facing booking (home services + EV charging), staff
(service-provider) job management, and an admin dashboard / Django admin.

The demo data is India-focused (₹ pricing, +91 phone numbers, cities like
Bengaluru, Kochi, Hyderabad), but the app itself is locale-agnostic.

> **Version history:** ServiGo is the **Version 2 evolution** of the original
> NanoServ project. All current branding, documentation, and functionality is
> ServiGo.

---

## 2. Main Features

Every feature below is implemented and verified in the running application.

### Accounts & Authentication
- **User registration** — sign up with email, username, role (customer or
  staff), phone, and password. Admin cannot be selected at public signup
  (security fix — admin accounts are created via seed/admin only).
- **Login / Logout** — log in with **email or username** + password; role-based
  redirects; logout clears the session.
- **User profile** — view and edit your details (name, email, phone, address,
  city, state, pincode, profile image).
- **Staff profile** — specialization, experience, hourly rate, bio,
  certifications, working radius.
- **Customer profile** — date of birth, preferred payment method.
- **Password change** — old/new password flow with Django's password
  validators.

### Services & Booking
- **Service browsing** — browse all services with search, category filter, and
  featured-only filter.
- **Service categories** — Electrical, Plumbing, Smart TV.
- **Service detail** — description, price, estimated duration, "what's
  included", and a **Book** button.
- **Booking** — pick date/time, location, and address; optional notes.
- **Booking confirmation** — confirmation page + confirmation email (console
  backend in development).
- **Booking history** — view your past/upcoming bookings and details.
- **Booking cancel** — cancel a booking from the detail page.
- **Booking status tracking** — status changes are recorded in a history log.

### Staff Functionality
- Staff dashboard with job statistics.
- Manage bookings — list all bookings, view detail, update status, assign a
  staff member.
- Manage EV charging bookings similarly.

### EV Charging
- **Station listing** — search by location (city/area/address/pincode), filter
  by charger type and max price, "available only" toggle.
- **Station detail** — address, charger type, speed, price/kWh, ports,
  operating hours, "open now" indicator, Google Maps link.
- **EV slot booking** — date, start/end time, estimated kWh → estimated cost →
  confirmation → history → cancel.

### Site
- **Homepage** — hero, search, featured services, categories, EV station
  counts, contact strip.
- **About page**, **Contact page** (contact form → stored message + notification
  email to admin + auto-reply to visitor).
- **Email notifications** — booking confirmation, EV booking confirmation,
  contact notifications. All use the configured `EMAIL_BACKEND` (console by
  default in development).

> **Not implemented (do not document as available):** payments, ratings &
  reviews, real-time chat, a mobile app, or a public REST API.

---

## 3. User Roles

There are three roles, stored on the custom `User` model (`role` field):

### Customer / User
- Register and log in (email or username).
- Browse and search services and EV stations.
- Book home services and EV charging slots.
- View booking confirmation, history, and details; cancel bookings.
- Update their own profile (user + customer profile) and password.
- Customer dashboard shows upcoming/recent bookings, EV bookings, and stats
  (totals, completed, cancelled, total spent).
- Cannot access staff or admin dashboards (redirected to their own dashboard).

### Staff
- Everything a logged-in user can do.
- Staff dashboard with job statistics.
- Manage **all** service bookings: view the staff booking list, open a booking,
  update its status (pending → confirmed → in-progress → completed / cancelled),
  and assign it to a staff member.
- Manage **all** EV charging bookings (list, detail, status update).
- Edit their own staff profile (specialization, hourly rate, etc.).
- Cannot access the admin dashboard.

### Admin
- Full access to the **Django admin** (`/admin/`) for users, categories,
  services, bookings, EV stations, contact messages, site settings.
- Admin dashboard with platform-wide statistics.
- Can log in and also acts with staff privileges.
- Admin accounts are created via the seed command or the Django admin — never
  through public registration.

---

## 4. Service Categories

Three categories exist (seeded by `python manage.py seed_demo`). Each service
shows: name, short description, price (₹), estimated duration (minutes),
"what's included", and a Book action. Category images live in
`static/images/` and are resolved by the `category_image` template filter
(default `<slug>.jpg`, with an override for Smart TV).

### Electrical (`electrical` — `images/electrical.jpg`)
Services: Electrician Visit (₹349), Fan & Light Installation (₹499),
Complete Home Wiring (₹12,999), Inverter & UPS Setup (₹799).
Booking: standard service booking flow (date/time/location/address).

### Plumbing (`plumbing` — `images/plumbing.jpg`)
Services: Plumber Visit (₹299), Water Heater Installation (₹599),
Bathroom Renovation (₹7,999).
Booking: standard service booking flow.

### Smart TV (`smart-tv` — `images/Smart_tv_repair.jpg`)
Services: Smart TV Installation (₹449), TV Repair & Maintenance (₹549),
Home Theatre Setup (₹899).
Booking: standard service booking flow.

The category page shows a category hero image plus a card per service; each
card and the hero use the category image. The Smart TV category uses the new
**Smart_tv_repair.jpg** image (see §5).

---

## 5. Smart TV Service

**What it does:** ServiGo offers Smart TV installation, wall mounting, TV
repair/maintenance, and home-theatre setup as a dedicated service category.

**Services (seeded):**
- **Smart TV Installation** — mount, install, and configure a new Smart TV
  (wall mounting, cable management, TV configuration, app setup & demo). ₹449.
- **TV Repair & Maintenance** — diagnose and repair display, sound, port, and
  connectivity issues. ₹549.
- **Home Theatre Setup** — soundbar/speaker/streaming-device setup. ₹899.

**How users access it:**
- Homepage "featured services" card, and the category filter/search on the
  services page.
- "Smart TV" in the navbar dropdown and the footer links → the Smart TV
  category page (`/services/category/smart-tv/`).

**How booking works:** Pick a Smart TV service → service detail → **Book** →
choose preferred date/time, location, and address → confirmation page + email →
the booking appears in your booking history.

**The new Smart TV image:** `images/Smart_tv_repair.jpg` (a 2209×3928 JPEG)
is the dedicated Smart TV image. It was added to the project's `images/`
folder and copied into Django's static directory (`static/images/`), then
wired to the Smart TV category through the `category_image` template filter.
The Smart TV hero, category cards, service detail pages, and booking summary
all display it. Plumbing, Electrical, and EV images are untouched.

---

## 6. EV Charging

### Stations
Four demo stations are seeded:
| Station | City | Charger | ₹/kWh | Ports |
| --- | --- | --- | --- | --- |
| EcoCharge Central | Bengaluru | CCS2 | 12.00 | 6 |
| VoltHub Junction | Kochi | CHAdeMO | 10.00 | 4 |
| GreenGrid Mall | Hyderabad | Type 2 | 9.00 | 8 |
| PowerNode Express | Bengaluru | CCS2 | 13.00 | 5 |

### Location search
The station list (`/ev/`) supports free-text search across name, address,
city, state, and pincode, plus filters for charger type and max ₹/kWh, and an
"available only" toggle.

### Station information
Each station detail page shows the address, charger type, charging speed (kW),
price per kWh, total/available ports, operating hours, an **open-now**
indicator (handles overnight hours), and a Google Maps link.

### EV booking
A logged-in user books a slot: date, start time, end time, and estimated kWh →
the estimated cost is computed → confirmation page + email → the booking
appears in their history and can be cancelled. Statuses: pending, confirmed,
**charging active**, completed, cancelled.

### User flow
Find a station (search/filter) → open its detail → **Book a slot** → fill
date/time/kWh → confirm → manage from the customer dashboard / booking list.

---

## 7. Booking System

**Service booking flow (as implemented):**
1. **Service selection** — browse or search services; open a service detail.
2. **Date / time** — choose a preferred date (cannot be in the past) and time.
3. **Customer details** — taken from the logged-in user's account
   automatically (name, email, phone).
4. **Location** — location (e.g. city/area) and full address; optional notes.
5. **Confirmation** — a confirmation page shows the booking summary, and a
   confirmation email is sent (console backend in development).
6. **Booking history / status** — the booking appears in the customer's
   booking list/dashboard with a live status badge; staff can update it.

**Statuses used by the application (service bookings):**
`pending` → `confirmed` → `in_progress` → `completed`  (or `cancelled` at any
point). Every change is recorded in `BookingStatusHistory`.

**Staff role:** staff can open any booking from the staff list, update its
status, assign it to a staff member, and add notes.

**Cancellation:** customers can cancel their own bookings.

---

## 8. Authentication

- **Registration** — email (unique), username, role (customer/staff — admin is
  blocked from public signup), phone, password + confirmation. Creates the
  matching Customer/Staff profile. Duplicate email/username, weak password,
  mismatched passwords, and missing fields all fail gracefully with messages.
- **Login** — the login form accepts **email or username** + password. The
  custom `EmailOrUsernameBackend` resolves either identifier (case-insensitive)
  and includes a timing-uniform check to mitigate username enumeration.
  Authenticated users are redirected by role: customer → customer dashboard,
  staff → staff dashboard, admin → Django admin.
- **Logout** — `@login_required` logout clears the session and redirects home.
- **Password handling** — passwords are stored with Django's PBKDF2 hashing;
  Django's default password validators are enabled; a password-change flow is
  provided. Passwords are never stored or displayed in plain text.
- **Sessions** — Django session framework; the session cookie expires when the
  browser closes and after 30 minutes of inactivity; sessions are refreshed on
  every request.
- **User roles** — customer / staff / admin (see §3), with role-based redirects
  and role-gated dashboards.
- **Protected pages** — dashboards (customer/staff/admin), profile editing,
  service booking, EV booking, and logout all require login; unauthenticated
  visitors are redirected to the login page. The `next` parameter is validated
  with `url_has_allowed_host_and_scheme` (open-redirect protection). CSRF
  protection is enabled on all forms.

---

## 9. Technology Stack

**Actually used by this project:**

- **Python 3.12** (the only interpreter with the correct dependency set; the
  project **must** run through its `venv/` — see Known Issues).
- **Django 5.2** (`Django==5.2.*`) — web framework, ORM, admin, auth,
  sessions, templates.
- **django-environ 0.11** — `.env` configuration.
- **django-crispy-forms 2.3 + crispy-bootstrap5 2024.10** — form rendering.
- **django-browser-reload 1.17** — dev-server live reload.
- **Pillow 11** — image field support.
- **SQLite** — default database (`db.sqlite3`); PostgreSQL is supported via
  `DATABASE_URL` (documented in `.env.example`) but not currently in use.
- **HTML / CSS / JavaScript** — Django templates with **Bootstrap 5** and
  **Bootstrap Icons** (loaded locally under `static/`). No front-end build
  step, no Node dependency.

**Not used:** DRF/REST API, React/Vue, Postgres in production, Celery, Redis,
Docker.

---

## 10. Project Structure

```
ServiGo/
├── manage.py                 # Django management entry point
├── requirements.txt          # Python dependencies (pinned ranges)
├── .env.example              # Environment variable template (copy to .env)
├── .env                      # Local secrets — NEVER commit
├── config/                   # Project settings: settings.py, urls.py, asgi.py, wsgi.py
├── accounts/                 # Custom User, roles, registration/login/profile
│   ├── models.py             # User, StaffProfile, CustomerProfile
│   ├── backends.py           # EmailOrUsernameBackend
│   ├── forms.py / views.py / urls.py / admin.py
├── services/                 # Service categories & services catalog
│   ├── models.py             # ServiceCategory, Service
│   ├── templatetags/service_images.py   # category_image filter (Smart TV image mapping)
│   └── views.py / urls.py / admin.py
├── bookings/                 # Service booking flow
│   ├── models.py             # Booking, BookingStatusHistory
│   └── forms.py / views.py / urls.py
├── ev_charging/              # EV stations & slot booking
│   ├── models.py             # EVChargingStation, EVChargingBooking
│   └── forms.py / views.py / urls.py
├── dashboard/                # Customer / staff / admin dashboards (views + urls)
├── core/                     # Home/About/Contact, SiteSettings, error handlers
│   ├── models.py             # ContactMessage, SiteSettings
│   ├── context_processors.py # site_settings exposed to every template
│   └── management/commands/seed_demo.py   # demo data seeder
├── templates/                # All HTML templates (accounts/, services/, bookings/,
│                             #   ev_charging/, dashboard/, core/, home/, partials/)
├── static/                   # Static files (images/, css/, js/) served by Django
│   └── images/               # Category/service images incl. Smart_tv_repair.jpg
├── media/                    # User-uploaded files (profiles, categories) — gitignored
├── images/                   # Source image drop folder (e.g. Smart_tv_repair.jpg)
├── tests/                    # Test suite (tests/accounts/...)
├── scripts/
│   ├── verify_auth.py        # End-to-end HTTP auth + Smart TV verification harness
│   └── run_dev.ps1           # Dev-server launcher (uses the venv)
└── db.sqlite3                # SQLite database (gitignored)
```

---

## 11. Database

All models are defined with Django's ORM; tables are created by migrations.

- **User** (`accounts_user`) — custom user model: email (unique, used as the
  login identifier), username, **role** (customer/staff/admin), phone, address,
  city/state/pincode, profile image, verified flag. Has a `StaffProfile` or
  `CustomerProfile` (one-to-one).
- **StaffProfile** — employee ID, specialization, experience years, hourly
  rate, availability, rating, total jobs, bio, certifications, working radius.
- **CustomerProfile** — date of birth, preferred payment method, loyalty
  points, total bookings, total spent.
- **ServiceCategory** — name, slug, description, Bootstrap icon, image, active,
  display order. One-to-many → **Service**.
- **Service** — category (FK), name, slug, short description, description,
  price, estimated duration, "what's included", availability, featured flag.
- **Booking** — customer (FK → User), customer contact snapshot, service name
  & price snapshot, location, address, preferred date/time, **status**, notes,
  assigned staff (nullable), timestamps. Status history in
  **BookingStatusHistory** (previous/new status, changed by, notes).
- **EVChargingStation** — name, slug, address/city/state/pincode, lat/long,
  Google Maps URL, charger type, speed, price/kWh, total/available ports,
  operating hours, status (available/in-use/maintenance/offline).
- **EVChargingBooking** — customer (FK), station (FK), date, start/end time,
  estimated kWh, estimated cost, status (pending/confirmed/active/completed/
  cancelled).
- **ContactMessage** — name, email, phone, subject, message, read/replied flags.
- **SiteSettings** — a singleton row with site name, tagline, contact details,
  and social links (rendered globally via a context processor).

Key relationships: `User 1—1 StaffProfile`, `User 1—1 CustomerProfile`,
`ServiceCategory 1—N Service`, `User 1—N Booking` (+ assigned staff),
`Booking 1—N BookingStatusHistory`, `User 1—N EVChargingBooking`,
`EVChargingStation 1—N EVChargingBooking`.

---

## 12. Setup Instructions

From a fresh clone:

1. **Clone the project**
   ```powershell
   git clone <servigo-repository-url> ServiGo
   cd ServiGo
   ```
   *(If you already have the folder, skip this step.)*

2. **Create a virtual environment**
   ```powershell
   python -m venv venv
   ```
   > Use a Python 3.12 interpreter. The venv is **required** — global
   > interpreters may have the wrong Django major version (see Known Issues).

3. **Activate the virtual environment**
   ```powershell
   venv\Scripts\activate
   ```
   (You should see `(venv)` at the prompt. Alternative that works without
   activation: `venv\Scripts\python ...` for every command below.)

4. **Install requirements**
   ```powershell
   pip install -r requirements.txt
   ```
   If the venv was ever emptied, re-run this — it restores Django 5.2 + deps.

5. **Configure `.env`**
   ```powershell
   copy .env.example .env
   ```
   Edit `.env` and set a real `SECRET_KEY`:
   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(50))"
   ```
   Paste the output as `SECRET_KEY`. Keep `DEBUG=True` and the default
   `ALLOWED_HOSTS` for local development.

6. **Run migrations**
   ```powershell
   python manage.py migrate
   ```

7. **Create an admin** (optional — the seed command below also creates one)
   ```powershell
   python manage.py createsuperuser
   ```

8. **Load demo data** (recommended — creates users, services, stations,
   bookings, site settings)
   ```powershell
   python manage.py seed_demo
   ```
   To wipe and re-seed: `python manage.py seed_demo --reset`.

9. **Run the development server**
   ```powershell
   python manage.py runserver 127.0.0.1:8004
   ```
   Open <http://127.0.0.1:8004> (or the `run_dev.ps1` shortcut — §15).

---

## 13. Environment Variables

All values below are placeholders — **never commit real secrets**. Copy
`.env.example` to `.env` and fill them in.

```
# --- Core ---
SECRET_KEY=your-secret-key            # python -c "import secrets; print(secrets.token_urlsafe(50))"
DEBUG=True                            # True in development only
ALLOWED_HOSTS=localhost,127.0.0.1,testserver

# --- Email (console backend by default in development) ---
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_USE_TLS=True
EMAIL_PORT=587
EMAIL_HOST_USER=your-email@example.com
EMAIL_HOST_PASSWORD=your-password      # app password / SMTP credentials — never commit
SERVER_EMAIL=your-email@example.com
DEFAULT_FROM_EMAIL=your-email@example.com

# --- Database (optional) ---
# DATABASE_URL=postgres://user:password@localhost:5432/servigo
```

`SECRET_KEY`, `DEBUG`, and `ALLOWED_HOSTS` are required; the email variables
default to safe development values (console backend) if omitted.

---

## 14. Demo / Test Credentials

Created by `python manage.py seed_demo` and **verified by logging in**:

### Admin
- **Username:** admin@servigo.com
- **Password:** admin12345

### Staff
- **Username:** staff@servigo.com
- **Password:** staff12345
- (Additional seeded staff: `staff2@servigo.com` and `staff3@servigo.com`,
  same password `staff12345`.)

### Customer
- **Username:** customer@servigo.com
- **Password:** customer12345
### Customer
- **Username:** All
- **Password:** All@1234
- (Additional seeded customers: `customer2@servigo.com` and
  `customer3@servigo.com`, same password `customer12345`.)

> These are the only demo credentials verified to exist. No API keys, `.env`
> secrets, or real personal passwords are listed here. If you re-created the
> database without seeding, these accounts will not exist — run
> `python manage.py seed_demo`.

---

## 15. Running the Project

### Development server (recommended)
```powershell
# From the ServiGo folder with the venv active:
python manage.py runserver 127.0.0.1:8004

# Or without activation, via the launcher script (uses the venv):
.\scripts\run_dev.ps1            # starts on 127.0.0.1:8004
.\scripts\run_dev.ps1 8015       # custom port
```

### Database commands
```powershell
python manage.py migrate                 # apply migrations
python manage.py makemigrations <app>    # create migrations after model changes
python manage.py seed_demo               # load demo data
python manage.py seed_demo --reset       # wipe & re-seed
```

### Testing
```powershell
python manage.py test                    # run the test suite (67 tests)
```

### Static / media
- In development (`DEBUG=True`) Django serves `static/` and `media/`
  automatically — no command needed.
- For production: `python manage.py collectstatic` (writes to `staticfiles/`).

---

## 16. Testing

```powershell
python manage.py test
```
Runs the project's test suite (currently **67 tests**) covering accounts:
backends (email/username login), forms (registration validation), models, and
views (registration, login, logout, profile, staff/customer profile updates,
password change).

An end-to-end HTTP verification harness is also available:
```powershell
venv\Scripts\python scripts\verify_auth.py http://127.0.0.1:8004
```
It drives a real browser-like client (cookies + CSRF) through registration,
login/logout, all roles, invalid credentials, access control, and the Smart TV
image wiring, printing PASS/FAIL per check.

---

## 17. Known Issues

- **Broken venv (environment):** the project's `venv/` can regress to a bare
  installation (only `pip`), which makes every page fail with
  `ModuleNotFoundError: No module named 'django'`. Fix: reinstall requirements
  (`venv\Scripts\pip install -r requirements.txt`). This was the root cause of
  "login/registration not working" and is resolved.
- **Global Python 3.13 incompatibility (environment):** global Python 3.13 has
  Django 6.0.7 (wrong major) plus missing `crispy_forms`/`Pillow` packages.
  Always use the venv (or global Python 3.12).
- **Staff profile validation gap:** `StaffProfile.hourly_rate` and
  `working_radius_km` rely on client-side `min` only — there is no
  `MinValueValidator`, so a negative value could be submitted server-side.
- **Email in development:** emails (booking confirmations, contact
  notifications) print to the console because the default backend is
  `console.EmailBackend`. Configure real SMTP in `.env` to send mail.
- **No production email sender configured** — `DEFAULT_FROM_EMAIL` is empty in
  `.env` until filled in.

---

## 18. Future Improvements

Reasonable next steps for this project:

- **Payments** — online payment at booking time (UPI/cards).
- **Real email/SMS notifications** — switch to SMTP in production; optional SMS.
- **Availability scheduling** — pick from staff time slots instead of free-form
  date/time.
- **Ratings & reviews** — customers rate completed jobs; staff ratings feed the
  profile.
- **Map-based EV station search** — interactive map (Google Maps) on the
  station list.
- **Live station availability** — real-time port availability instead of a
  seeded count.
- **REST API / mobile app** — expose services/bookings via DRF for a mobile
  client.
- **Production deployment** — gunicorn/uvicorn, PostgreSQL, `collectstatic`,
  HTTPS, and CI.

---

## Appendix A — Running Multiple Projects (Development Server Strategy)

When several Django/Node projects live on one machine, give each its own port
and its own terminal so they never collide.

**Recommended port map** (documentation only — no configuration files are
changed for this):

| Project | Type | Recommended command | Port |
| --- | --- | --- | --- |
| ServiGo | Django | `python manage.py runserver 127.0.0.1:8004` | 8004 |
| TrackWise | Node.js (server + client) | user-managed (see below) | 8001 (server) |
| ResumeAI | Django | `python manage.py runserver 127.0.0.1:8002` | 8002 |
| Nexvent | Django | `python manage.py runserver 127.0.0.1:8004` | 8004 |

> **TrackWise** is a Node.js application with its own server and client. Its
> server/client ports and startup configuration are managed manually by the
> user and are **not** changed here. The port above is only a suggested number
> to reserve when running it.

**Rules of thumb:**
- Run **each project in its own terminal/process** — never two projects in the
  same terminal.
- Give **every project a unique port** — never start two different projects on
  port 8004.
- **Open each project in its own browser tab pointing at that project's
  server** — don't point a ServiGo tab at a ResumeAI server or vice versa.
- **Stop the correct server when you're done** — identify the process on a
  port first (below), then stop only that one.

**Find which process owns a port (Windows PowerShell):**
```powershell
Get-NetTCPConnection -LocalPort 8000 | Select-Object LocalPort, OwningProcess
```
Example output: `8000   14492`. Then map the PID to a process and inspect its
command line before stopping anything:
```powershell
Get-Process -Id 14492
Get-CimInstance Win32_Process -Filter "ProcessId=14492" | Select-Object ProcessId, CommandLine
```
If it is the dev server you want to stop:
```powershell
Stop-Process -Id 14492
```
**Do not kill unrelated processes** — verify the command line shows the
`manage.py runserver` (or node) command for that project first.

**Why a port might be busy:** if `runserver 127.0.0.1:8004` prints
`Error: That port is already in use`, run the port check above. Either stop
the leftover server or launch on a free port, e.g.
`python manage.py runserver 127.0.0.1:8005`.
