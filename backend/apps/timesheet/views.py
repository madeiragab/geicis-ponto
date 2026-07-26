from django.db.models import Count, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from config.exceptions import APIError
from apps.timesheet.models import TimeEntry, WeeklyAlert
from apps.timesheet.serializers import (
    CheckInSerializer,
    TimeEntryAdjustSerializer,
    TimeEntrySerializer,
    WeeklyAlertSerializer,
)
from apps.timesheet.services import adjust_entry, build_ranking, clock_in, clock_out
from apps.timesheet.weeks import current_week_start, week_bounds
from apps.users.models import StudentProfile
from apps.users.permissions import IsCoordinator, IsStudent, can_adjust_entry
from apps.users.serializers import StudentProfileSerializer


def _summary_for(student):
    from apps.timesheet.services import ranking_position

    return {
        'total_hours': student.total_hours,
        'current_week_hours': student.current_week_hours,
        'completion_percentage': student.completion_percentage,
        'remaining_hours': student.remaining_hours,
        'ranking_position': ranking_position(student),
    }


class TimeEntryViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = TimeEntrySerializer

    def get_queryset(self):
        user = self.request.user
        qs = TimeEntry.objects.select_related(
            'student__user', 'student__internship', 'adjusted_by'
        )

        # Scoped by role: a student sees only their own, a professor sees their
        # supervised students', a coordinator sees everything.
        if user.is_coordinator:
            pass
        elif user.is_professor and hasattr(user, 'professor_profile'):
            qs = qs.filter(student__supervisions__professor=user.professor_profile).distinct()
        elif user.is_student and hasattr(user, 'student_profile'):
            qs = qs.filter(student=user.student_profile)
        else:
            return qs.none()

        params = self.request.query_params
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        if params.get('from'):
            qs = qs.filter(check_in__date__gte=params['from'])
        if params.get('to'):
            qs = qs.filter(check_in__date__lte=params['to'])
        if params.get('week'):
            from datetime import datetime

            try:
                any_day = datetime.strptime(params['week'], '%Y-%m-%d').date()
            except ValueError:
                raise APIError('Semana inválida. Use YYYY-MM-DD.', code='VALIDATION_ERROR')
            from apps.timesheet.weeks import week_start_for

            start, end = week_bounds(week_start_for(any_day))
            qs = qs.filter(check_in__gte=start, check_in__lt=end)
        if params.get('open') == 'true':
            qs = qs.filter(check_out__isnull=True)
        return qs

    def get_permissions(self):
        if self.action == 'destroy':
            return [IsCoordinator()]
        return super().get_permissions()

    @action(detail=False, methods=['post'], permission_classes=[IsStudent],
            url_path='check-in')
    def check_in(self, request):
        serializer = CheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = clock_in(request.user.student_profile, serializer.validated_data['notes'])
        return Response(TimeEntrySerializer(entry).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], permission_classes=[IsStudent],
            url_path='check-out')
    def check_out(self, request):
        student = request.user.student_profile
        entry = clock_out(student)
        # The updated summary rides along so the clock-out screen refreshes its
        # counters and progress bar without a second round trip.
        return Response({
            'entry': TimeEntrySerializer(entry).data,
            'summary': _summary_for(student),
        })

    @action(detail=False, methods=['get'], permission_classes=[IsStudent])
    def current(self, request):
        entry = request.user.student_profile.open_entry
        return Response({
            'open_entry': TimeEntrySerializer(entry).data if entry else None
        })

    def partial_update(self, request, pk=None):
        entry = self.get_object()
        serializer = TimeEntryAdjustSerializer(data=request.data, instance=entry, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        touches_time = 'check_in' in data or 'check_out' in data
        user = request.user

        if touches_time:
            if not can_adjust_entry(user, entry):
                raise APIError(
                    'Só um professor responsável ou a coordenação pode ajustar horários.',
                    code='PERMISSION_DENIED',
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            adjust_entry(
                entry,
                actor=user,
                check_in=data.get('check_in'),
                check_out=data.get('check_out'),
                reason=data['adjustment_reason'],
            )
        elif 'notes' in data:
            # A student may edit notes on their own entry, and nothing else.
            owns_it = (
                user.is_student
                and hasattr(user, 'student_profile')
                and entry.student_id == user.student_profile.pk
            )
            if not (owns_it or can_adjust_entry(user, entry)):
                raise APIError(
                    'Você não pode editar esse registro.',
                    code='PERMISSION_DENIED',
                    status_code=status.HTTP_403_FORBIDDEN,
                )
            entry.notes = data['notes']
            entry.save(update_fields=['notes', 'updated_at'])

        entry.refresh_from_db()
        return Response(TimeEntrySerializer(entry).data)

    # PUT is not part of the contract; only PATCH adjusts an entry.
    def update(self, request, *args, **kwargs):
        raise APIError(
            'Use PATCH para ajustar um registro.',
            code='METHOD_NOT_ALLOWED',
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class RankingView(APIView):
    def get(self, request):
        params = request.query_params
        limit = params.get('limit')
        results = build_ranking(
            internship=params.get('internship'),
            professor=params.get('professor'),
            status=params.get('status'),
            limit=int(limit) if limit and limit.isdigit() else None,
        )
        from django.utils import timezone

        return Response({'generated_at': timezone.now(), 'results': results})


class DashboardView(APIView):
    permission_classes = [IsCoordinator]

    def get(self, request):
        monday = current_week_start()
        start, end = week_bounds(monday)

        students = StudentProfile.objects.select_related('user').with_week_hours(start, end)
        by_status = dict(
            StudentProfile.objects.values_list('status')
            .annotate(n=Count('id'))
            .values_list('status', 'n')
        )

        clocked_in = TimeEntry.objects.filter(check_out__isnull=True).select_related(
            'student__user'
        )
        below = [
            {
                'student_id': s.id,
                'full_name': s.user.full_name,
                'hours': s.current_week_hours,
                'minimum': s.weekly_minimum_hours,
            }
            for s in students
            if s.status == StudentProfile.Status.ACTIVE
            and s.current_week_hours < s.weekly_minimum_hours
        ]

        ranking = build_ranking(limit=5)
        total = sum((row['total_hours'] for row in build_ranking()), start=0)

        return Response({
            'students_by_status': by_status,
            'total_hours_logged': total,
            'clocked_in_now': [
                {
                    'student_id': e.student_id,
                    'full_name': e.student.user.full_name,
                    'since': e.check_in,
                    'is_stale': e.is_stale,
                }
                for e in clocked_in
            ],
            'below_weekly_minimum': below,
            'top_five': ranking,
            'week_start': monday,
        })


class WeeklyAlertViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Read-only over HTTP.

    Alerts are created only by the scheduled command, so the API cannot be
    turned into a mailing tool.
    """

    serializer_class = WeeklyAlertSerializer

    def get_queryset(self):
        user = self.request.user
        qs = WeeklyAlert.objects.select_related('student__user')

        if user.is_coordinator:
            pass
        elif user.is_professor and hasattr(user, 'professor_profile'):
            qs = qs.filter(student__supervisions__professor=user.professor_profile).distinct()
        elif user.is_student and hasattr(user, 'student_profile'):
            qs = qs.filter(student=user.student_profile)
        else:
            return qs.none()

        params = self.request.query_params
        if params.get('student'):
            qs = qs.filter(student_id=params['student'])
        if params.get('week_start'):
            qs = qs.filter(week_start=params['week_start'])
        if params.get('delivery_status'):
            qs = qs.filter(delivery_status=params['delivery_status'])
        return qs
