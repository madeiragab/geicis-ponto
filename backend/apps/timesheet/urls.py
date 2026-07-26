from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.timesheet.views import (
    DashboardView,
    RankingView,
    TimeEntryViewSet,
    WeeklyAlertViewSet,
)

router = DefaultRouter()
router.register('time-entries', TimeEntryViewSet, basename='timeentry')
router.register('weekly-alerts', WeeklyAlertViewSet, basename='weeklyalert')

urlpatterns = [
    path('ranking/', RankingView.as_view(), name='ranking'),
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('', include(router.urls)),
]
