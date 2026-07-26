from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.users.models import StudentProfile, hours
from apps.timesheet.weeks import week_start_for


class TimeEntry(models.Model):
    """One clock-in/clock-out pair.

    An entry is open while `check_out` is null. That representation — rather
    than a status column — is what allows the partial unique index below, which
    makes "at most one open entry per student" a database guarantee. Clock-in is
    exactly the kind of button that gets double-tapped on a slow connection.
    """

    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name='time_entries'
    )
    check_in = models.DateTimeField('entrada')
    check_out = models.DateTimeField('saída', null=True, blank=True)
    notes = models.CharField('observações', max_length=255, blank=True)
    adjusted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='adjusted_entries',
        verbose_name='ajustado por',
    )
    adjustment_reason = models.CharField('motivo do ajuste', max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'registro de ponto'
        verbose_name_plural = 'registros de ponto'
        ordering = ['-check_in']
        indexes = [
            models.Index(fields=['student', 'check_in'], name='timeentry_student_checkin'),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(check_out__isnull=True)
                | models.Q(check_out__gt=models.F('check_in')),
                name='timeentry_checkout_after_checkin',
            ),
            # The real guarantee against a double-tapped clock-in.
            models.UniqueConstraint(
                fields=['student'],
                condition=models.Q(check_out__isnull=True),
                name='timeentry_single_open_per_student',
            ),
        ]

    def __str__(self):
        state = 'aberto' if self.is_open else f'{self.duration_hours}h'
        return f'{self.student.user.full_name} — {self.check_in:%d/%m %H:%M} ({state})'

    @property
    def is_open(self):
        return self.check_out is None

    @property
    def duration(self):
        if self.is_open:
            return None
        return self.check_out - self.check_in

    @property
    def duration_hours(self):
        return None if self.is_open else hours(self.duration)

    @property
    def week_start(self):
        return week_start_for(self.check_in)

    @property
    def is_stale(self):
        """Open for longer than the configured ceiling. A flag, not a state."""
        if not self.is_open:
            return False
        limit = timedelta(hours=getattr(settings, 'STALE_ENTRY_HOURS', 16))
        return timezone.now() - self.check_in > limit

    @property
    def was_adjusted(self):
        return self.adjusted_by_id is not None

    def close(self, at=None):
        self.check_out = at or timezone.now()
        self.save(update_fields=['check_out', 'updated_at'])
        return self

    def clean(self):
        if self.check_out and self.check_out <= self.check_in:
            raise ValidationError({'check_out': 'A saída precisa ser depois da entrada.'})
        if self.check_in and self.check_in > timezone.now() + timedelta(minutes=1):
            raise ValidationError({'check_in': 'Não é possível bater ponto no futuro.'})


class WeeklyAlert(models.Model):
    """The audit trail of Friday warnings.

    `unique(student, week_start)` is what makes the weekly command idempotent:
    the row is claimed *before* the e-mail is sent, so a crash mid-run leaves a
    visible row rather than a duplicate in someone's inbox.
    """

    class DeliveryStatus(models.TextChoices):
        SENT = 'SENT', 'Enviado'
        FAILED = 'FAILED', 'Falhou'

    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name='weekly_alerts'
    )
    week_start = models.DateField('segunda-feira da semana')
    hours_logged = models.DecimalField('horas na semana', max_digits=6, decimal_places=2)
    # Copied in rather than read back from the profile: the coordinator may
    # change a student's weekly minimum later, and the historical record should
    # still say what was actually demanded that week.
    minimum_required = models.DecimalField('mínimo exigido', max_digits=6, decimal_places=2)
    sent_at = models.DateTimeField('enviado em', null=True, blank=True)
    delivery_status = models.CharField(
        max_length=16, choices=DeliveryStatus.choices, default=DeliveryStatus.SENT
    )
    error_message = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'alerta semanal'
        verbose_name_plural = 'alertas semanais'
        ordering = ['-week_start', 'student__user__full_name']
        constraints = [
            models.UniqueConstraint(
                fields=['student', 'week_start'], name='weeklyalert_unique_student_week'
            ),
        ]

    def __str__(self):
        return f'{self.student.user.full_name} — semana de {self.week_start:%d/%m/%Y}'

    @property
    def shortfall_hours(self):
        return max(0, self.minimum_required - self.hours_logged)
