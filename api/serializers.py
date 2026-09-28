"""
Serializers for the ServiGo REST API.
"""
import re

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema_field

from accounts.models import CustomerProfile, User
from services.models import Service, ServiceCategory
from bookings.models import Booking, BookingStatusHistory


class UserProfileSerializer(serializers.ModelSerializer):
    """Read-only serializer for a user profile (own account or registration)."""

    class Meta:
        model = User
        fields = ["id", "email", "username", "role", "first_name", "last_name"]
        read_only_fields = fields


# Backwards-compatible alias — older imports still resolve to the same class.
MeSerializer = UserProfileSerializer


class TokenResponseSerializer(serializers.Serializer):
    """
    A SimpleJWT token pair.  Used as the `200` response schema for
    `POST /api/auth/login/` and as the `tokens` member of `AuthSuccessSerializer`.
    """

    access = serializers.CharField(
        help_text="Short-lived JWT access token, sent as `Authorization: Bearer <access>`."
    )
    refresh = serializers.CharField(
        help_text="Long-lived JWT refresh token, used only against /api/auth/refresh/."
    )


class LoginSerializer(serializers.Serializer):
    """
    Accept ``identifier`` (email OR username) + ``password`` and return
    a SimpleJWT token pair.  Uses the existing EmailOrUsernameBackend via
    Django's ``authenticate()`` so the backend selection is transparent.
    """

    identifier = serializers.CharField(
        write_only=True, help_text="Registered email address or username."
    )
    password = serializers.CharField(
        write_only=True, style={"input_type": "password"}, trim_whitespace=False
    )

    # Read fields returned on success
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)

    def validate(self, attrs):
        identifier = attrs.get("identifier")
        password = attrs.get("password")

        user = authenticate(
            request=self.context.get("request"),
            username=identifier,
            password=password,
        )

        if user is None:
            raise serializers.ValidationError(
                "Unable to log in with the provided credentials.",
                code="authorization",
            )

        refresh = RefreshToken.for_user(user)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }


# ── Registration ──────────────────────────────────────────────────────────────

# Mirrors the Zod schema on the frontend so client- and server-side rules
# never drift: letters, digits and underscores only.
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]+$")
USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 30


class RegisterSerializer(serializers.Serializer):
    """
    Public self-service signup.  Provisions a **customer** account and
    immediately issues a SimpleJWT token pair so the client can drop the user
    straight onto their dashboard without a second round-trip to /login/.

    Privilege guard
    ---------------
    ``role``, ``is_staff``, ``is_superuser`` and ``is_active`` are declared
    ``read_only`` and are additionally stripped in :meth:`validate`, so a
    client that POSTs ``{"role": "admin", "is_staff": true}` gets a plain
    customer.  Role assignment is hardcoded in :meth:`create` — it is never
    read from the payload.
    """

    username = serializers.CharField(
        max_length=USERNAME_MAX_LENGTH,
        min_length=USERNAME_MIN_LENGTH,
        help_text=(
            "3-30 characters. Letters, numbers and underscores only. "
            "Used as the display handle; sign-in works with either this or the email."
        ),
    )
    email = serializers.EmailField(
        help_text="Unique across all accounts; case-insensitive."
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
        help_text=(
            "Minimum 8 characters, not entirely numeric, not a common password, "
            "and not too similar to the username or email."
        ),
    )
    first_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    last_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )

    # Documented in the schema as server-owned so the contract is explicit.
    # `read_only` means DRF neither reads these from the payload nor lets
    # `create()` see them; the strip loop in validate() restates the guarantee
    # so it survives a future switch to a ModelSerializer. They are also
    # excluded from the schema's `required` list via
    # SPECTACULAR_SETTINGS["COMPONENT_NO_READ_ONLY_REQUIRED"].
    role = serializers.CharField(
        read_only=True,
        help_text="Server-assigned. Always `customer`; a supplied value is ignored.",
    )
    is_staff = serializers.BooleanField(
        read_only=True,
        help_text="Server-assigned. Always false; a supplied value is ignored.",
    )
    is_superuser = serializers.BooleanField(
        read_only=True,
        help_text="Server-assigned. Always false; a supplied value is ignored.",
    )
    is_active = serializers.BooleanField(
        read_only=True,
        help_text="Server-assigned. Always true; a supplied value is ignored.",
    )

    def validate_username(self, value):
        if not USERNAME_RE.match(value):
            raise serializers.ValidationError(
                "Username may only contain letters, numbers and underscores."
            )
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        # The stored value is lower-cased so the unique index is case-insensitive
        # in practice; the lookup itself is case-insensitive either way.
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("This email address is already in use.")
        return value.lower()

    def validate(self, attrs):
        # Belt-and-braces: drop any privilege fields the client smuggled in.
        # A plain Serializer never places undeclared keys in `validated_data`,
        # but stripping explicitly documents the guarantee and survives a
        # future switch to a ModelSerializer.
        for forbidden in ("role", "is_staff", "is_superuser", "is_active", "id"):
            attrs.pop(forbidden, None)

        # Password policy is evaluated against a throwaway user instance so
        # UserAttributeSimilarityValidator can compare against username/email.
        candidate = User(
            username=attrs.get("username", ""),
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(
            **validated_data,
            role=User.Role.CUSTOMER,   # hardcoded — never client-influenced
            is_staff=False,
            is_superuser=False,
            is_active=True,
        )
        user.set_password(password)
        user.save()

        CustomerProfile.objects.create(user=user)
        return user


class AuthSuccessSerializer(serializers.Serializer):
    """
    Registration response: the freshly created profile plus a token pair,
    so the client can persist the session without logging in again.
    """

    user = UserProfileSerializer(read_only=True)
    tokens = TokenResponseSerializer(read_only=True)


# ── Services ──────────────────────────────────────────────────────────────────

class ServiceCategorySerializer(serializers.ModelSerializer):
    """ServiceCategory list/detail serializer — only active categories."""

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ServiceCategory
        fields = ["id", "name", "slug", "description", "icon", "image_url", "display_order"]

    @extend_schema_field(
        serializers.URLField(
            allow_null=True, help_text="Absolute URL of the category image."
        )
    )
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class ServiceCategoryMinimalSerializer(serializers.ModelSerializer):
    """Minimal category info embedded in Service responses."""

    class Meta:
        model = ServiceCategory
        fields = ["id", "name", "slug"]


class ServiceSerializer(serializers.ModelSerializer):
    """Service list serializer."""

    category = ServiceCategoryMinimalSerializer(read_only=True)
    image_url = serializers.SerializerMethodField()
    what_included = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "name",
            "slug",
            "category",
            "short_description",
            "price",
            "estimated_duration",
            "image_url",
            "what_included",
            "is_available",
            "is_featured",
            "display_order",
        ]

    @extend_schema_field(
        serializers.URLField(allow_null=True, help_text="Absolute URL of the service image.")
    )
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    @extend_schema_field(
        serializers.ListField(
            child=serializers.CharField(),
            help_text="Bulleted inclusions, parsed one per line from the service record.",
        )
    )
    def get_what_included(self, obj):
        return obj.get_what_included_list()


class ServiceDetailSerializer(ServiceSerializer):
    """Service detail serializer — adds full description and what's included."""

    class Meta(ServiceSerializer.Meta):
        # `what_included` is already in ServiceSerializer.Meta.fields; only
        # `description` is new here.
        fields = ServiceSerializer.Meta.fields + ["description"]


# ── Bookings ──────────────────────────────────────────────────────────────────

class BookingStatusHistorySerializer(serializers.ModelSerializer):
    """Read-only audit trail entry for a booking."""

    changed_by_name = serializers.SerializerMethodField(
        help_text="Display name of the user who made the change, if any."
    )

    class Meta:
        model = BookingStatusHistory
        fields = [
            "id",
            "previous_status",
            "new_status",
            "changed_by_name",
            "notes",
            "created_at",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.get_full_name() or obj.changed_by.username
        return None


class BookingSerializer(serializers.ModelSerializer):
    """
    Used for booking list responses.
    Snapshots (service_name, service_price) are read from the stored booking,
    not re-fetched from the Service model — mirroring the template views.
    """

    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Booking
        fields = [
            "id",
            "service_name",
            "service_price",
            "preferred_date",
            "preferred_time",
            "location",
            "address",
            "notes",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "service_name",
            "service_price",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        ]


class BookingDetailSerializer(BookingSerializer):
    """Booking detail: includes full status history audit trail."""

    status_history = BookingStatusHistorySerializer(many=True, read_only=True)

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ["status_history"]


class BookingCreateSerializer(serializers.Serializer):
    """
    Validates customer-submitted booking form.
    Mirrors BookingForm validation rules:
      - preferred_date must not be in the past.
    Service snapshot fields (name, price) are resolved from service_id
    in the view and written directly to the Booking instance.
    """

    service_id = serializers.IntegerField()
    preferred_date = serializers.DateField()
    preferred_time = serializers.TimeField()
    location = serializers.CharField(max_length=200)
    address = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_service_id(self, value):
        try:
            service = Service.objects.get(pk=value, is_available=True)
        except Service.DoesNotExist:
            raise serializers.ValidationError("Service not found or unavailable.")
        # Stash for use in create()
        self._service = service
        return value

    def validate_preferred_date(self, value):
        # Match BookingForm.clean_preferred_date: date must not be in the past
        if value < timezone.now().date():
            raise serializers.ValidationError("Preferred date cannot be in the past.")
        return value

    def create(self, validated_data):
        """
        Build the Booking from validated data + the authenticated user.
        Mirrors BookingCreateView.form_valid() snapshot behaviour.
        """
        user = self.context["request"].user
        service = self._service

        booking = Booking.objects.create(
            customer=user,
            customer_name=user.get_full_name() or user.username,
            customer_email=user.email,
            customer_phone=getattr(user, "phone", "") or "",
            service_name=service.name,
            service_price=service.price,
            preferred_date=validated_data["preferred_date"],
            preferred_time=validated_data["preferred_time"],
            location=validated_data["location"],
            address=validated_data["address"],
            notes=validated_data.get("notes", ""),
            status=Booking.Status.PENDING,
        )

        # Initial history row documenting creation
        BookingStatusHistory.objects.create(
            booking=booking,
            previous_status="",
            new_status=Booking.Status.PENDING,
            changed_by=user,
            notes="Booking created by customer",
        )

        return booking
