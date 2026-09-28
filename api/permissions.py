"""
Custom DRF permissions for the ServiGo API.
"""
from rest_framework.permissions import BasePermission


def _role(user):
    """
    Read a role off a user object without assuming the custom model.

    Anonymous and token-less requests hand us an ``AnonymousUser``, which has
    no `role` at all. `getattr` with a default keeps the checks below from
    raising ``AttributeError`` (which DRF would surface as a 500 rather than
    the 401/403 the caller actually deserves).
    """
    return getattr(user, "role", None)


class IsCustomer(BasePermission):
    """Allow access only to users with role == 'customer'."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and _role(request.user) == "customer"
        )


class IsStaffUser(BasePermission):
    """
    Allow access only to service staff.

    Two independent things qualify someone for the dispatch desk:

      1. ``role == "staff"`` — the custom-model role a technician signs up
         with.
      2. ``is_staff`` — Django's own admin flag.

    Both are checked because they are set independently in practice: an
    operator promoting someone to a dispatcher in Django admin flips
    ``is_staff`` without touching ``role``, and every other permission in this
    module keys off ``role`` alone. A guard that only honoured ``role`` would
    lock that operator out of the one screen their promotion was for.

    ``is_superuser`` is deliberately *not* folded in. Superusers already
    reach the API through ``IsAdminUser`` on the routes that want them, and
    quietly letting a superuser into a technician-only queue is the kind of
    widening that goes unnoticed until a booking is claimed by someone with no
    business claiming it.
    """

    message = "Only service staff can perform this action."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return _role(user) == "staff" or bool(getattr(user, "is_staff", False))



class IsOwnerOrStaff(BasePermission):
    """
    Object-level: the booking's customer can access, and staff/admin can too.
    Used on booking detail and cancel endpoints.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # Staff and admin can see all bookings
        if hasattr(user, "is_staff_user") and user.is_staff_user:
            return True
        if hasattr(user, "is_admin_user") and user.is_admin_user:
            return True
        # Customer can only access their own booking
        return obj.customer_id == user.id
