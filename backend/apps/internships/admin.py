from django.contrib import admin

from apps.internships.models import Internship


@admin.register(Internship)
class InternshipAdmin(admin.ModelAdmin):
    list_display = ['title', 'organization', 'supervisor_name', 'is_active', 'student_count']
    list_filter = ['is_active', 'organization']
    search_fields = ['title', 'organization', 'supervisor_name']

    @admin.display(description='alunos')
    def student_count(self, obj):
        return obj.students.count()
