"""
Backfill station coordinates.

The station model has always allowed a null lat/long (so a station can be
listed before anyone has pinned it on a map), but every seeded row shipped with
both columns empty. That left the discovery map with nothing to plot, and the
API correctly reported `"latitude": null` for every station.

This is a data migration rather than a schema change: it fills the columns that
already exist. Coords are keyed by slug so re-running it is harmless, and it
never overwrites a coordinate that an operator has since corrected by hand —
only nulls are filled.
"""
from django.db import migrations

# (slug, latitude, longitude) for the seeded stations. Slugs are stable keys;
# names are not, because operators rename stations.
SEED_COORDINATES = {
    "ecocharge-central": (12.971599, 77.594566),
    "powernode-express": (12.978367, 77.640752),
    "greengrid-mall": (17.385000, 78.486700),
    "volthub-junction": (9.931232, 76.267303),
}


def backfill_coordinates(apps, schema_editor):
    Station = apps.get_model("ev_charging", "EVChargingStation")
    for slug, (latitude, longitude) in SEED_COORDINATES.items():
        Station.objects.filter(
            slug=slug, latitude__isnull=True, longitude__isnull=True
        ).update(latitude=latitude, longitude=longitude)


def clear_coordinates(apps, schema_editor):
    Station = apps.get_model("ev_charging", "EVChargingStation")
    for slug in SEED_COORDINATES:
        Station.objects.filter(slug=slug).update(latitude=None, longitude=None)


class Migration(migrations.Migration):
    dependencies = [
        ("ev_charging", "0002_evchargingbooking_vehicle_number"),
    ]

    operations = [
        migrations.RunPython(backfill_coordinates, clear_coordinates),
    ]
