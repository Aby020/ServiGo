"""
Views for accounts app.
"""
from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import HttpResponse
from django.conf import settings
from django.contrib import messages
from django.views.generic import CreateView, UpdateView, DetailView
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.utils.http import url_has_allowed_host_and_scheme
from django.contrib.auth.mixins import LoginRequiredMixin

from .forms import UserRegistrationForm, UserLoginForm, UserProfileForm, StaffProfileForm, CustomerProfileForm
from .models import User, StaffProfile, CustomerProfile


# ── Rate limiting ─────────────────────────────────────────────────────────────
#
# The HTML auth views are outside DRF, so DRF's throttles never see them. These
# two counters cover that gap and follow the same shape as DRF's SimpleRateThrottle
# — a fixed-window count in the default cache, keyed by action and client — so
# there is one rate-limiting idiom in the project rather than two.
#
# Keyed on the client IP because neither endpoint is authenticated at the point
# it is checked, so there is no user identity to key on. The consequence is that
# a corporate NAT or a shared mobile IP throttles everyone behind it together;
# the limits are set high enough that this only bites an actual attack.

def _rate_limit_key(action, request):
    """Cache key for one action from one client."""
    ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    if not ip:
        ip = request.META.get("REMOTE_ADDR", "")
    return f"ratelimit:html-auth:{action}:{ip}"


def _is_rate_limited(action, request, limit, window_seconds):
    """
    True when this client has already used up `limit` attempts in the window.

    The counter starts at zero — ``cache.add`` only succeeds on the first write
    of a key, so the request that opens the window sets the timeout and every
    later request in that window just increments the existing counter. The
    increment then reports this attempt's own number, so the first attempt of a
    window reads 1 and is allowed. Seeding the key with ``1`` instead would make
    the first attempt read 2 and quietly cost a caller one of their attempts.
    ``cache.add`` is atomic on LocMem and Redis alike, which is what stops a
    burst of parallel attempts from each reading "0" and all being let through.
    """
    if not limit:
        return False
    key = _rate_limit_key(action, request)
    cache.add(key, 0, timeout=window_seconds)
    try:
        count = cache.incr(key)
    except ValueError:
        # The key expired between the `add` and the `incr`. The window is over,
        # so this attempt starts a fresh one and is allowed.
        cache.set(key, 1, timeout=window_seconds)
        return False
    # `count` is the attempt happening right now, so `> limit` is what makes
    # `LOGIN_RATE_LIMIT = 10` mean "ten attempts in the window, the eleventh
    # refused". This matches DRF's own SimpleRateThrottle, so the two limiters
    # in the project behave identically and the numbers mean the same thing in
    # both places.
    return count > limit


def _rate_limited_response(request, action, limit, window_seconds, contact_hint):
    """
    429 for an exhausted window, in whatever form the caller asked for.

    An HTML form POST gets a rendered page so the visitor is not dumped on a
    blank screen by the browser's raw error body; anything else gets a bare
    429 with a Retry-After, which is what an XHR or a script expects.
    """
    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        response = HttpResponse(status=429)
    else:
        response = render(
            request,
            "accounts/rate_limited.html",
            {"action": action, "contact_hint": contact_hint},
            status=429,
        )
    response["Retry-After"] = str(window_seconds)
    return response


class RegisterView(CreateView):
    """User registration view."""
    form_class = UserRegistrationForm
    template_name = "accounts/register.html"
    success_url = reverse_lazy("accounts:login")

    def dispatch(self, request, *args, **kwargs):
        # Only submissions are counted. Charging the GET would let anyone lock a
        # shared IP out of signup just by reloading the page.
        if request.method == "POST" and _is_rate_limited(
            "register",
            request,
            getattr(settings, "REGISTER_RATE_LIMIT", 5),
            getattr(settings, "REGISTER_RATE_WINDOW_SECONDS", 3600),
        ):
            return _rate_limited_response(
                request,
                "registration",
                getattr(settings, "REGISTER_RATE_LIMIT", 5),
                getattr(settings, "REGISTER_RATE_WINDOW_SECONDS", 3600),
                "Try again later, or contact support@servigo.com if you need an account today.",
            )
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):
        response = super().form_valid(form)
        messages.success(self.request, "Account created successfully! Please log in.")
        return response

    def form_invalid(self, form):
        messages.error(self.request, "Please correct the errors below.")
        return super().form_invalid(form)


def login_view(request):
    """User login view."""
    if request.user.is_authenticated:
        return redirect("dashboard:customer")

    if request.method == "POST":
        limit = getattr(settings, "LOGIN_RATE_LIMIT", 10)
        window = getattr(settings, "LOGIN_RATE_WINDOW_SECONDS", 300)
        if _is_rate_limited("login", request, limit, window):
            messages.error(
                request,
                "Too many sign-in attempts. Please wait a few minutes and try again.",
            )
            # The window is intentionally *not* reset on a successful login:
            # otherwise guessing eight wrong passwords, then logging in
            # correctly, would hand an attacker a fresh budget.
            return _rate_limited_response(
                request,
                "sign-in",
                limit,
                window,
                "Need help signing in? Contact support@servigo.com.",
            )

        form = UserLoginForm(request, data=request.POST)
        if form.is_valid():
            username = form.cleaned_data.get("username")
            password = form.cleaned_data.get("password")
            user = authenticate(request, username=username, password=password)
            if user is not None:
                login(request, user)
                messages.success(request, f"Welcome back, {user.get_short_name()}!")
                next_url = request.GET.get("next") or request.POST.get("next")
                if next_url and url_has_allowed_host_and_scheme(
                    url=next_url, allowed_hosts={request.get_host()}
                ):
                    return redirect(next_url)
                # Redirect based on role
                if user.is_admin_user:
                    return redirect("admin:index")
                elif user.is_staff_user:
                    return redirect("dashboard:staff")
                else:
                    return redirect("dashboard:customer")
            else:
                messages.error(request, "Invalid email/username or password.")
        else:
            messages.error(request, "Invalid email/username or password.")
    else:
        form = UserLoginForm()

    return render(request, "accounts/login.html", {"form": form})


@login_required
def logout_view(request):
    """User logout view."""
    logout(request)
    messages.info(request, "You have been logged out successfully.")
    return redirect("core:home")


@method_decorator(login_required, name="dispatch")
class ProfileView(LoginRequiredMixin, DetailView):
    """User profile view."""
    model = User
    template_name = "accounts/profile.html"
    context_object_name = "profile_user"

    def get_object(self):
        return self.request.user

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        if user.is_customer:
            context["customer_profile"], _ = CustomerProfile.objects.get_or_create(user=user)
        elif user.is_staff_user:
            context["staff_profile"], _ = StaffProfile.objects.get_or_create(user=user)
        return context


@method_decorator(login_required, name="dispatch")
class ProfileUpdateView(LoginRequiredMixin, UpdateView):
    """User profile update view."""
    model = User
    form_class = UserProfileForm
    template_name = "accounts/profile_edit.html"
    success_url = reverse_lazy("accounts:profile")

    def get_object(self):
        return self.request.user

    def form_valid(self, form):
        messages.success(self.request, "Profile updated successfully!")
        return super().form_valid(form)


@login_required
def staff_profile_update(request):
    """Staff profile update view."""
    if not request.user.is_staff_user:
        messages.error(request, "Access denied.")
        return redirect("dashboard:customer")

    staff_profile, created = StaffProfile.objects.get_or_create(user=request.user)

    if request.method == "POST":
        form = StaffProfileForm(request.POST, instance=staff_profile)
        if form.is_valid():
            form.save()
            messages.success(request, "Staff profile updated successfully!")
            return redirect("dashboard:staff")
    else:
        form = StaffProfileForm(instance=staff_profile)

    return render(request, "accounts/staff_profile_edit.html", {"form": form})


@login_required
def customer_profile_update(request):
    """Customer profile update view."""
    if not request.user.is_customer:
        messages.error(request, "Access denied.")
        return redirect("dashboard:staff")

    customer_profile, created = CustomerProfile.objects.get_or_create(user=request.user)

    if request.method == "POST":
        form = CustomerProfileForm(request.POST, instance=customer_profile)
        if form.is_valid():
            form.save()
            messages.success(request, "Profile updated successfully!")
            return redirect("dashboard:customer")
    else:
        form = CustomerProfileForm(instance=customer_profile)

    return render(request, "accounts/customer_profile_edit.html", {"form": form})