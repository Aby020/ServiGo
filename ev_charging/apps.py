# EV Charging app configuration
from django.apps import AppConfig


class EVChargingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "ev_charging"
    verbose_name = "EV Charging"