"""
Custom DRF permissions for the ServiGo API.
"""
from rest_framework.permissions import BasePermission

#: Roles that grant platform-wide visibility over every customer's records.
PRIVILEGED_ROLES = frozenset({"staff", "admin"})


def _role(user):
    """
    Read a role off a user object without assuming the custom model.

    Anonymous and token-less requests hand us an ``AnonymousUser``, which has
    no `role` at all. `getattr` with a default keeps the checks below from
    raising ``AttributeError`` (which DRF would surface as a 500 rather than
    the 401/403 the caller actually deserves).
    """
    return getattr(user, "role", None)


def _is_privileged(user):
    """
    Return True only for a genuinely privileged caller.

    Every flag consulted here is *coerced to a real boolean* before it can
    influence a decision. The distinction is not cosmetic: on the custom user
    model ``is_staff_user`` / ``is_admin_user`` are ``property`` objects, so
    ``getattr(user, "is_staff_user", False)`` yields a bound-method or
    function object where the attribute exists — and a bare ``if`` over such an
    object is truthy no matter what it would return. Django's ``is_staff`` is
    the mirror-image trap: it is a real ``BooleanField``, so *any* defined
    value (including ``False``) makes ``hasattr`` succeed.

    Coercing with ``bool()`` collapses both traps into a single answer and
    keeps the role string as the source of truth for the API surface.
    """
    if not (user and user.is_authenticated):
        return False
    if _role(user) in PRIVILEGED_ROLES:
        return True
    # Fall back to Django's own flags so an operator promoted through Django
    # admin (who never touches `role`) is not locked out of the API.
    return bool(getattr(user, "is_staff", False)) or bool(
        getattr(user, "is_superuser", False)
    )


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



class IsAdminUser(BasePermission):
    """
    Allow access only to platform administrators.

    Two independent things qualify someone, exactly as for
    :class:`IsStaffUser`:

      1. ``role == "admin"`` — the custom-model role set when an operator
         provisions or promotes an account.
      2. ``is_superuser`` — Django's own flag.

    Both are checked because an operator raising someone through Django
    admin flips ``is_superuser`` without touching ``role``, and a role-only
    guard would lock that operator out of the very screen the promotion
    was for.

    This is the platform-wide guard: it gates staff provisioning and the
    analytics aggregate, neither of which should be reachable by a
    technician. It is intentionally *not* folded into :class:`IsStaffUser`
    — an admin who also carries ``is_staff`` should still get a 403 here
    rather than silently passing as a dispatcher, because "who is allowed
    to create staff accounts" and "who is allowed to claim a job" are
    different questions with different blast radii.
    """

    message = "Only administrators can perform this action."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return _role(user) == "admin" or bool(getattr(user, "is_superuser", False))


class IsOwnerOrStaff(BasePermission):
    """
    Object-level: the booking's customer can access, and staff/admin can too.
    Used on booking detail and cancel endpoints.

    Anti-IDOR: exactly one of two things may pass — the caller is genuinely
    privileged (see :func:`_is_privileged`), or the caller *is* the record's
    owner. Nothing else, and in particular the decision is never made from
    ``hasattr`` alone: an attribute merely existing says nothing about
    whether it evaluates to True, and treating its presence as consent is what
    previously let any authenticated caller read any other customer's booking.

    Ownership is compared on the foreign key id rather than the related
    object, so a caller cannot influence the check by manipulating
    ``obj.customer`` in memory before the permission runs.
    """

    message = "You do not have permission to access this booking."

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # Staff and admin can see all bookings.
        if _is_privileged(user):
            return True
        # Everyone else may only reach their own record.
        owner_id = getattr(obj, "customer_id", None)
        return owner_id is not None and owner_id == user.pk
