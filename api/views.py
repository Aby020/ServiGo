"""
Views for the ServiGo REST API.
"""
from rest_framework import status, filters
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
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
)
from .permissions import IsCustomer, IsOwnerOrStaff
from accounts.models import User
from services.models import Service, ServiceCategory
from bookings.models import Booking, BookingStatusHistory
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
