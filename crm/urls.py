from django.urls import path
from . views  import *

urlpatterns = [
    path('', index, name='crm_index'),
    path('crm_templates/electrical_dashboard', electrical_dashboard, name='electrical_dashboard'),
    path('crm_templates/plumbing_dashboard', plumbing_dashboard, name='plumbing_dashboard'),
    path('crm_templates/smart_tv_dashboard', smart_tv_dashboard, name='smart_tv_dashboard'),
    path('crm_templates/charging_station_dashboard', charging_station_dashboard, name='charging_station_dashboard'),
    path('crm_templates/customer_feedback', customer_feedback, name='customer_feedback'),
    path('crm_templates/searching', customer_searching, name='customer_searching'),
]
