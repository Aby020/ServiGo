"""
Serializers for the ServiGo REST API.
"""
import re
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import F
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema_field

from accounts.models import CustomerProfile, User
from services.models import Service, ServiceCategory
from bookings.models import Booking, BookingStatusHistory
from ev_charging.models import EVChargingBooking, EVChargingStation


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


class StaffBookingSerializer(BookingSerializer):
    """
    A booking as the dispatch desk needs to see it.

    `BookingSerializer` deliberately omits the customer's contact details — it
    is also the customer-facing list payload, and a customer must not be able
    to read another customer's phone number by listing their own bookings.
    The dispatch queue is the one surface where the technician actually needs
    to call the customer, so this subclass adds the contact snapshot plus the
    current assignee, and stays on staff-gated routes only.
    """

    customer_name = serializers.CharField(read_only=True)
    customer_email = serializers.EmailField(read_only=True)
    customer_phone = serializers.CharField(read_only=True)
    assigned_staff_id = serializers.IntegerField(read_only=True)
    assigned_staff_name = serializers.SerializerMethodField()

    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + [
            "customer_name",
            "customer_email",
            "customer_phone",
            "assigned_staff_id",
            "assigned_staff_name",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_assigned_staff_name(self, obj):
        if obj.assigned_staff:
            return obj.assigned_staff.get_full_name()
        return None


class StaffBookingDetailSerializer(StaffBookingSerializer):
    """Dispatch view of a booking, including the audit trail."""

    status_history = BookingStatusHistorySerializer(many=True, read_only=True)

    class Meta(StaffBookingSerializer.Meta):
        fields = StaffBookingSerializer.Meta.fields + ["status_history"]


class StaffBookingAssignSerializer(serializers.Serializer):
    """
    Request body for claiming a job. Intentionally empty.

    A claim always assigns to the *authenticated* caller, so the body has
    nothing to carry. Declaring it (rather than passing `request=None`)
    keeps the generated client from implying a body is required and stops a
    caller "helpfully" posting `{"staff_id": 7}` to assign someone else.
    """

    def validate(self, attrs):
        return attrs


class StaffBookingStatusSerializer(serializers.Serializer):
    """
    Validates a staff-initiated status change.

    Two layers of guard, because they answer different questions:

      * ``validate_status`` rejects a status the *model* doesn't define. That
        is a field-validation failure and belongs in a 400 with a field key, so
        a generated client can tell it apart from a business-rule refusal.
      * ``validate`` rejects a status the *booking* can't legally move to
        right now — terminal-state and no-op rules. This one is a
        business-rule failure, so it raises a plain `ValidationError` that
        renders as a 400 with a single `detail` key.
    """

    status = serializers.ChoiceField(
        choices=Booking.Status.choices,
        help_text="The status to move the booking into.",
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        help_text=(
            "Free-text note recorded against the transition and shown to the "
            "customer on their booking timeline."
        ),
    )

    #: Statuses a booking can never leave. Completing or cancelling a job is
    #: terminal: a technician who realises they marked the wrong job done
    #: needs a human to reopen it, not a second click.
    TERMINAL_STATUSES = {Booking.Status.COMPLETED, Booking.Status.CANCELLED}

    def validate(self, attrs):
        booking = self.context["booking"]
        target = attrs["status"]
        current = booking.status

        if current in self.TERMINAL_STATUSES:
            raise serializers.ValidationError(
                f"This booking is already {booking.get_status_display().lower()} "
                "and can no longer be changed."
            )

        if target == current:
            raise serializers.ValidationError(
                f"This booking is already {booking.get_status_display().lower()}."
            )

        # Only a staff member who owns the job may move it. An unassigned job
        # has to be claimed first, so `assigned_staff_id` is the gate.
        if booking.assigned_staff_id != self.context["actor"].id:
            raise serializers.ValidationError(
                "This booking is assigned to another technician. Claim it first."
            )

        return attrs


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


# ── EV charging ───────────────────────────────────────────────────────────────
#
# Prices and costs are `DecimalField`s. DRF serialises those as strings by
# default, which is lossless on the wire but forces every consumer to
# `parseFloat` before it can do arithmetic — so the EV serializers override the
# DecimalField with `COERCE_DECIMAL_TO_STRING = False` and emit real JSON
# numbers. Booking costs are money, so the money-shaped fields
# (`price_per_kwh`, `estimated_cost`) are quantised to two decimals here, the
# same precision the model column guarantees.

#: Length of one bookable bay window. Half an hour is short enough that a
#: driver waiting for a bay is not waiting long, and long enough that the grid
#: stays readable — 48 windows is as much a person will scan in a dropdown.
SLOT_DURATION_MINUTES = 30

#: How far ahead the bay grid is published. One day, matching the longest
#: reservation the service takes.
SLOT_HORIZON_HOURS = 24

#: Energy assumed when the client does not say: roughly 150 km of city driving.
DEFAULT_ESTIMATED_KWH = Decimal("30")

#: Booking states that still hold a bay. A cancelled or completed booking
#: releases its window, so neither is counted when building the grid.
ACTIVE_BOOKING_STATUSES = (
    EVChargingBooking.Status.PENDING,
    EVChargingBooking.Status.CONFIRMED,
    EVChargingBooking.Status.ACTIVE,
)


def build_slot_grid(
    station: EVChargingStation,
    now: timezone.datetime | None = None,
) -> list[dict]:
    """
    Build the bookable bay windows for ``station`` over the next
    :data:`SLOT_HORIZON_HOURS`.

    The grid is a *published contract*, not an availability probe: the booking
    serializer requires the client's requested ``slot_time`` to land exactly on
    one of these ``start`` values. That is what makes two clients cannot
    silently disagree about what a "10:00" slot means.

    Each entry carries the number of free bays *at that window*, which is
    narrower than the station-wide ``available_ports`` counter: a bay held for
    10:00 is not occupied at 10:30. Reservations are read with ``overlap``
    rather than equality, so a two-hour session blocks every window it spans.

    Operating hours are enforced here rather than in a form, so the grid can
    never publish a window the station would then refuse. For a 24×7 station
    the window is simply clock time; for fixed-hours stations a window that
    straddles ``closes_at`` is not published, because the car cannot be
    unplugged on its own.
    """
    now = now or timezone.localtime()
    horizon = now + timedelta(hours=SLOT_HORIZON_HOURS)

    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Ceiling division over whole days, so a request made at 23:50 still gets
    # its last window of today.
    last_day = start_of_day + timedelta(days=SLOT_HORIZON_HOURS // 24 + 1)

    # Windows that already have a booking on them, as (date, start, end) triples.
    # Restricted to the horizon so the query stays indexed on
    # (booking_date, start_time).
    taken: dict = {}
    if station.pk:
        booked = (
            EVChargingBooking.objects.filter(
                station=station,
                booking_date__range=(now.date(), last_day.date()),
                status__in=ACTIVE_BOOKING_STATUSES,
            )
            .values_list("booking_date", "start_time", "end_time")
        )
        for date, start, end in booked:
            taken.setdefault(date, []).append((start, end))

    slots: list[dict] = []
    for day_offset in range((last_day.date() - now.date()).days + 1):
        day = start_of_day + timedelta(days=day_offset)
        windows_today = taken.get(day.date(), [])

        for minutes in range(0, 24 * 60, SLOT_DURATION_MINUTES):
            window_start = day + timedelta(minutes=minutes)
            window_end = window_start + timedelta(minutes=SLOT_DURATION_MINUTES)

            # A window that has already started is not bookable. Compare on the
            # local wall clock so the grid is stable regardless of the server's
            # configured timezone.
            if window_start <= now or window_start > horizon:
                continue

            if not station.is_24_hours:
                opens, closes = station.opens_at, station.closes_at
                if not (opens <= window_start.time() and window_end.time() <= closes):
                    continue

            overlapping = sum(
                1
                for start, end in windows_today
                if start < window_end.time() and end > window_start.time()
            )
            free = max(station.available_ports - overlapping, 0)

            slots.append(
                {
                    "start": window_start.time(),
                    "end": window_end.time(),
                    "is_available": free > 0,
                    "available_ports": free,
                }
            )

    return slots


def ev_decimal_field(**kwargs) -> serializers.DecimalField:
    """
    A DecimalField that serialises as a JSON number, not a string.

    ``coerce_to_string`` is a ``DecimalField.__init__`` argument in DRF 3.15
    (assigning the attribute after construction is ignored, because the field
    sets it itself and the renderer only reads it back). Keeping prices as
    numbers means a client can sum them, compare them and render them without
    a ``parseFloat`` at every call site.
    """
    kwargs.setdefault("coerce_to_string", False)
    return serializers.DecimalField(**kwargs)


def ev_money(**kwargs) -> serializers.DecimalField:
    """
    As :func:`ev_decimal_field`, but pinned to the model's two decimal places.

    ``normalize_output`` is left off so ``9.00`` stays ``9.00`` instead of
    collapsing to ``9`` — a rate is quoted to the paisa, and a UI that prints
    "₹9/kWh" next to "₹9.50/kWh" looks like a rounding bug even when it is
    not one.
    """
    kwargs.setdefault("max_digits", 10)
    kwargs.setdefault("decimal_places", 2)
    return ev_decimal_field(**kwargs)


class EVSlotSerializer(serializers.Serializer):
    """
    One bookable bay window, as published in the station's `slots` array.

    The `start` value is a contract: it is the exact string the client must
    send back as `slot_time` to reserve this window.
    """

    start = serializers.TimeField(
        help_text="Start of the window, station local time. Send this value back verbatim as `slot_time`."
    )
    end = serializers.TimeField(help_text="End of the window, station local time.")
    is_available = serializers.BooleanField(
        help_text="False when a live booking already covers this window, or the station has no free bays."
    )
    available_ports = serializers.IntegerField(
        min_value=0,
        help_text="Free bays across the whole station during this window.",
    )


class EVSlotGridSerializer(serializers.Serializer):
    """
    The bay grid as a whole, including the rules the grid was built from.

    Publishing the slot length and the horizon alongside the windows is what
    lets a client render a correct time picker without hard-coding either
    number — and it is what makes a grid change a visible API change rather
    than a silent one.
    """

    duration_minutes = serializers.IntegerField(
        min_value=1, help_text="Length of every window, in minutes."
    )
    horizon_hours = serializers.IntegerField(
        min_value=1, help_text="How far ahead the grid is published."
    )
    timezone = serializers.CharField(
        help_text="IANA timezone the `start` / `end` wall-clock times are expressed in."
    )
    slots = EVSlotSerializer(many=True, help_text="Windows in chronological order.")


def slot_grid_payload(station: EVChargingStation) -> dict:
    """The full :class:`EVSlotGridSerializer` payload for one station."""
    return {
        "duration_minutes": SLOT_DURATION_MINUTES,
        "horizon_hours": SLOT_HORIZON_HOURS,
        "timezone": str(timezone.get_current_timezone()),
        "slots": build_slot_grid(station),
    }


class EVStationSerializer(serializers.ModelSerializer):
    """
    A station as the discovery list and map need it: identity, where it is,
    what it plugs into, what it costs and how full it is.
    """

    latitude = serializers.FloatField(
        allow_null=True, help_text="WGS84 latitude, or null when un-geocoded."
    )
    longitude = serializers.FloatField(
        allow_null=True, help_text="WGS84 longitude, or null when un-geocoded."
    )
    price_per_kwh = ev_money(
        max_digits=6, help_text="Published rate in rupees per kWh."
    )
    charger_type_display = serializers.CharField(
        source="get_charger_type_display", read_only=True
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    availability_tone = serializers.CharField(
        source="get_availability_tone",
        read_only=True,
        help_text=(
            "`available`, `limited` or `unavailable` — the single value the map "
            "colours a pin by, collapsed from status and bay occupancy."
        ),
    )
    is_fast_charging = serializers.BooleanField(
        read_only=True,
        help_text="True when the charger is DC fast (50 kW and above).",
    )
    is_open_now = serializers.BooleanField(read_only=True)
    image_url = serializers.SerializerMethodField()
    price_display = serializers.CharField(read_only=True)
    hours_display = serializers.CharField(read_only=True)

    class Meta:
        model = EVChargingStation
        fields = [
            "id",
            "name",
            "slug",
            "address",
            "city",
            "state",
            "pincode",
            "latitude",
            "longitude",
            "charger_type",
            "charger_type_display",
            "charging_speed_kw",
            "is_fast_charging",
            "price_per_kwh",
            "price_display",
            "status",
            "status_display",
            "availability_tone",
            "total_ports",
            "available_ports",
            "is_24_hours",
            "is_open_now",
            "image_url",
            "hours_display",
        ]
        read_only_fields = fields

    @extend_schema_field(
        serializers.URLField(allow_null=True, help_text="Absolute URL of the station photo.")
    )
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class EVStationDetailSerializer(EVStationSerializer):
    """Station profile: everything in the list response plus the slot grid."""

    slot_grid = EVSlotGridSerializer(read_only=True)

    class Meta(EVStationSerializer.Meta):
        fields = EVStationSerializer.Meta.fields + [
            "description",
            "opens_at",
            "closes_at",
            "slot_grid",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # The grid has no model attribute behind it, so it is grafted on after
        # the normal field walk. Declaring it as a nested serializer is what
        # gives the schema its shape, and the override is what keeps the value
        # accurate — the grid is computed per request, not stored.
        data["slot_grid"] = EVSlotGridSerializer(slot_grid_payload(instance)).data
        return data


class EVBookingSerializer(serializers.ModelSerializer):
    """A charging reservation as the list response returns it."""

    id = serializers.IntegerField(read_only=True)
    station = EVStationSerializer(read_only=True)
    station_id = serializers.IntegerField(write_only=True, min_value=1)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    price_per_kwh = serializers.SerializerMethodField()
    start_at = serializers.DateTimeField(
        read_only=True, help_text="`booking_date` + `start_time` resolved to one instant."
    )
    end_at = serializers.DateTimeField(
        read_only=True, help_text="`booking_date` + `end_time` resolved to one instant."
    )

    class Meta:
        model = EVChargingBooking
        fields = [
            "id",
            "station",
            "station_id",
            "vehicle_number",
            "booking_date",
            "start_time",
            "end_time",
            "start_at",
            "end_at",
            "estimated_kwh",
            "estimated_cost",
            "price_per_kwh",
            "status",
            "status_display",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "vehicle_number",
            "booking_date",
            "start_time",
            "end_time",
            "estimated_kwh",
            "estimated_cost",
            "status",
            "status_display",
            "notes",
            "created_at",
            "updated_at",
        ]

    @extend_schema_field(serializers.FloatField())
    def get_price_per_kwh(self, obj) -> float:
        # The rate is snapshotted off the station at read time. The booking does
        # not copy it, so a station price change never rewrites history — but a
        # client rendering an old reservation still gets the number it was
        # quoted alongside `estimated_cost`.
        return float(obj.station.price_per_kwh)

    estimated_kwh = ev_decimal_field(
        max_digits=6,
        decimal_places=2,
        help_text="Energy the customer expects to take. Defaults to 30 kWh when omitted.",
    )
    estimated_cost = ev_money(
        help_text="Server-calculated as `estimated_kwh × station.price_per_kwh`.",
    )


class EVBookingCreateSerializer(serializers.Serializer):
    """
    Validates and builds a charging reservation.

    The payload is intentionally small — `station_id`, `slot_time` and
    `vehicle_number` — because the bay grid, the operating hours and the price
    are all the server's to derive. Anything the client could get wrong is
    therefore a server-computed field:

      - `booking_date` comes from `slot_time`, not from a separate input.
      - `end_time` is the next slot in the grid, so an overlapping or
        out-of-hours request is structurally impossible.
      - `estimated_cost` is `estimated_kwh × station.price_per_kwh`.

    Mirrors the validation in ``ev_charging.forms.EVBookingForm`` — same
    past-date and start/end ordering rules — and adds the grid-availability
    check that the template form does not have.
    """

    station_id = serializers.IntegerField(
        help_text="Primary key of the EVChargingStation to reserve at."
    )
    slot_time = serializers.DateTimeField(
        help_text=(
            "Start of the desired bay window, ISO-8601. Must match one of the "
            "`slots` published by `GET /api/ev/stations/<id>/`, and must be in "
            "the future."
        )
    )
    vehicle_number = serializers.CharField(
        max_length=32,
        min_length=2,
        help_text="Registration plate of the vehicle arriving, e.g. `KA05AB1234`.",
    )
    estimated_kwh = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        required=False,
        default=DEFAULT_ESTIMATED_KWH,
        min_value=Decimal("1"),
        max_value=Decimal("500"),
        help_text=(
            "Energy expected, used for the price preview. Defaults to "
            f"{DEFAULT_ESTIMATED_KWH} kWh — enough for roughly 150 km of city "
            "driving, which is the common case."
        ),
    )
    notes = serializers.CharField(
        required=False, allow_blank=True, default="", help_text="Free-text note for the station operator."
    )

    def validate_station_id(self, value):
        try:
            station = EVChargingStation.objects.get(
                pk=value, is_active=True, status=EVChargingStation.Status.AVAILABLE
            )
        except EVChargingStation.DoesNotExist:
            raise serializers.ValidationError(
                "Station not found or not currently accepting reservations."
            )
        self._station = station
        return value

    def validate_slot_time(self, value):
        """
        Snap the requested instant onto the published bay grid.

        The grid is the contract: anything that does not land exactly on a
        published `start` is rejected rather than snapped, because silently
        moving a customer's requested time by up to 30 minutes is the kind of
        thing that only surfaces when they arrive at the bay.
        """
        station = self._station
        if value.tzinfo is None:
            raise serializers.ValidationError("slot_time must be timezone-aware.")
        if value <= timezone.now():
            raise serializers.ValidationError("Slot time must be in the future.")

        local = timezone.localtime(value)
        self._local_slot = local
        for slot in build_slot_grid(station):
            if slot["start"] == local.time().replace(second=0, microsecond=0):
                self._slot = slot
                return value
        raise serializers.ValidationError(
            "slot_time does not match a published bay window. "
            "Fetch the station's `slot_grid.slots` array and pick one of its `start` values."
        )

    def validate(self, attrs):
        station = self._station
        slot = self._slot

        if not slot["is_available"]:
            raise serializers.ValidationError(
                {"slot_time": "That bay is already reserved. Pick another window."}
            )

        # The grid already encodes port pressure, so this only trips when the
        # station drained between the grid being built and the write landing.
        if station.available_ports <= 0:
            raise serializers.ValidationError(
                {"station_id": "Every bay at this station is currently reserved."}
            )

        # `build_slot_grid` only emits windows inside operating hours, but a
        # station can be flipped to 24×7 between the two calls.
        if not station.is_24_hours:
            start = slot["start"]
            if not (station.opens_at <= start < station.closes_at):
                raise serializers.ValidationError(
                    {
                        "slot_time": (
                            f"Station operates from {station.opens_at.strftime('%H:%M')} "
                            f"to {station.closes_at.strftime('%H:%M')}."
                        )
                    }
                )

        attrs["_station"] = station
        attrs["_slot"] = slot
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        station = validated_data["_station"]
        slot = validated_data["_slot"]
        local = self._local_slot
        kwh = validated_data["estimated_kwh"]

        booking = EVChargingBooking.objects.create(
            customer=user,
            customer_name=user.get_full_name() or user.username,
            customer_email=user.email,
            customer_phone=getattr(user, "phone", "") or "",
            station=station,
            vehicle_number=validated_data["vehicle_number"].strip().upper(),
            booking_date=local.date(),
            start_time=slot["start"],
            end_time=slot["end"],
            estimated_kwh=kwh,
            # Authoritative: the rate comes from the station row, never the
            # payload, so a tampered client cannot quote itself a cheaper bay.
            estimated_cost=(kwh * station.price_per_kwh).quantize(Decimal("0.01")),
            status=EVChargingBooking.Status.CONFIRMED,
            notes=validated_data.get("notes", ""),
            confirmed_at=timezone.now(),
        )

        # Reserve the bay by decrementing the station's free-port count. The
        # station is a plain counter, not a `select_for_update` inventory, so
        # this is guarded rather than transactional — F() keeps the decrement
        # atomic at the database level and `available_ports__gt=0` makes the
        # UPDATE itself the guard, which is what stops two concurrent requests
        # from both claiming the last bay.
        held = (
            EVChargingStation.objects.filter(pk=station.pk, available_ports__gt=0)
            .update(available_ports=F("available_ports") - 1)
        )
        if not held:
            # Lost the race for the last bay. The booking row is already
            # written, so it has to be undone rather than left as a phantom
            # reservation against a station that has nothing left.
            booking.delete()
            raise serializers.ValidationError(
                {"station_id": "Every bay at this station was just reserved. Try another station."}
            )

        station.refresh_from_db(fields=["available_ports"])
        return booking
