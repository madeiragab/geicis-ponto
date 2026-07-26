"""
Where the hour arithmetic lives.

The ranking, the student summary, and the weekly alert job all sum hours through
these annotations rather than through three near-identical Python loops that
would drift apart.
"""

from datetime import timedelta

from django.db.models import DurationField, F, Q, QuerySet, Sum
from django.db.models.functions import Coalesce


def _closed_duration_sum(since=None, until=None):
    """Sum of (check_out - check_in) over closed entries, as a DurationField."""
    condition = Q(time_entries__check_out__isnull=False)
    if since is not None:
        condition &= Q(time_entries__check_in__gte=since)
    if until is not None:
        condition &= Q(time_entries__check_in__lt=until)

    return Coalesce(
        Sum(
            F('time_entries__check_out') - F('time_entries__check_in'),
            filter=condition,
            output_field=DurationField(),
        ),
        timedelta(0),
        output_field=DurationField(),
    )


class StudentQuerySet(QuerySet):
    def with_total_hours(self):
        """Annotate `total_duration` over every closed entry."""
        return self.annotate(total_duration=_closed_duration_sum())

    def with_week_hours(self, week_start_dt, week_end_dt=None, alias='week_duration'):
        """Annotate hours logged inside one week.

        An entry belongs to the week of its `check_in`, so a session crossing
        midnight or a week boundary counts entirely toward the week it started in.
        """
        return self.annotate(
            **{alias: _closed_duration_sum(since=week_start_dt, until=week_end_dt)}
        )

    def active(self):
        return self.filter(status='ACTIVE', user__is_active=True)

    def supervised_by(self, professor_profile):
        return self.filter(supervisions__professor=professor_profile)

    def for_viewer(self, user):
        """Scope a student list to what `user` is allowed to see."""
        if user.is_coordinator:
            return self
        if user.is_professor and hasattr(user, 'professor_profile'):
            return self.supervised_by(user.professor_profile).distinct()
        if user.is_student and hasattr(user, 'student_profile'):
            return self.filter(pk=user.student_profile.pk)
        return self.none()
