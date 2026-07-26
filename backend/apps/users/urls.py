from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.users.views import (
    ProfessorViewSet,
    StaffCreateView,
    StudentViewSet,
    SupervisionViewSet,
)

router = DefaultRouter()
router.register('students', StudentViewSet, basename='student')
router.register('professors', ProfessorViewSet, basename='professor')
router.register('supervisions', SupervisionViewSet, basename='supervision')

urlpatterns = [
    path('users/', StaffCreateView.as_view(), name='staff-create'),
    path('', include(router.urls)),
]
