"""
Views for accounts app.
"""
from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.views.generic import CreateView, UpdateView, DetailView
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.utils.http import url_has_allowed_host_and_scheme
from django.contrib.auth.mixins import LoginRequiredMixin

from .forms import UserRegistrationForm, UserLoginForm, UserProfileForm, StaffProfileForm, CustomerProfileForm
from .models import User, StaffProfile, CustomerProfile


class RegisterView(CreateView):
    """User registration view."""
    form_class = UserRegistrationForm
    template_name = "accounts/register.html"
    success_url = reverse_lazy("accounts:login")

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