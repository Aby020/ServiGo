"""
Lightweight factories for accounts tests.

The project doesn't depend on factory_boy, so these are thin helpers built
on the ORM. Each factory returns a persisted ``User``; role-specific helpers
also ensure the matching profile row exists (as registration does).
"""
from django.contrib.auth import get_user_model

from accounts.models import CustomerProfile, StaffProfile

User = get_user_model()

DEFAULT_PASSWORD = "Strongpass123!"


def make_user(
    email="user@example.com",
    username="user",
    password=DEFAULT_PASSWORD,
    role=None,
    **kwargs,
):
    """Create a persisted user with a usable password."""
    user = User.objects.create_user(
        email=email,
        username=username,
        password=password,
        **kwargs,
    )
    if role:
        user.role = role
        user.save(update_fields=["role"])
    return user


def make_customer(**kwargs):
    """Create a customer-role user with a CustomerProfile."""
    kwargs.setdefault("email", "customer@example.com")
    kwargs.setdefault("username", "customer")
    user = make_user(role=User.Role.CUSTOMER, **kwargs)
    CustomerProfile.objects.get_or_create(user=user)
    return user


def make_staff(**kwargs):
    """Create a staff-role user with a StaffProfile."""
    kwargs.setdefault("email", "staff@example.com")
    kwargs.setdefault("username", "staff")
    user = make_user(role=User.Role.STAFF, **kwargs)
    StaffProfile.objects.get_or_create(user=user)
    return user


def make_admin(**kwargs):
    """Create an admin-role user (is_staff so Django admin is reachable)."""
    kwargs.setdefault("email", "admin@example.com")
    kwargs.setdefault("username", "admin")
    kwargs.setdefault("is_staff", True)
    return make_user(role=User.Role.ADMIN, **kwargs)
