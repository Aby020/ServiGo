from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from .decorators import unauthenticated_user
from django.contrib.auth.decorators import login_required
from django.core.mail import send_mail
from django.conf import settings


@unauthenticated_user
def sign_up(request):
    if request.method == "POST":
        try:
            username = request.POST.get("name")
            email = request.POST.get("email")
            password = request.POST.get("password")
            user_creation = User.objects.create_user(
                username=username, email=email, password=password
            )
            user_creation.save()
            subject = "NanoServ Account Manager"
            message = f"Dear {username},\nYou are successfully created your account with NanoServ.\nPlease keep this email for your records and do not forward or share any other person.\nTo get started, please visit our website at https://127.0.0.1:8000/ and use our services.\nFor more details login with NanoServ."
            recipient = email
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient],
                fail_silently=False,
            )
            success_msg = "User Registered Successfully"
            messages.success(request, success_msg)
            return redirect("sign_in")
        except Exception as e:
            error_msg = "User Registration Failed"
            messages.error(request, error_msg)
            return redirect("sign_up")
    return render(request, "sign_up.html")


@unauthenticated_user
def sign_in(request):
    if request.method == "POST":
        username = request.POST.get("name")
        password = request.POST.get("password")
        user_auth = authenticate(request, username=username, password=password)
        if user_auth is not None:
            login(request, user_auth)
            success_msg = "Sign in successfully"
            messages.success(request, success_msg)
            return redirect("index")
        else:
            error_msg = "Authentication Failed"
            messages.error(request, error_msg)
            return redirect("sign_in")
    return render(request, "sign_in.html")


@login_required(login_url="sign_in")
def sign_out(request):
    logout(request)
    msg = "Sign out successfully"
    messages.success(request, msg)
    return redirect("sign_in")
