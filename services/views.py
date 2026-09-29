"""
Views for services app.
"""
from django.shortcuts import render, get_object_or_404
from django.db.models import Q
from django.views.generic import ListView, DetailView

from .models import ServiceCategory, Service


class ServiceListView(ListView):
    """List all services with search and filtering."""
    model = Service
    template_name = "services/list.html"
    context_object_name = "services"
    paginate_by = 12

    def get_queryset(self):
        queryset = Service.objects.filter(is_available=True).select_related("category")

        # Search
        query = self.request.GET.get("q")
        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(short_description__icontains=query) |
                Q(description__icontains=query) |
                Q(category__name__icontains=query)
            )

        # Category filter
        category_slug = self.request.GET.get("category")
        if category_slug:
            queryset = queryset.filter(category__slug=category_slug)

        # Featured filter
        if self.request.GET.get("featured") == "1":
            queryset = queryset.filter(is_featured=True)

        return queryset

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["categories"] = ServiceCategory.objects.filter(is_active=True)
        context["current_category"] = self.request.GET.get("category", "")
        context["search_query"] = self.request.GET.get("q", "")
        context["show_featured"] = self.request.GET.get("featured") == "1"
        return context


class ServiceDetailView(DetailView):
    """Service detail view."""
    model = Service
    template_name = "services/detail.html"
    context_object_name = "service"
    slug_url_kwarg = "slug"

    def get_queryset(self):
        return Service.objects.filter(is_available=True).select_related("category")

    def get_object(self, queryset=None):
        if queryset is None:
            queryset = self.get_queryset()
        category_slug = self.kwargs.get("category_slug")
        slug = self.kwargs.get("slug")
        return get_object_or_404(queryset, category__slug=category_slug, slug=slug)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        service = self.object
        # Related services from same category
        context["related_services"] = Service.objects.filter(
            category=service.category,
            is_available=True
        ).exclude(pk=service.pk)[:4]
        return context


def category_detail(request, slug):
    """View for a specific service category."""
    category = get_object_or_404(ServiceCategory, slug=slug, is_active=True)
    services = Service.objects.filter(category=category, is_available=True)
    categories = ServiceCategory.objects.filter(is_active=True)

    context = {
        "category": category,
        "services": services,
        "categories": categories,
    }
    return render(request, "services/category_detail.html", context)