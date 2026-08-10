"""
Template tags for rendering service/category images.

ServiGo's service cards render each category's image from
``static/images/<category-slug>.jpg``. This filter keeps that convention
for every category while letting an individual category point at a specific
image file instead (see CATEGORY_IMAGE_OVERRIDES below).

Usage in a template:

    {% load service_images %}
    <img src="{% static 'images/' %}{{ service.category|category_image }}" ...>
"""
from django import template

register = template.Library()

# Per-category overrides: category slug -> image filename inside static/images/.
# Categories not listed here fall back to <slug>.jpg (e.g. electrical.jpg).
CATEGORY_IMAGE_OVERRIDES = {
    "smart-tv": "Smart_tv_repair.jpg",
}


@register.filter
def category_image(category):
    """Return the static image filename used for a category's cards/hero."""
    return CATEGORY_IMAGE_OVERRIDES.get(category.slug, f"{category.slug}.jpg")
