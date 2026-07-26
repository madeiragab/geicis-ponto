from rest_framework import serializers

from apps.timesheet.models import TimeEntry, WeeklyAlert


class StudentBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    full_name = serializers.CharField(source='user.full_name')


class TimeEntrySerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(read_only=True)
    student_name = serializers.CharField(source='student.user.full_name', read_only=True)
    duration_hours = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True, allow_null=True
    )
    is_open = serializers.BooleanField(read_only=True)
    is_stale = serializers.BooleanField(read_only=True)
    was_adjusted = serializers.BooleanField(read_only=True)
    adjusted_by_name = serializers.CharField(
        source='adjusted_by.full_name', read_only=True, default=None
    )

    class Meta:
        model = TimeEntry
        fields = [
            'id',
            'student_id',
            'student_name',
            'check_in',
            'check_out',
            'duration_hours',
            'notes',
            'is_open',
            'is_stale',
            'was_adjusted',
            'adjusted_by_name',
            'adjustment_reason',
        ]
        read_only_fields = fields


class CheckInSerializer(serializers.Serializer):
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class TimeEntryAdjustSerializer(serializers.Serializer):
    check_in = serializers.DateTimeField(required=False)
    check_out = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)
    adjustment_reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        touches_time = 'check_in' in attrs or 'check_out' in attrs
        if touches_time and not attrs.get('adjustment_reason'):
            raise serializers.ValidationError({
                'adjustment_reason': 'Informe o motivo do ajuste ao alterar entrada ou saída.'
            })

        check_in = attrs.get('check_in') or getattr(self.instance, 'check_in', None)
        check_out = attrs.get('check_out', getattr(self.instance, 'check_out', None))
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError({
                'check_out': 'A saída precisa ser depois da entrada.'
            })
        return attrs


class WeeklyAlertSerializer(serializers.ModelSerializer):
    student = StudentBriefSerializer(read_only=True)
    shortfall_hours = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = WeeklyAlert
        fields = [
            'id',
            'student',
            'week_start',
            'hours_logged',
            'minimum_required',
            'shortfall_hours',
            'sent_at',
            'delivery_status',
            'error_message',
        ]
        read_only_fields = fields
