"""
URL configuration for services app.
"""
from django.urls import path
from . import views

app_name = "services"

urlpatterns = [
    path("", views.ServiceListView.as_view(), name="list"),
    path("category/<slug:slug>/", views.category_detail, name="category_detail"),
    path("<slug:category_slug>/<slug:slug>/", views.ServiceDetailView.as_view(), name="detail"),
]