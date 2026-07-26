from django.urls import path

from apps.users.views import (
    GeicisTokenObtainPairView,
    GeicisTokenRefreshView,
    LogoutView,
    MeView,
    RegisterView,
)

urlpatterns = [
    path('token/', GeicisTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', GeicisTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('register/', RegisterView.as_view(), name='register'),
    path('me/', MeView.as_view(), name='me'),
]
