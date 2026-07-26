from django.contrib import admin

from apps.timesheet.models import TimeEntry, WeeklyAlert


@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ['student', 'check_in', 'check_out', 'duration_display', 'was_adjusted']
    list_filter = ['check_in', 'student__internship']
    search_fields = ['student__user__full_name', 'student__registration_number', 'notes']
    autocomplete_fields = ['student', 'adjusted_by']
    date_hierarchy = 'check_in'

    @admin.display(description='duração')
    def duration_display(self, obj):
        return 'aberto' if obj.is_open else f'{obj.duration_hours}h'


@admin.register(WeeklyAlert)
class WeeklyAlertAdmin(admin.ModelAdmin):
    list_display = [
        'student', 'week_start', 'hours_logged', 'minimum_required',
        'delivery_status', 'sent_at',
    ]
    list_filter = ['delivery_status', 'week_start']
    search_fields = ['student__user__full_name', 'student__user__email']
    autocomplete_fields = ['student']
    readonly_fields = ['created_at']
