from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('config.auth')),
    path('api/', include('apps.users.urls')),
    path('api/', include('apps.internships.urls')),
    path('api/', include('apps.timesheet.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    # A API não serve páginas, então a raiz dava 404 para quem abria :8000
    # esperando o sistema. Em desenvolvimento, manda para o Vite.
    urlpatterns += [
        path('', RedirectView.as_view(url=settings.FRONTEND_URL, permanent=False)),
    ]
