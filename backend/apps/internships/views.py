from django.db.models import Count, ProtectedError, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from config.exceptions import InternshipHasStudents
from apps.internships.models import Internship
from apps.internships.serializers import InternshipMinimalSerializer, InternshipSerializer
from apps.users.permissions import IsCoordinatorOrReadOnly


class InternshipViewSet(viewsets.ModelViewSet):
    serializer_class = InternshipSerializer
    permission_classes = [IsCoordinatorOrReadOnly]

    def get_queryset(self):
        # Annotated under a different name: `student_count` is a property on the
        # model, and Django cannot assign an annotation over a property.
        qs = Internship.objects.annotate(student_count_annotated=Count('students'))
        active = self.request.query_params.get('active')
        if active is not None:
            qs = qs.filter(is_active=active.lower() == 'true')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(organization__icontains=search))
        return qs

    def list(self, request, *args, **kwargs):
        # The registration form needs every option in one select, so the
        # minimal variant skips pagination on purpose.
        if request.query_params.get('minimal') == 'true':
            qs = self.get_queryset()
            return Response(InternshipMinimalSerializer(qs, many=True).data)
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        try:
            instance.delete()
        except ProtectedError:
            raise InternshipHasStudents()

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        from apps.users.serializers import StudentProfileSerializer

        internship = self.get_object()
        students = internship.students.select_related('user', 'internship').with_total_hours()
        return Response(StudentProfileSerializer(students, many=True).data)
