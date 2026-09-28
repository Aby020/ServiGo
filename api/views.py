"""
Views for the ServiGo REST API.
"""
import decimal

from rest_framework import status, filters
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from django.db.models import F, Q
from django.db.models.functions import Least
from django.utils import timezone
from drf_spectacular.utils import (
    extend_schema,
    extend_schema_view,
    OpenApiParameter,
    OpenApiResponse,
)

from .serializers import (
    AuthSuccessSerializer,
    LoginSerializer,
    RegisterSerializer,
    TokenResponseSerializer,
    UserProfileSerializer,
    ServiceCategorySerializer,
    ServiceSerializer,
    ServiceDetailSerializer,
    BookingSerializer,
    BookingDetailSerializer,
    BookingCreateSerializer,
    StaffBookingSerializer,
    StaffBookingDetailSerializer,
    StaffBookingAssignSerializer,
    StaffBookingStatusSerializer,
    EVBookingCreateSerializer,
    EVBookingSerializer,
    EVStationDetailSerializer,
    EVStationSerializer,
    SLOT_DURATION_MINUTES,
)
from .permissions import IsCustomer, IsOwnerOrStaff, IsStaffUser
from accounts.models import User
from services.models import Service, ServiceCategory
from bookings.models import Booking, BookingStatusHistory
from ev_charging.models import EVChargingBooking, EVChargingStation
from rest_framework_simplejwt.tokens import RefreshToken


@extend_schema_view(
    post=extend_schema(
        summary="Log in",
        description=(
            "Exchanges credentials for a SimpleJWT token pair. `identifier` "
            "accepts either the account's email address or its username; the "
            "lookup is case-insensitive. The pair is sent in the response body "
            "only — never as a query parameter or a cookie — and the access "
            "token must then be presented as `Authorization: Bearer <access>`."
        ),
        request=LoginSerializer,
        responses={
            200: TokenResponseSerializer,
            400: OpenApiResponse(description="Validation error"),
            401: OpenApiResponse(description="Invalid credentials"),
        },
        tags=["Auth"],
    ),
)
class LoginView(APIView):
    """POST /api/auth/login/ — accepts identifier + password, returns JWT pair."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = LoginSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


@extend_schema_view(
    post=extend_schema(
        summary="Register a customer account",
        description=(
            "Public self-service signup. The password is checked against "
            "Django's configured password validators and stored hashed. "
            "The new account is **always** created with `role=\"customer\"`, "
            "`is_staff=false` and `is_superuser=false`; any privilege field "
            "in the request body is ignored. A `CustomerProfile` row is "
            "created alongside the user. On success a token pair is returned, "
            "so the client can establish a session without a second login call."
        ),
        request=RegisterSerializer,
        responses={
            201: AuthSuccessSerializer,
            400: OpenApiResponse(description="Validation error"),
        },
        tags=["Auth"],
    ),
)
class RegisterView(APIView):
    """POST /api/auth/register/ — public signup, returns user + JWT pair."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = RegisterSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        payload = {
            "user": UserProfileSerializer(user).data,
            "tokens": {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
        }
        return Response(payload, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        summary="Retrieve the current user",
        description=(
            "Returns the profile of the caller identified by the bearer token. "
            "Used by the client to resolve the session on page load and to "
            "decide which dashboard to route to."
        ),
        responses={
            200: UserProfileSerializer,
            401: OpenApiResponse(description="Unauthorized"),
        },
        tags=["Auth"],
    ),
)
class MeView(APIView):
    """GET /api/auth/me/ — returns the authenticated user's profile."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)


# ── Services ──────────────────────────────────────────────────────────────────

class ServiceCategoryListView(ListAPIView):
    """GET /api/service-categories/ — public list of active categories."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ServiceCategorySerializer

    def get_queryset(self):
        return ServiceCategory.objects.filter(is_active=True).order_by("display_order", "name")


class ServicePagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 48


class ServiceListView(ListAPIView):
    """
    GET /api/services/ — public paginated list.

    Query params:
      q              full-text search on name + short_description + description
      category       category slug
      featured       true | false
      available_only true | false  (defaults to true)
      order          price_asc | price_desc | newest
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ServiceSerializer
    pagination_class = ServicePagination

    def get_queryset(self):
        qs = Service.objects.select_related("category")

        # available_only defaults to true
        available_only = self.request.query_params.get("available_only", "true")
        if available_only.lower() != "false":
            qs = qs.filter(is_available=True)

        # category filter by slug
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__slug=category)

        # featured filter
        featured = self.request.query_params.get("featured")
        if featured is not None:
            qs = qs.filter(is_featured=(featured.lower() == "true"))

        # search
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(short_description__icontains=q)
                | Q(description__icontains=q)
            )

        # ordering
        order = self.request.query_params.get("order", "")
        if order == "price_asc":
            qs = qs.order_by("price")
        elif order == "price_desc":
            qs = qs.order_by("-price")
        elif order == "newest":
            qs = qs.order_by("-created_at")
        else:
            qs = qs.order_by("category__display_order", "display_order", "name")

        return qs


class ServiceDetailView(RetrieveAPIView):
    """GET /api/services/<id>/ — public single service detail."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = ServiceDetailSerializer

    def get_queryset(self):
        return Service.objects.select_related("category").filter(is_available=True)


# ── Bookings ──────────────────────────────────────────────────────────────────

class BookingPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


@extend_schema_view(
    get=extend_schema(
        summary="List bookings",
        description=(
            "Returns the authenticated customer's own bookings, newest first. "
            "Staff and admin receive all bookings — see the queryset below for "
            "the reasoning."
        ),
        parameters=[
            OpenApiParameter(
                name="page",
                type=int,
                description="Page number (1-based).",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                description="Items per page. Default 10, max 50.",
            ),
        ],
        responses={200: BookingSerializer(many=True)},
        tags=["Bookings"],
    ),
    post=extend_schema(
        summary="Create a booking",
        description=(
            "Creates a service booking for the authenticated customer. "
            "`preferred_date` must not be in the past. Service name and price "
            "are snapshotted from the Service row at creation time, and the "
            "booking starts in the `pending` status with an initial history entry."
        ),
        request=BookingCreateSerializer,
        responses={
            201: BookingDetailSerializer,
            400: OpenApiResponse(description="Validation error"),
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Only customers may create bookings"),
        },
        tags=["Bookings"],
    ),
)
class BookingListCreateView(APIView):
    """
    GET  /api/bookings/ — list bookings for the authenticated user.
    POST /api/bookings/ — create a new booking (customer only).

    List behaviour:
      - CUSTOMER: only their own bookings, newest first.
      - STAFF / ADMIN: all bookings (useful for support dashboards).
        This is intentional — document the decision here rather than
        implementing a separate staff endpoint for now.
    """

    permission_classes = [IsAuthenticated]
    pagination_class = BookingPagination

    def get(self, request):
        user = request.user
        is_staff_or_admin = (
            getattr(user, "is_staff_user", False)
            or getattr(user, "is_admin_user", False)
        )
        if is_staff_or_admin:
            qs = Booking.objects.select_related("customer", "assigned_staff").order_by("-created_at")
        else:
            qs = Booking.objects.filter(customer=user).select_related("assigned_staff").order_by("-created_at")

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        serializer = BookingSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        # Only customers can create bookings
        if not (request.user.role == "customer"):
            return Response(
                {"detail": "Only customers can create bookings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = BookingCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        booking = serializer.save()
        return Response(
            BookingDetailSerializer(booking).data,
            status=status.HTTP_201_CREATED,
        )


class BookingDetailView(APIView):
    """
    GET /api/bookings/<id>/ — retrieve booking with status history.
    Object-level permission: customer sees own bookings; staff/admin see all.
    """

    permission_classes = [IsAuthenticated, IsOwnerOrStaff]

    def get_object(self, pk, user):
        try:
            booking = Booking.objects.prefetch_related("status_history__changed_by").get(pk=pk)
        except Booking.DoesNotExist:
            return None
        self.check_object_permissions(self.request, booking)
        return booking

    @extend_schema(
        summary="Retrieve a booking",
        description=(
            "Returns a single booking including its `status_history` audit "
            "trail, newest entry first. A customer may only read their own "
            "booking; staff and admin may read any."
        ),
        responses={
            200: BookingDetailSerializer,
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Not the owner of this booking"),
            404: OpenApiResponse(description="Booking not found"),
        },
        tags=["Bookings"],
    )
    def get(self, request, pk):
        booking = self.get_object(pk, request.user)
        if booking is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BookingDetailSerializer(booking)
        return Response(serializer.data)


class BookingCancelView(APIView):
    """
    POST /api/bookings/<id>/cancel/ — cancel a booking.
    Only the booking's customer may cancel.
    Only allowed when status is not COMPLETED or CANCELLED (mirrors booking_cancel view).
    Appends a BookingStatusHistory entry with notes="Cancelled by customer".
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Cancel a booking",
        description=(
            "Cancels a booking owned by the authenticated customer. Refused "
            "when the booking is already `completed` or `cancelled` — the same "
            "guard the template view applies. Appends a status-history entry "
            "noted 'Cancelled by customer'."
        ),
        request=None,
        responses={
            200: BookingDetailSerializer,
            400: OpenApiResponse(description="Booking cannot be cancelled"),
            401: OpenApiResponse(description="Not authenticated"),
            404: OpenApiResponse(description="Booking not found or not owned by caller"),
        },
        tags=["Bookings"],
    )
    def post(self, request, pk):
        try:
            booking = Booking.objects.get(pk=pk, customer=request.user)
        except Booking.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status in [Booking.Status.COMPLETED, Booking.Status.CANCELLED]:
            return Response(
                {"detail": "This booking cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = booking.status
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status", "updated_at"])

        BookingStatusHistory.objects.create(
            booking=booking,
            previous_status=old_status,
            new_status=Booking.Status.CANCELLED,
            changed_by=request.user,
            notes="Cancelled by customer",
        )

        serializer = BookingDetailSerializer(
            Booking.objects.prefetch_related("status_history__changed_by").get(pk=pk)
        )
        return Response(serializer.data)


# ── Staff dispatch ────────────────────────────────────────────────────────────

#: `?assigned=` values. `unassigned` and `mine` are the two queue tabs the
#: staff dashboard renders; `all` is the unfiltered backlog.
ASSIGNED_FILTERS = {"unassigned", "mine", "all"}


def _staff_name(user) -> str:
    """Human-readable name for the audit trail, never an empty string."""
    if not user:
        return ""
    return user.get_full_name() or user.username


class StaffBookingListView(APIView):
    """
    GET /api/staff/bookings/ — the dispatch queue.

    Filters:
      - `status`   one or more of the Booking.Status values.
      - `assigned` `unassigned` | `mine` | `all` (default `all`).

    Ordering is by preferred slot, not by creation time. The dispatch desk
    asks "what needs attention next", which is the soonest appointment —
    a queue ordered newest-first buries tomorrow's job under a backlog of
    older ones. `preferred_time` is a TimeField and `preferred_date` a
    DateField, so both are concatenated into a single sortable expression
    rather than compared field-by-field.
    """

    permission_classes = [IsAuthenticated, IsStaffUser]
    pagination_class = BookingPagination

    def get_queryset(self, user):
        qs = Booking.objects.select_related(
            "customer", "assigned_staff"
        ).prefetch_related("status_history__changed_by")

        status_param = self.request.query_params.get("status")
        if status_param:
            wanted = [s for s in status_param.split(",") if s.strip()]
            valid = {c[0] for c in Booking.Status.choices}
            unknown = [s for s in wanted if s not in valid]
            if unknown:
                raise ValidationError(
                    {
                        "status": (
                            f"Unknown status: {', '.join(unknown)}. "
                            f"Choose from: {', '.join(sorted(valid))}."
                        )
                    }
                )
            qs = qs.filter(status__in=wanted)

        assigned = (self.request.query_params.get("assigned") or "all").strip().lower()
        if assigned not in ASSIGNED_FILTERS:
            raise ValidationError(
                {
                    "assigned": (
                        f"Unknown value: {assigned}. "
                        f"Choose from: {', '.join(sorted(ASSIGNED_FILTERS))}."
                    )
                }
            )
        if assigned == "unassigned":
            qs = qs.filter(assigned_staff__isnull=True)
        elif assigned == "mine":
            qs = qs.filter(assigned_staff=user)

        return qs.order_by("preferred_date", "preferred_time", "id")

    @extend_schema(
        summary="List bookings for the dispatch queue",
        description=(
            "Returns bookings a staff member may act on, including the "
            "customer contact snapshot and the current assignee. Filter with "
            "`status` (comma-separated Booking.Status values) and `assigned` "
            "(`unassigned`, `mine`, `all`). Ordered by preferred appointment "
            "so the soonest job is first."
        ),
        parameters=[
            OpenApiParameter(
                "status",
                str,
                description=(
                    "Comma-separated status filter. One or more of: "
                    "pending, confirmed, in_progress, completed, cancelled."
                ),
            ),
            OpenApiParameter(
                "assigned",
                str,
                description=(
                    "Queue filter. `unassigned` = nobody has claimed it, "
                    "`mine` = assigned to the caller, `all` = no filter."
                ),
                enum=sorted(ASSIGNED_FILTERS),
            ),
            OpenApiParameter("page", int, description="Page number."),
            OpenApiParameter("page_size", int, description="Results per page (max 50)."),
        ],
        responses={
            200: StaffBookingSerializer(many=True),
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Caller is not service staff"),
            400: OpenApiResponse(description="Invalid status or assigned filter"),
        },
        tags=["Staff"],
    )
    def get(self, request):
        qs = self.get_queryset(request.user)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        serializer = StaffBookingSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class StaffBookingAssignView(APIView):
    """
    POST /api/staff/bookings/<id>/assign/ — claim a job.

    Always assigns to the caller; there is deliberately no way to assign a
    job to a *different* user through this endpoint. Re-claiming a job that
    is already the caller's is a no-op that returns 200 rather than an error,
    so a double-click on the "Claim" button is harmless.
    """

    permission_classes = [IsAuthenticated, IsStaffUser]

    def get_booking(self, pk):
        try:
            return Booking.objects.prefetch_related(
                "status_history__changed_by"
            ).get(pk=pk)
        except Booking.DoesNotExist:
            return None

    @extend_schema(
        summary="Claim (assign) a booking for the current staff member",
        description=(
            "Assigns the booking to the authenticated caller and appends a "
            "`BookingStatusHistory` entry reading 'Assigned to technician "
            "<name>'. Claiming a job already assigned to the caller is a "
            "no-op. A job that is cancelled or completed cannot be claimed."
        ),
        request=StaffBookingAssignSerializer,
        responses={
            200: StaffBookingDetailSerializer,
            400: OpenApiResponse(description="Booking is cancelled or completed"),
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Caller is not service staff"),
            404: OpenApiResponse(description="Booking not found"),
        },
        tags=["Staff"],
    )
    def post(self, request, pk):
        booking = self.get_booking(pk)
        if booking is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        if booking.status in (Booking.Status.CANCELLED, Booking.Status.COMPLETED):
            return Response(
                {
                    "detail": (
                        f"This booking is {booking.get_status_display().lower()} "
                        "and cannot be assigned."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Idempotent: re-claiming your own job adds no second audit row.
        if booking.assigned_staff_id == request.user.id:
            return Response(StaffBookingDetailSerializer(booking).data)

        booking.assigned_staff = request.user
        booking.save(update_fields=["assigned_staff", "updated_at"])

        BookingStatusHistory.objects.create(
            booking=booking,
            previous_status=booking.status,
            new_status=booking.status,
            changed_by=request.user,
            notes=f"Assigned to technician {_staff_name(request.user)}",
        )

        booking.refresh_from_db()
        return Response(StaffBookingDetailSerializer(booking).data)


class StaffBookingStatusView(APIView):
    """
    POST /api/staff/bookings/<id>/status/ — move a job to a new status.

    The transition rules live in `StaffBookingStatusSerializer` so that they
    are enforced identically whether a change arrives from the dispatch
    dashboard, the admin, or a future mobile client. This view only owns the
    persistence side effects: the `confirmed_at` / `completed_at` stamps and
    the audit row.
    """

    permission_classes = [IsAuthenticated, IsStaffUser]

    def get_booking(self, pk):
        try:
            return Booking.objects.prefetch_related(
                "status_history__changed_by"
            ).get(pk=pk)
        except Booking.DoesNotExist:
            return None

    @extend_schema(
        summary="Update the status of a booking",
        description=(
            "Moves a booking into `status`, optionally recording `notes` that "
            "the customer sees on their booking timeline. Refused when the "
            "booking is already cancelled or completed, when the status is "
            "unchanged, or when the booking is assigned to another "
            "technician. Appends a `BookingStatusHistory` row carrying the "
            "previous status, the new status, the acting user and the notes."
        ),
        request=StaffBookingStatusSerializer,
        responses={
            200: StaffBookingDetailSerializer,
            400: OpenApiResponse(description="Illegal status transition"),
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Caller is not service staff"),
            404: OpenApiResponse(description="Booking not found"),
        },
        tags=["Staff"],
    )
    def post(self, request, pk):
        booking = self.get_booking(pk)
        if booking is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = StaffBookingStatusSerializer(
            data=request.data,
            context={"booking": booking, "actor": request.user},
        )
        serializer.is_valid(raise_exception=True)

        previous_status = booking.status
        new_status = serializer.validated_data["status"]

        booking.status = new_status
        update_fields = ["status", "updated_at"]
        if new_status == Booking.Status.COMPLETED and booking.completed_at is None:
            booking.completed_at = timezone.now()
            update_fields.append("completed_at")
        if new_status == Booking.Status.CONFIRMED and booking.confirmed_at is None:
            booking.confirmed_at = timezone.now()
            update_fields.append("confirmed_at")

        booking.save(update_fields=update_fields)

        notes = (serializer.validated_data.get("notes") or "").strip()
        BookingStatusHistory.objects.create(
            booking=booking,
            previous_status=previous_status,
            new_status=new_status,
            changed_by=request.user,
            notes=notes,
        )

        booking.refresh_from_db()
        return Response(StaffBookingDetailSerializer(booking).data)


# ── EV charging ───────────────────────────────────────────────────────────────

#: Charger considered "DC fast". Mirrors `EVChargingStation.is_fast_charging`,
#: which is also what the `is_fast_charging` filter below compares against —
#: one constant, so the filter and the response field can never disagree.
FAST_CHARGING_MIN_KW = 50


def truthy(value: str | None) -> bool | None:
    """
    Parse a query-string boolean.

    Returns ``None`` when the parameter is absent, so a caller can tell
    "not asked for" from "asked for false" — the difference between
    `?available_only=false` and an omitted `available_only` is whether the
    filter applies at all.
    """
    if value is None:
        return None
    return value.strip().lower() in {"true", "1", "yes", "on"}


@extend_schema_view(
    get=extend_schema(
        summary="List EV charging stations",
        description=(
            "Public catalogue of active charging stations, ordered to put the "
            "ones a driver can actually use right now first: available bays "
            "descending, then rated speed, then name.\n\n"
            "Stations with no coordinates are still returned — the list is a "
            "useful answer on its own — but the map ignores them, so a client "
            "should check `latitude` before placing a pin."
        ),
        parameters=[
            OpenApiParameter(
                name="search",
                type=str,
                description="Free-text match on name, address, city or state.",
            ),
            OpenApiParameter(
                name="connector_type",
                type=str,
                enum=[choice for choice, _ in EVChargingStation.ChargerType.choices],
                description="Restrict to a single connector standard.",
            ),
            OpenApiParameter(
                name="is_fast_charging",
                type=bool,
                description=(
                    f"`true` keeps only chargers rated "
                    f"{FAST_CHARGING_MIN_KW} kW and above. Omit for all speeds."
                ),
            ),
            OpenApiParameter(
                name="available_only",
                type=bool,
                description=(
                    "`true` keeps only stations with at least one free bay. "
                    "Omit to include full and closed stations."
                ),
            ),
            OpenApiParameter(
                name="city",
                type=str,
                description="Exact city match, case-insensitive.",
            ),
            OpenApiParameter(
                name="max_price",
                type=decimal.Decimal,
                description="Upper bound on `price_per_kwh`, inclusive.",
            ),
        ],
        responses={200: EVStationSerializer(many=True)},
        tags=["EV Charging"],
    ),
)
class EVStationListView(ListAPIView):
    """GET /api/ev/stations/ — public, filterable station catalogue."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = EVStationSerializer

    def get_queryset(self):
        qs = EVChargingStation.objects.filter(is_active=True)

        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(address__icontains=search)
                | Q(city__icontains=search)
                | Q(state__icontains=search)
            )

        connector_type = self.request.query_params.get("connector_type")
        if connector_type:
            # A comma-separated list is allowed so the UI's connector chips can
            # pass its whole selection in one call. An unknown value is an
            # empty intersection rather than a 400 — the list is a filter, and
            # "show me nothing" is a fair answer to "show me DC-only"
            # connections this network does not have.
            types = [t.strip() for t in connector_type.split(",") if t.strip()]
            if types:
                qs = qs.filter(charger_type__in=types)

        if truthy(self.request.query_params.get("is_fast_charging")):
            qs = qs.filter(charging_speed_kw__gte=FAST_CHARGING_MIN_KW)

        if truthy(self.request.query_params.get("available_only")):
            qs = qs.filter(available_ports__gt=0).exclude(
                status__in=(
                    EVChargingStation.Status.MAINTENANCE,
                    EVChargingStation.Status.OFFLINE,
                )
            )

        city = self.request.query_params.get("city", "").strip()
        if city:
            qs = qs.filter(city__iexact=city)

        max_price = self.request.query_params.get("max_price")
        if max_price:
            try:
                qs = qs.filter(price_per_kwh__lte=decimal.Decimal(max_price))
            except decimal.InvalidOperation:
                raise ValidationError({"max_price": "Must be a decimal number."})

        # `status` is only the coarse state; `available_ports` is the live one.
        # Ordering by the bay count first is what makes "near me, right now"
        # the default view rather than "here are four stations, three full".
        return qs.order_by("-available_ports", "-charging_speed_kw", "name")


@extend_schema_view(
    get=extend_schema(
        summary="Retrieve an EV charging station",
        description=(
            "Full station profile plus the bay grid for the next "
            f"{SLOT_DURATION_MINUTES * 2} hours: every window the station will "
            "accept a reservation for, each carrying how many bays are still "
            "free at that time. A client must pick a `start` from this array "
            "and pass it back verbatim as `slot_time` when booking."
        ),
        responses={
            200: EVStationDetailSerializer,
            404: OpenApiResponse(description="Station not found or inactive"),
        },
        tags=["EV Charging"],
    ),
)
class EVStationDetailView(RetrieveAPIView):
    """GET /api/ev/stations/<id>/ — public station profile + bay grid."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = EVStationDetailSerializer
    lookup_field = "pk"
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        return EVChargingStation.objects.filter(is_active=True)


class EVBookingPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


@extend_schema_view(
    get=extend_schema(
        summary="List EV charging bookings",
        description=(
            "Reservations for the caller. A customer sees only their own; "
            "staff and admin see every reservation across the network, which "
            "is what a support or operations view needs.\n\n"
            "Results are newest first and include the full station, so a "
            "client can render a reservation without a second round-trip."
        ),
        parameters=[
            OpenApiParameter(
                name="status",
                type=str,
                enum=[status for status, _ in EVChargingBooking.Status.choices],
                description="Restrict to a single booking status.",
            ),
            OpenApiParameter(name="page", type=int, description="Page number (1-based)."),
            OpenApiParameter(
                name="page_size",
                type=int,
                description="Items per page. Default 10, max 50.",
            ),
        ],
        responses={200: EVBookingSerializer(many=True)},
        tags=["EV Charging"],
    ),
    post=extend_schema(
        summary="Reserve a charging bay",
        description=(
            "Books one bay for one window at a station.\n\n"
            "The payload is deliberately minimal — `station_id`, `slot_time` "
            "and `vehicle_number` — because everything else is the server's "
            "to derive:\n\n"
            "  * `slot_time` must match a `start` published by the station's "
            "`slots` array and must be in the future. It cannot be snapped to "
            "the nearest window, so a caller never silently gets a bay half "
            "an hour from the one they asked for.\n"
            "  * `booking_date` comes from `slot_time`, and `end_time` is the "
            "next window in the grid — an overlapping or out-of-hours "
            "reservation is therefore not expressible.\n"
            "  * `estimated_cost` is `estimated_kwh × station.price_per_kwh`, "
            "always taken from the station row and never from the request.\n\n"
            "Booking holds a bay by decrementing the station's free-port "
            "counter. If a concurrent request claims the last bay first, this "
            "call fails with a 400 and creates nothing."
        ),
        request=EVBookingCreateSerializer,
        responses={
            201: EVBookingSerializer,
            400: OpenApiResponse(
                description="Validation error — unknown station, expired or "
                "unpublished slot, or no bay left at that time."
            ),
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(
                description="Only customers may reserve a bay"
            ),
        },
        tags=["EV Charging"],
    ),
)
class EVBookingListCreateView(APIView):
    """
    GET  /api/ev/bookings/ — reservations visible to the caller.
    POST /api/ev/bookings/ — reserve a bay (customer only).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = EVBookingPagination

    def get(self, request):
        user = request.user
        is_staff_or_admin = (
            getattr(user, "is_staff_user", False)
            or getattr(user, "is_admin_user", False)
        )
        qs = EVChargingBooking.objects.select_related("station")
        if not is_staff_or_admin:
            qs = qs.filter(customer=user)

        status = request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)

        qs = qs.order_by("-created_at")

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        serializer = EVBookingSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @extend_schema(
        summary="Reserve a charging bay",
        description=(
            "Customer-only. See the endpoint-level description for the full "
            "contract: `slot_time` must match a published bay window, and the "
            "quoted cost is always derived from the station's own rate."
        ),
        request=EVBookingCreateSerializer,
        responses={
            201: EVBookingSerializer,
            400: OpenApiResponse(description="Validation error"),
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Only customers may reserve a bay"),
        },
        tags=["EV Charging"],
    )
    def post(self, request):
        if request.user.role != "customer":
            return Response(
                {"detail": "Only customers can reserve a charging bay."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = EVBookingCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        booking = serializer.save()
        return Response(
            EVBookingSerializer(booking).data, status=status.HTTP_201_CREATED
        )


@extend_schema_view(
    get=extend_schema(
        summary="Retrieve a charging reservation",
        description=(
            "A single reservation including its station. A customer may only "
            "read their own; staff and admin may read any."
        ),
        responses={
            200: EVBookingSerializer,
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Not the owner of this booking"),
            404: OpenApiResponse(description="Booking not found"),
        },
        tags=["EV Charging"],
    ),
)
class EVBookingDetailView(APIView):
    """GET /api/ev/bookings/<id>/ — owner-only reservation detail."""

    permission_classes = [IsAuthenticated, IsOwnerOrStaff]

    @extend_schema(
        summary="Retrieve a charging reservation",
        description=(
            "Returns one reservation. A customer may only read their own "
            "booking; staff and admin may read any."
        ),
        responses={
            200: EVBookingSerializer,
            401: OpenApiResponse(description="Not authenticated"),
            403: OpenApiResponse(description="Not the owner of this booking"),
            404: OpenApiResponse(description="Booking not found"),
        },
        tags=["EV Charging"],
    )
    def get(self, request, pk):
        try:
            booking = EVChargingBooking.objects.select_related("station").get(pk=pk)
        except EVChargingBooking.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(request, booking)
        return Response(EVBookingSerializer(booking).data)


@extend_schema_view(
    post=extend_schema(
        summary="Cancel a charging reservation",
        description=(
            "Cancels a reservation held by the authenticated customer and "
            "returns the bay to the station's free-port count, so the window "
            "reopens for someone else immediately.\n\n"
            "Refused once the charging session has actually started — at that "
            "point the car is on the bay and releasing the reservation would "
            "let a second driver book hardware that is in use. `completed` and "
            "`cancelled` are terminal and equally refused."
        ),
        request=None,
        responses={
            200: EVBookingSerializer,
            400: OpenApiResponse(description="Reservation cannot be cancelled"),
            401: OpenApiResponse(description="Not authenticated"),
            404: OpenApiResponse(
                description="Booking not found or not owned by caller"
            ),
        },
        tags=["EV Charging"],
    ),
)
class EVBookingCancelView(APIView):
    """
    POST /api/ev/bookings/<id>/cancel/ — release a held bay.

    Only the reservation's own customer may cancel it, and only while it is
    still cancellable. Cancelling gives the bay back: the station's
    ``available_ports`` is incremented so the same window becomes bookable
    again rather than staying dark until someone reloads the page.
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Cancel a charging reservation",
        description=(
            "Cancels a reservation held by the authenticated customer and "
            "returns the bay to the station's free-port count. Refused once "
            "the session is `active`, or when the reservation is already "
            "`completed` or `cancelled`."
        ),
        request=None,
        responses={
            200: EVBookingSerializer,
            400: OpenApiResponse(description="Reservation cannot be cancelled"),
            401: OpenApiResponse(description="Not authenticated"),
            404: OpenApiResponse(
                description="Booking not found or not owned by caller"
            ),
        },
        tags=["EV Charging"],
    )
    def post(self, request, pk):
        try:
            booking = EVChargingBooking.objects.select_related("station").get(
                pk=pk, customer=request.user
            )
        except EVChargingBooking.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        cancellable = (
            EVChargingBooking.Status.PENDING,
            EVChargingBooking.Status.CONFIRMED,
        )
        if booking.status not in cancellable:
            return Response(
                {"detail": "This reservation cannot be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking.status = EVChargingBooking.Status.CANCELLED
        booking.save(update_fields=["status", "updated_at"])

        # Return the bay. F() keeps the increment atomic; clamping at
        # `total_ports` guards against a double-cancel inflating the count
        # past the station's real capacity.
        EVChargingStation.objects.filter(pk=booking.station_id).update(
            available_ports=Least(
                F("available_ports") + 1, F("total_ports")
            )
        )

        booking.refresh_from_db()
        return Response(EVBookingSerializer(booking).data)
