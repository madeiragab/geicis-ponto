from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('config.auth')),
    path('api/', include('apps.users.urls')),
    path('api/', include('apps.internships.urls')),
    path('api/', include('apps.timesheet.urls')),
]
