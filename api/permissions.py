"""
Custom DRF permissions for the ServiGo API.
"""
from rest_framework.permissions import BasePermission


class IsCustomer(BasePermission):
    """Allow access only to users with role == 'customer'."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "customer"
        )


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
