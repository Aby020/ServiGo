"""
Authentication backends for the accounts app.

ServiGo's custom User model uses ``USERNAME_FIELD = "email"``, so Django's
default ``ModelBackend`` only authenticates by email. The login form,
however, accepts "email or username". This backend lets users sign in with
either identifier, exactly as the form advertises.
"""
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

from .models import User


class EmailOrUsernameBackend(ModelBackend):
    """Authenticate against ServiGo users by email or username."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if username is None or password is None:
            return None

        try:
            user = User.objects.get(
                Q(email__iexact=username) | Q(username__iexact=username)
            )
        except User.DoesNotExist:
            # Run the hasher anyway to keep the response time uniform
            # (mitigates username-enumeration timing attacks).
            User().set_password(password)
            return None
        except User.MultipleObjectsReturned:
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
