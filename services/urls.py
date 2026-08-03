from django.urls import path
from . import views

urlpatterns = [
    path('service/', views.service, name='service'),
    path('elec_serv_booking/<int:pk>', views.electric_service_booking, name='electric_service_booking'),
    path('electrical_service_booking/', views.electrical_service_booking, name='electrical_service_booking'),
    path('plum_service_booking/<int:pk>', views.plum_service_booking, name='plum_service_booking'),
    path('plumbing_service_booking/', views.plumbing_service_booking, name='plumbing_service_booking'),
    path('tv_service_booking/<int:pk>', views.tv_service_booking, name='tv_service_booking'),
    path('SmartTv_service_booking/', views.SmartTv_service_booking, name='SmartTv_service_booking'),
    path('Book_charging_station/<int:pk>', views.Book_charging_station, name='Book_charging_station'),
    path('Booking_charging_station/', views.Booking_charging_station, name='Booking_charging_station'),
    path('success_booking/', views.success_booking, name='success_booking'),
]
