from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.users.models import ProfessorProfile, StudentProfile, Supervision, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ['full_name']
    list_display = ['full_name', 'email', 'role', 'is_active', 'date_joined']
    list_filter = ['role', 'is_active', 'is_staff']
    search_fields = ['full_name', 'email']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Pessoal', {'fields': ('full_name', 'role')}),
        ('Permissões', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Datas', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'full_name', 'role', 'password1', 'password2'),
        }),
    )


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = [
        'user', 'registration_number', 'internship',
        'required_hours', 'weekly_minimum_hours', 'status',
    ]
    list_filter = ['status', 'internship']
    search_fields = ['user__full_name', 'user__email', 'registration_number']
    autocomplete_fields = ['user', 'internship']


@admin.register(ProfessorProfile)
class ProfessorProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'siape', 'department']
    search_fields = ['user__full_name', 'user__email', 'siape']
    autocomplete_fields = ['user']


@admin.register(Supervision)
class SupervisionAdmin(admin.ModelAdmin):
    list_display = ['professor', 'student', 'role', 'created_at']
    list_filter = ['role']
    search_fields = ['professor__user__full_name', 'student__user__full_name']
    autocomplete_fields = ['professor', 'student']
