from decimal import ROUND_HALF_UP, Decimal

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.users.managers import UserManager
from apps.users.querysets import StudentQuerySet


def hours(duration):
    """A timedelta as decimal hours, rounded to two places."""
    if duration is None:
        return Decimal('0.00')
    total = Decimal(duration.total_seconds()) / Decimal(3600)
    return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Aluno'
        PROFESSOR = 'PROFESSOR', 'Professor'
        COORDINATOR = 'COORDINATOR', 'Coordenador'

    email = models.EmailField('e-mail', unique=True)
    full_name = models.CharField('nome completo', max_length=150)
    role = models.CharField('papel', max_length=16, choices=Role.choices, default=Role.STUDENT)
    avatar = models.ImageField('foto', upload_to='avatars/', null=True, blank=True)
    is_active = models.BooleanField('ativo', default=True)
    is_staff = models.BooleanField('acesso ao admin', default=False)
    date_joined = models.DateTimeField('cadastrado em', default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        verbose_name = 'usuário'
        verbose_name_plural = 'usuários'
        ordering = ['full_name']

    def __str__(self):
        return f'{self.full_name} <{self.email}>'

    def avatar_url(self, request=None):
        """The uploaded photo, or the shared default — never neither.

        Every user gets a picture in the ranking chart whether or not they ever
        set one, so the frontend never has to special-case a missing avatar.
        """
        from django.conf import settings
        from django.templatetags.static import static

        url = self.avatar.url if self.avatar else static('img/default-avatar.svg')
        return request.build_absolute_uri(url) if request else url

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_professor(self):
        return self.role == self.Role.PROFESSOR

    @property
    def is_coordinator(self):
        return self.role == self.Role.COORDINATOR


class ProfessorProfile(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name='professor_profile'
    )
    siape = models.CharField('SIAPE', max_length=32, unique=True, null=True, blank=True)
    department = models.CharField('departamento', max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'professor'
        verbose_name_plural = 'professores'
        ordering = ['user__full_name']

    def __str__(self):
        return self.user.full_name

    def supervises(self, student_profile):
        return self.supervisions.filter(student=student_profile).exists()


class StudentProfile(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Ativo'
        COMPLETED = 'COMPLETED', 'Concluído'
        SUSPENDED = 'SUSPENDED', 'Suspenso'
        WITHDRAWN = 'WITHDRAWN', 'Desligado'

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='student_profile')
    registration_number = models.CharField('matrícula', max_length=32, unique=True)
    # PROTECT: deleting a placement that still has students would orphan real
    # hour records. Move the students first, or deactivate the internship.
    internship = models.ForeignKey(
        'internships.Internship',
        on_delete=models.PROTECT,
        related_name='students',
        null=True,
        blank=True,
        verbose_name='estágio',
    )
    required_hours = models.PositiveIntegerField('carga horária total')
    weekly_minimum_hours = models.PositiveIntegerField('mínimo semanal')
    started_at = models.DateField('início')
    expected_end_at = models.DateField('término previsto', null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = StudentQuerySet.as_manager()

    class Meta:
        verbose_name = 'aluno'
        verbose_name_plural = 'alunos'
        ordering = ['user__full_name']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(required_hours__gt=0),
                name='student_required_hours_positive',
            ),
            models.CheckConstraint(
                condition=models.Q(weekly_minimum_hours__gt=0),
                name='student_weekly_minimum_positive',
            ),
            models.CheckConstraint(
                condition=models.Q(weekly_minimum_hours__lte=models.F('required_hours')),
                name='student_weekly_minimum_within_total',
            ),
            models.CheckConstraint(
                condition=models.Q(expected_end_at__isnull=True)
                | models.Q(expected_end_at__gte=models.F('started_at')),
                name='student_period_not_inverted',
            ),
        ]

    def __str__(self):
        return f'{self.user.full_name} ({self.registration_number})'

    # -- derived values -------------------------------------------------
    # Never stored. A stored duration is a second source of truth, and the
    # first timestamp correction leaves it stale.

    @property
    def total_hours(self):
        cached = getattr(self, 'total_duration', None)
        if cached is not None:
            return hours(cached)
        return hours(
            StudentProfile.objects.filter(pk=self.pk)
            .with_total_hours()
            .values_list('total_duration', flat=True)
            .first()
        )

    @property
    def remaining_hours(self):
        return max(Decimal('0.00'), Decimal(self.required_hours) - self.total_hours)

    @property
    def completion_percentage(self):
        if not self.required_hours:
            return Decimal('0.00')
        pct = self.total_hours / Decimal(self.required_hours) * Decimal(100)
        return min(Decimal('100.00'), pct.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

    def hours_in_week(self, week_start_date):
        from apps.timesheet.weeks import week_bounds

        start_dt, end_dt = week_bounds(week_start_date)
        row = (
            StudentProfile.objects.filter(pk=self.pk)
            .with_week_hours(start_dt, end_dt)
            .values_list('week_duration', flat=True)
            .first()
        )
        return hours(row)

    @property
    def current_week_hours(self):
        from apps.timesheet.weeks import current_week_start

        cached = getattr(self, 'week_duration', None)
        if cached is not None:
            return hours(cached)
        return self.hours_in_week(current_week_start())

    @property
    def open_entry(self):
        return self.time_entries.filter(check_out__isnull=True).first()

    def met_weekly_target(self, week_start_date=None):
        from apps.timesheet.weeks import current_week_start

        week_start_date = week_start_date or current_week_start()
        return self.hours_in_week(week_start_date) >= Decimal(self.weekly_minimum_hours)

    @property
    def can_clock_in(self):
        return self.status == self.Status.ACTIVE and self.user.is_active


class Supervision(models.Model):
    """The professor <-> student many-to-many, made explicit."""

    class Role(models.TextChoices):
        ADVISOR = 'ADVISOR', 'Orientador'
        CO_ADVISOR = 'CO_ADVISOR', 'Coorientador'

    professor = models.ForeignKey(
        ProfessorProfile, on_delete=models.CASCADE, related_name='supervisions'
    )
    student = models.ForeignKey(
        StudentProfile, on_delete=models.CASCADE, related_name='supervisions'
    )
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.ADVISOR)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'orientação'
        verbose_name_plural = 'orientações'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['professor', 'student'], name='supervision_unique_pair'
            ),
            models.UniqueConstraint(
                fields=['student'],
                condition=models.Q(role='ADVISOR'),
                name='supervision_single_advisor_per_student',
            ),
        ]

    def __str__(self):
        return f'{self.professor.user.full_name} → {self.student.user.full_name}'
