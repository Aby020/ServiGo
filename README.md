<div align="center">

# 🏠 ServiGo

### Home Services & EV Charging Booking Platform

A full-featured web application that connects customers with verified local service professionals — electricians, plumbers, and Smart TV experts — alongside a live network of EV charging stations with slot booking. Built on **Django 5.2** with role-based dashboards for customers, staff, and administrators.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white&style=flat-square)
![Django](https://img.shields.io/badge/Django-5.2-092E20?logo=django&style=flat-square)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5-7952B3?logo=bootstrap&logoColor=white&style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white&style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?logo=postgresql&logoColor=white&style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

</div>

<p align="center">
  <img src="screenshots/servigo_home_page.gif" alt="ServiGo home page — hero, search, featured services and EV charging" width="90%">
</p>

---

## 📖 Project Overview

ServiGo simplifies the way people manage home maintenance and electric vehicle charging — through a single, user-friendly platform.

Customers can quickly book professional services such as electrical repairs, plumbing, and Smart TV maintenance, or reserve a slot at a nearby EV charging station. Staff and administrators get powerful tools to manage bookings, services, customers, and operational workflows — all from dedicated role-based dashboards.

Built with Django and Bootstrap 5, ServiGo focuses on usability, security, and maintainability while demonstrating a practical implementation of authentication, CRUD operations, email notifications, role-based access control, and responsive web design.

---

## ✨ Key Features

| Area | Feature | What it does |
| ---- | ------- | ------------ |
| 🔐 **Authentication** | Secure registration & login | Email-or-username login with a custom `User` model (email as the unique identifier) |
| 🔐 **Authentication** | Role-based access | Customers, staff, and administrators each get their own portal and permissions |
| 🔐 **Authentication** | Password reset | Self-service recovery via email |
| 🛠️ **Services** | Service catalogue | Browse electrical, plumbing, and Smart TV services with detailed pricing |
| 🛠️ **Services** | Category pages | Dedicated pages per service category |
| 📅 **Bookings** | Service booking flow | Date, time, location and notes with a live price summary |
| 📅 **Bookings** | Email confirmation | Customers receive booking confirmations by email |
| 📅 **Bookings** | Status workflow | Pending → Confirmed → Completed (or Cancelled) with audit history |
| ⚡ **EV Charging** | Station search | Find stations by name, address, city, state, or pincode |
| ⚡ **EV Charging** | Filters | Charger-type and price filters plus an available-only toggle |
| ⚡ **EV Charging** | Slot booking | Reserve charging slots with Google Maps location integration |
| 📊 **Dashboards** | Customer dashboard | Upcoming service and EV bookings at a glance |
| 📊 **Dashboards** | Staff dashboard | Today's bookings and operational workload |
| 📊 **Dashboards** | Admin dashboard | Full-platform stats with recent service and EV bookings |
| 📧 **Contact** | Contact form | Inquiry form with email notifications |

---

## 👤 User Roles

| Role | What they can do |
| ---- | ---------------- |
| **Customer** | Browse services and EV stations, book appointments, manage their own bookings, and view booking history |
| **Staff** | View and manage service bookings, update booking statuses, and monitor daily service operations |
| **Admin** | Full administrative control — manage users, services, stations, bookings, and view platform-wide analytics |

> **Note:** Only `customer` and `staff` can self-register through the public form. Admin accounts are created only via `seed_demo` or the Django admin panel — preventing self-service privilege escalation.

---

## 🛠️ Technology Stack

| Category | Technologies |
| -------- | ------------ |
| **Backend** | Python 3.12, Django 5.2 |
| **Frontend** | HTML5, CSS3, Bootstrap 5, JavaScript |
| **Database** | SQLite (development) · PostgreSQL (production, via `DATABASE_URL`) |
| **Authentication** | Custom `User` model · email-or-username backend |
| **Forms** | Django Crispy Forms · Crispy Bootstrap 5 |
| **Configuration** | django-environ (environment variables) |
| **Media / Assets** | Pillow, Django static & media handling |
| **Dev Tooling** | django-browser-reload |
| **Deployment Ready** | Virtual environments, `.env` configuration |

---

## 🔄 Core Workflows

```text
                Client Browser
                      │
                      ▼
           Bootstrap 5 Responsive UI
                      │
                      ▼
              Django URL Routing
                      │
                      ▼
             Django Views & Logic
      ┌───────────────┼────────────────┐
      ▼               ▼                ▼
 Authentication  Booking Module   EV Charging
      │               │                │
      └───────────────┼────────────────┘
                      ▼
                SQLite / PostgreSQL
                      │
                      ▼
            Email Notifications
```

**Service booking flow**

```text
Browse Services → Select a Service → Fill Date/Time & Location
    → Book → Confirmation Email → Track Status in Dashboard
```

**EV charging flow**

```text
Search Stations → Filter by Location/Charger/Price → View Station Details
    → Pick a Slot → Confirm → Manage Booking in Dashboard
```

---

## 📸 Screenshots

### 🏠 Landing Page
<p align="center">
  <img src="screenshots/servigo-home-page.png" alt="ServiGo home page" width="90%">
  <br>
  <em>Home page — hero, search, and featured services</em>
</p>

### 🔐 Authentication
<p align="center">
  <img src="screenshots/servigo-login-page.png" alt="Login page" width="90%">
  <img src="screenshots/servigo-registration-page.png" alt="Registration page" width="90%">
  <br>
  <em>Secure login and role-based registration</em>
</p>

### 📝 Service Booking
<p align="center">
  <img src="screenshots/servigo-booking-management.png" alt="Service booking form" width="90%">
  <br>
  <em>Schedule a visit — date, time, location, and booking summary</em>
</p>
<p align="center">
  <img src="screenshots/servigo-booking-success.png" alt="Booking success" width="90%">
  <img src="screenshots/servigo-booking-details.png" alt="Booking details" width="90%">
  <br>
  <em>Booking confirmation and detailed booking view</em>
</p>

### ⚡ EV Charging
<p align="center">
  <img src="screenshots/servigo-ev-station-details.png" alt="EV station details" width="90%">
  <img src="screenshots/servigo-ev-booking-form.png" alt="EV booking form" width="90%">
  <br>
  <em>Station details and charging slot booking</em>
</p>

### 👨‍💼 Staff Dashboard
<p align="center">
  <img src="screenshots/servigo-staff-dashboard.png" alt="Staff dashboard" width="90%">
  <img src="screenshots/servigo-staff-bookings.png" alt="Staff bookings list" width="90%">
  <br>
  <em>Operational overview and booking management</em>
</p>

### 🛡️ Admin Panel
<p align="center">
  <img src="screenshots/servigo-admin-booking-history.png" alt="Admin booking history" width="90%">
  <br>
  <em>Booking status histories in the Django admin</em>
</p>

### 📧 Contact & About
<p align="center">
  <img src="screenshots/servigo-contact-page.png" alt="Contact page" width="90%">
  <img src="screenshots/servigo_about_page.gif" alt="About page" width="90%">
  <br>
  <em>Contact form and about page</em>
</p>

---

## 📂 Project Structure

```text
ServiGo/
├── accounts/          # Custom User, authentication, registration, profiles
├── services/          # Service categories & catalogue, image handling
├── bookings/          # Service bookings, status workflow & history
├── ev_charging/       # EV stations & charging slot bookings
├── dashboard/         # Role-based dashboards (customer / staff / admin)
├── core/              # Home, About, Contact & shared context
├── config/            # Django project settings (settings, urls, wsgi)
├── templates/         # Shared + per-app HTML templates
├── static/            # CSS, JS, images
├── media/             # User-uploaded media
├── tests/             # Test suite (per-app packages)
├── scripts/           # Dev helpers (run_dev.ps1)
├── screenshots/       # README screenshots
├── manage.py
├── requirements.txt
└── .env.example
```

---

## 🚀 Installation & Setup

**Prerequisites:** Python 3.12, Git.

```bash
# 1. Clone the repository
git clone https://github.com/Aby020/ServiGo.git
cd ServiGo

# 2. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate    # macOS / Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
Copy-Item .env.example .env   # Windows PowerShell
# cp .env.example .env        # macOS / Linux

# 5. Apply database migrations
python manage.py migrate

# 6. Seed demo data (categories, services, EV stations, demo users)
python manage.py seed_demo

# 7. Run the development server
python manage.py runserver 127.0.0.1:8004
```

Open <http://127.0.0.1:8004> in your browser.

On Windows you can use the shortcut launcher instead:

```powershell
.\scripts\run_dev.ps1          # starts on 127.0.0.1:8000
```

### 👥 Demo Accounts

`seed_demo` creates the following accounts:

| Role | Email | Password |
| ---- | ----- | -------- |
| **Admin** | `admin@servigo.com` | `admin12345` |
| **Staff** | `staff@servigo.com` | `staff12345` |
| **Customer** | `customer@servigo.com` | `customer12345` |

### 🛡️ Create an Admin Account Manually

```bash
python manage.py createsuperuser
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (or rely on sensible defaults):

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `SECRET_KEY` | Django secret key — set a strong value in production | generated dev key |
| `DEBUG` | Debug mode (`True`/`False`) | `True` |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts | `localhost,127.0.0.1,testserver` |
| `DATABASE_URL` | Production database URL (e.g. PostgreSQL) | SQLite (dev) |
| `EMAIL_HOST` / `EMAIL_PORT` / etc. | SMTP settings for booking confirmation emails | console email (dev) |

---

## 🔒 Security

- **Custom `User` model** with email as the unique identifier — username login still supported via an email-or-username backend.
- **Role-restricted public registration** — only `customer` and `staff` can sign up through the public form; `admin` is created only via `seed_demo` or the Django admin, preventing self-service privilege escalation.
- **Role-based access control** — staff/admin views are gated by dedicated mixins; dashboards and booking data are filtered per user.
- **Open-redirect protection** — the login `next` parameter is validated with `url_has_allowed_host_and_scheme`.
- **Session-based auth** with Django's built-in password hashing.

---

## 🗺️ Roadmap

- [x] Authentication & registration with role selection
- [x] Service catalogue and category pages
- [x] Service booking flow with email confirmation
- [x] EV charging stations and slot booking
- [x] Customer, staff, and admin dashboards
- [x] Booking status workflow with audit history
- [ ] Online payment integration
- [ ] Customer reviews & ratings per service
- [ ] Real-time booking availability
- [ ] Mobile app (React Native / Flutter)

---

## 👤 Author

<div align="center">

### Abi Thomas

**Full-Stack Developer**

<p>
  <a href="https://github.com/Aby020">
    <img src="https://img.shields.io/badge/GitHub-Aby020-181717?logo=github">
  </a>
  <a href="https://linkedin.com/in/abithomas-dev">
    <img src="https://img.shields.io/badge/LinkedIn-Abi%20Thomas-0A66C2?logo=linkedin">
  </a>
</p>

</div>

## 🤝 Support

For questions, feature requests, or bug reports, please open an [issue](https://github.com/Aby020/ServiGo/issues) on GitHub.

<div align="center">

**Made with ❤️ by Abi Thomas**

</div>
