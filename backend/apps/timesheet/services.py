"""
Business logic that coordinates several models or talks to the outside world.

Kept out of the views so it can be tested without HTTP, and out of the models so
a single clock-in does not need to know about e-mail.
"""

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from config.exceptions import EntryAlreadyOpen, NoOpenEntry, StudentNotActive
from apps.timesheet.models import TimeEntry, WeeklyAlert
from apps.timesheet.weeks import current_week_start, week_bounds
from apps.users.models import StudentProfile, hours


# --------------------------------------------------------------------------
# Clocking in and out
# --------------------------------------------------------------------------

def clock_in(student, notes=''):
    if not student.can_clock_in:
        raise StudentNotActive()

    existing = student.time_entries.filter(check_out__isnull=True).first()
    if existing:
        raise EntryAlreadyOpen(
            f'Você já tem um ponto aberto desde '
            f'{timezone.localtime(existing.check_in):%d/%m às %H:%M}.',
            details={'open_entry_id': existing.id},
        )

    try:
        # The timestamp is the server's. Accepting one from the client would be
        # trivially forgeable.
        return TimeEntry.objects.create(
            student=student, check_in=timezone.now(), notes=notes or ''
        )
    except IntegrityError:
        # Lost a race against a second request — the partial unique index is
        # the real guarantee, and this is the expected way to lose.
        existing = student.time_entries.filter(check_out__isnull=True).first()
        raise EntryAlreadyOpen(details={'open_entry_id': existing.id if existing else None})


@transaction.atomic
def clock_out(student):
    entry = (
        TimeEntry.objects.select_for_update()
        .filter(student=student, check_out__isnull=True)
        .first()
    )
    if entry is None:
        raise NoOpenEntry()
    entry.close()
    return entry


def adjust_entry(entry, actor, check_in=None, check_out=None, reason=''):
    if check_in is not None:
        entry.check_in = check_in
    if check_out is not None:
        entry.check_out = check_out
    entry.adjusted_by = actor
    entry.adjustment_reason = reason
    entry.full_clean(exclude=['student'])
    entry.save()
    return entry


# --------------------------------------------------------------------------
# Summaries and ranking
# --------------------------------------------------------------------------

def build_student_summary(student, weeks_back=8):
    from apps.timesheet.serializers import TimeEntrySerializer

    monday = current_week_start()
    week_hours = student.hours_in_week(monday)

    history = []
    for offset in range(weeks_back - 1, -1, -1):
        week = monday - timedelta(days=7 * offset)
        logged = student.hours_in_week(week)
        history.append({
            'week_start': week,
            'hours': logged,
            'target_met': logged >= Decimal(student.weekly_minimum_hours),
        })

    open_entry = student.open_entry

    return {
        'student_id': student.id,
        'total_hours': student.total_hours,
        'required_hours': student.required_hours,
        'remaining_hours': student.remaining_hours,
        'completion_percentage': student.completion_percentage,
        'current_week_hours': week_hours,
        'weekly_minimum_hours': student.weekly_minimum_hours,
        'weekly_target_met': week_hours >= Decimal(student.weekly_minimum_hours),
        'ranking_position': ranking_position(student),
        'open_entry': TimeEntrySerializer(open_entry).data if open_entry else None,
        'last_8_weeks': history,
    }


def build_ranking(internship=None, professor=None, status=None, limit=None, request=None):
    """Ordered by total accumulated hours, descending.

    Absolute hours, not percentage of target: a group leaderboard is compared on
    the raw number. The per-student percentage rides along on each row.
    """
    monday = current_week_start()
    start, end = week_bounds(monday)

    qs = (
        StudentProfile.objects.select_related('user', 'internship')
        .with_total_hours()
        .with_week_hours(start, end)
    )
    if internship:
        qs = qs.filter(internship_id=internship)
    if professor:
        qs = qs.filter(supervisions__professor_id=professor).distinct()
    if status:
        qs = qs.filter(status=status)

    rows = sorted(qs, key=lambda s: s.total_duration, reverse=True)

    results = []
    previous_total = None
    position = 0
    for index, student in enumerate(rows, start=1):
        total = hours(student.total_duration)
        # Standard competition ranking: ties share a position and the next
        # position skips accordingly.
        if total != previous_total:
            position = index
            previous_total = total
        results.append({
            'position': position,
            'student_id': student.id,
            'full_name': student.user.full_name,
            'avatar_url': student.user.avatar_url(request),
            'internship': student.internship.title if student.internship else None,
            'total_hours': total,
            'current_week_hours': hours(student.week_duration),
            'required_hours': student.required_hours,
            'completion_percentage': student.completion_percentage,
            'status': student.status,
        })

    if limit:
        results = results[:limit]
    return results


def ranking_position(student):
    for row in build_ranking():
        if row['student_id'] == student.id:
            return row['position']
    return None


# --------------------------------------------------------------------------
# Weekly alert
# --------------------------------------------------------------------------

def students_below_minimum(week_start_date):
    """Active students whose closed hours this week are under their minimum."""
    start, end = week_bounds(week_start_date)
    candidates = (
        StudentProfile.objects.select_related('user')
        .active()
        .with_week_hours(start, end)
    )
    return [
        student
        for student in candidates
        if hours(student.week_duration) < Decimal(student.weekly_minimum_hours)
    ]


def dispatch_alert(student, week_start_date):
    """Claim the WeeklyAlert row, then send. Returns the alert, or None if the
    student was already warned for this week.

    The row is claimed *before* the e-mail goes out. If the mail were sent first
    and the process died before the insert, a re-run would mail the student
    twice; in this order a crash leaves a visible row instead.
    """
    logged = student.hours_in_week(week_start_date)
    minimum = Decimal(student.weekly_minimum_hours)

    try:
        with transaction.atomic():
            alert = WeeklyAlert.objects.create(
                student=student,
                week_start=week_start_date,
                hours_logged=logged,
                minimum_required=minimum,
            )
    except IntegrityError:
        return None  # unique(student, week_start) — already warned this week

    context = {
        'student': student,
        'full_name': student.user.full_name,
        'hours_logged': logged,
        'minimum_required': minimum,
        'shortfall': max(Decimal('0.00'), minimum - logged),
        'total_hours': student.total_hours,
        'required_hours': student.required_hours,
        'remaining_hours': student.remaining_hours,
        'week_start': week_start_date,
        'week_end': week_start_date + timedelta(days=6),
        'frontend_url': settings.FRONTEND_URL,
    }

    try:
        body = render_to_string('timesheet/weekly_alert.txt', context)
        send_mail(
            subject=f'GEICIS Ponto — você fez {logged}h esta semana (mínimo: {minimum}h)',
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[student.user.email],
            fail_silently=False,
        )
    except Exception as exc:
        alert.delivery_status = WeeklyAlert.DeliveryStatus.FAILED
        alert.error_message = str(exc)[:255]
        alert.save(update_fields=['delivery_status', 'error_message'])
        return alert

    alert.sent_at = timezone.now()
    alert.delivery_status = WeeklyAlert.DeliveryStatus.SENT
    alert.save(update_fields=['sent_at', 'delivery_status'])
    return alert


def run_weekly_alerts(reference_date=None, dry_run=False):
    monday = (
        current_week_start()
        if reference_date is None
        else reference_date - timedelta(days=reference_date.weekday())
    )

    below = students_below_minimum(monday)
    report = {
        'week_start': monday,
        'evaluated': len(below),
        'sent': 0,
        'failed': 0,
        'skipped': 0,
        'dry_run': dry_run,
        'students': [],
    }

    for student in below:
        logged = student.hours_in_week(monday)
        entry = {
            'student': student.user.full_name,
            'email': student.user.email,
            'hours': logged,
            'minimum': student.weekly_minimum_hours,
        }
        if dry_run:
            entry['result'] = 'would send'
            report['students'].append(entry)
            continue

        alert = dispatch_alert(student, monday)
        if alert is None:
            report['skipped'] += 1
            entry['result'] = 'skipped (already alerted)'
        elif alert.delivery_status == WeeklyAlert.DeliveryStatus.SENT:
            report['sent'] += 1
            entry['result'] = 'sent'
        else:
            report['failed'] += 1
            entry['result'] = f'failed: {alert.error_message}'
        report['students'].append(entry)

    return report
