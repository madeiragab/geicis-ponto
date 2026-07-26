"""
Week arithmetic, in one place.

A week runs Monday 00:00:00 to Sunday 23:59:59.999 in the project timezone
(America/Sao_Paulo). An entry belongs to the week of its `check_in`.

Every week question in the system goes through here, so the Friday job, the
ranking, and the dashboard cannot disagree about where a week starts.
"""

from datetime import date, datetime, time, timedelta

from django.utils import timezone


def week_start_for(moment):
    """The Monday `date` of the week containing `moment` (date or datetime)."""
    if isinstance(moment, datetime):
        moment = timezone.localtime(moment).date() if timezone.is_aware(moment) else moment.date()
    return moment - timedelta(days=moment.weekday())


def current_week_start():
    """The Monday of the week we are in right now, in local time."""
    return week_start_for(timezone.localtime())


def week_bounds(week_start_date):
    """Aware datetimes for the start and the exclusive end of a week."""
    if isinstance(week_start_date, datetime):
        week_start_date = week_start_date.date()
    if not isinstance(week_start_date, date):
        raise TypeError('week_start_date must be a date')

    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(week_start_date, time.min), tz)
    end = timezone.make_aware(
        datetime.combine(week_start_date + timedelta(days=7), time.min), tz
    )
    return start, end


def day_bounds(day):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, time.min), tz)
    return start, start + timedelta(days=1)
