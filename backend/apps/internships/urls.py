from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.internships.views import InternshipViewSet

router = DefaultRouter()
router.register('internships', InternshipViewSet, basename='internship')

urlpatterns = [path('', include(router.urls))]
