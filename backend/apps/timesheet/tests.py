from datetime import date, timedelta
from decimal import Decimal

from django.core import mail
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.internships.models import Internship
from apps.timesheet.models import TimeEntry, WeeklyAlert
from apps.timesheet.services import (
    build_ranking,
    clock_in,
    clock_out,
    run_weekly_alerts,
    students_below_minimum,
)
from apps.timesheet.weeks import current_week_start, week_bounds, week_start_for
from apps.users.models import ProfessorProfile, StudentProfile, Supervision, User


def make_student(email, name, required=300, weekly=20, internship=None, status='ACTIVE'):
    user = User.objects.create_user(
        email=email, password='SenhaForte!2026', full_name=name, role=User.Role.STUDENT
    )
    return StudentProfile.objects.create(
        user=user,
        registration_number=email.split('@')[0],
        internship=internship,
        required_hours=required,
        weekly_minimum_hours=weekly,
        started_at=date(2026, 3, 1),
        status=status,
    )


def log_hours(student, hours_worked, days_ago=0):
    """Create a closed entry inside the current week."""
    monday_start, _ = week_bounds(current_week_start())
    check_in = monday_start + timedelta(days=days_ago, hours=9)
    return TimeEntry.objects.create(
        student=student,
        check_in=check_in,
        check_out=check_in + timedelta(hours=hours_worked),
    )


class HourComputationTests(TestCase):
    """The aggregation is annotated SQL, not a Python loop — verify the SQL."""

    def setUp(self):
        self.student = make_student('a1@geicis.br', 'Aluno Um', required=100, weekly=10)

    def test_total_hours_sums_closed_entries(self):
        log_hours(self.student, 4, days_ago=0)
        log_hours(self.student, 3.5, days_ago=1)
        self.assertEqual(self.student.total_hours, Decimal('7.50'))

    def test_open_entry_does_not_count(self):
        log_hours(self.student, 5, days_ago=0)
        TimeEntry.objects.create(student=self.student, check_in=timezone.now())
        self.assertEqual(self.student.total_hours, Decimal('5.00'))

    def test_completion_percentage_capped_but_total_is_not(self):
        log_hours(self.student, 8, days_ago=0)
        log_hours(self.student, 8, days_ago=1)
        log_hours(self.student, 8, days_ago=2)
        log_hours(self.student, 8, days_ago=3)
        log_hours(self.student, 8, days_ago=4)
        log_hours(self.student, 8, days_ago=5)
        log_hours(self.student, 8, days_ago=6)
        # 56h wall clock; required is 100 so still under
        self.assertEqual(self.student.total_hours, Decimal('56.00'))
        self.assertEqual(self.student.completion_percentage, Decimal('56.00'))

    def test_remaining_hours_never_negative(self):
        big = make_student('a2@geicis.br', 'Aluno Dois', required=4, weekly=2)
        log_hours(big, 10, days_ago=0)
        self.assertEqual(big.total_hours, Decimal('10.00'))
        self.assertEqual(big.remaining_hours, Decimal('0.00'))
        self.assertEqual(big.completion_percentage, Decimal('100.00'))

    def test_hours_with_no_entries_is_zero_not_none(self):
        self.assertEqual(self.student.total_hours, Decimal('0.00'))
        self.assertEqual(self.student.current_week_hours, Decimal('0.00'))


class SingleOpenEntryTests(TestCase):
    def setUp(self):
        self.student = make_student('b1@geicis.br', 'Aluno B')

    def test_database_rejects_a_second_open_entry(self):
        TimeEntry.objects.create(student=self.student, check_in=timezone.now())
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TimeEntry.objects.create(student=self.student, check_in=timezone.now())

    def test_clock_in_twice_raises_readable_error(self):
        clock_in(self.student)
        with self.assertRaises(Exception) as ctx:
            clock_in(self.student)
        self.assertEqual(ctx.exception.code, 'ENTRY_ALREADY_OPEN')

    def test_clock_out_closes_and_allows_a_new_entry(self):
        clock_in(self.student)
        entry = clock_out(self.student)
        self.assertFalse(entry.is_open)
        clock_in(self.student)  # must not raise
        self.assertEqual(self.student.time_entries.count(), 2)

    def test_clock_out_without_open_entry(self):
        with self.assertRaises(Exception) as ctx:
            clock_out(self.student)
        self.assertEqual(ctx.exception.code, 'NO_OPEN_ENTRY')

    def test_inactive_student_cannot_clock_in(self):
        suspended = make_student('b2@geicis.br', 'Suspenso', status='SUSPENDED')
        with self.assertRaises(Exception) as ctx:
            clock_in(suspended)
        self.assertEqual(ctx.exception.code, 'STUDENT_NOT_ACTIVE')

    def test_checkout_before_checkin_is_rejected_by_the_database(self):
        now = timezone.now()
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TimeEntry.objects.create(
                    student=self.student, check_in=now, check_out=now - timedelta(hours=1)
                )


class WeekArithmeticTests(TestCase):
    def test_week_start_is_monday(self):
        wednesday = date(2026, 7, 22)
        self.assertEqual(week_start_for(wednesday), date(2026, 7, 20))

    def test_sunday_belongs_to_the_week_that_started_monday(self):
        sunday = date(2026, 7, 26)
        self.assertEqual(week_start_for(sunday), date(2026, 7, 20))

    def test_entry_belongs_to_the_week_of_its_check_in(self):
        student = make_student('c1@geicis.br', 'Aluno C')
        monday_start, _ = week_bounds(current_week_start())
        # Friday 23:30 to Saturday 01:15 — counts entirely toward the Friday week
        check_in = monday_start + timedelta(days=4, hours=23, minutes=30)
        entry = TimeEntry.objects.create(
            student=student, check_in=check_in, check_out=check_in + timedelta(hours=1, minutes=45)
        )
        self.assertEqual(entry.week_start, current_week_start())
        self.assertEqual(student.hours_in_week(current_week_start()), Decimal('1.75'))


class RankingTests(TestCase):
    def setUp(self):
        self.internship = Internship.objects.create(title='Redes', organization='TRE-PE')
        self.a = make_student('r1@geicis.br', 'Ana', internship=self.internship)
        self.b = make_student('r2@geicis.br', 'Bruno', internship=self.internship)
        self.c = make_student('r3@geicis.br', 'Carla', internship=self.internship)

    def test_ordered_by_absolute_hours_descending(self):
        log_hours(self.a, 5, days_ago=0)
        log_hours(self.b, 9, days_ago=0)
        log_hours(self.c, 7, days_ago=0)
        names = [row['full_name'] for row in build_ranking()]
        self.assertEqual(names, ['Bruno', 'Carla', 'Ana'])

    def test_ties_share_a_position_and_the_next_skips(self):
        log_hours(self.a, 6, days_ago=0)
        log_hours(self.b, 6, days_ago=0)
        log_hours(self.c, 2, days_ago=0)
        positions = {row['full_name']: row['position'] for row in build_ranking()}
        self.assertEqual(positions['Ana'], 1)
        self.assertEqual(positions['Bruno'], 1)
        self.assertEqual(positions['Carla'], 3)

    def test_completed_students_stay_in_the_ranking(self):
        done = make_student('r4@geicis.br', 'Diego', status='COMPLETED')
        log_hours(done, 50, days_ago=0)
        names = [row['full_name'] for row in build_ranking()]
        self.assertIn('Diego', names)
        self.assertEqual(names[0], 'Diego')

    def test_open_entries_do_not_move_the_ranking(self):
        log_hours(self.a, 3, days_ago=0)
        TimeEntry.objects.create(student=self.b, check_in=timezone.now() - timedelta(hours=20))
        names = [row['full_name'] for row in build_ranking()]
        self.assertEqual(names[0], 'Ana')


class WeeklyAlertTests(TestCase):
    def setUp(self):
        self.below = make_student('w1@geicis.br', 'Abaixo', required=200, weekly=20)
        self.above = make_student('w2@geicis.br', 'Acima', required=200, weekly=20)
        log_hours(self.below, 5, days_ago=0)
        log_hours(self.above, 25, days_ago=0)
        self.monday = current_week_start()

    def test_only_students_under_the_minimum_are_selected(self):
        names = [s.user.full_name for s in students_below_minimum(self.monday)]
        self.assertIn('Abaixo', names)
        self.assertNotIn('Acima', names)

    def test_inactive_students_are_skipped(self):
        make_student('w3@geicis.br', 'Desligado', weekly=20, status='WITHDRAWN')
        names = [s.user.full_name for s in students_below_minimum(self.monday)]
        self.assertNotIn('Desligado', names)

    def test_sends_email_and_records_the_alert(self):
        report = run_weekly_alerts()
        self.assertEqual(report['sent'], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Abaixo', mail.outbox[0].body)
        alert = WeeklyAlert.objects.get(student=self.below)
        self.assertEqual(alert.hours_logged, Decimal('5.00'))
        self.assertEqual(alert.minimum_required, Decimal('20.00'))
        self.assertEqual(alert.delivery_status, 'SENT')

    def test_rerunning_the_same_week_sends_nothing(self):
        run_weekly_alerts()
        mail.outbox.clear()
        report = run_weekly_alerts()
        self.assertEqual(report['sent'], 0)
        self.assertEqual(report['skipped'], 1)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(WeeklyAlert.objects.filter(student=self.below).count(), 1)

    def test_dry_run_sends_nothing_and_writes_nothing(self):
        report = run_weekly_alerts(dry_run=True)
        self.assertEqual(report['evaluated'], 1)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(WeeklyAlert.objects.count(), 0)

    def test_open_entry_does_not_rescue_a_student_from_the_alert(self):
        """A session still running at 23:59 Friday does not count."""
        TimeEntry.objects.create(
            student=self.below, check_in=timezone.now() - timedelta(hours=30)
        )
        names = [s.user.full_name for s in students_below_minimum(self.monday)]
        self.assertIn('Abaixo', names)

    def test_alert_records_the_minimum_demanded_at_the_time(self):
        run_weekly_alerts()
        self.below.weekly_minimum_hours = 40
        self.below.save()
        alert = WeeklyAlert.objects.get(student=self.below)
        self.assertEqual(alert.minimum_required, Decimal('20.00'))


@override_settings(
    # The login throttle is per-IP and DRF keeps its counters in the cache,
    # which outlives a single test method. Without this every test after the
    # fifth login would 429 — the throttle working correctly, in the way of
    # testing everything else. It gets its own test below.
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)
class APITests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.internship = Internship.objects.create(title='Redes', organization='TRE-PE')
        self.student = make_student('api@geicis.br', 'Aluno API', internship=self.internship)
        self.other = make_student('api2@geicis.br', 'Outro Aluno')

        prof_user = User.objects.create_user(
            email='prof@geicis.br', password='SenhaForte!2026',
            full_name='Prof Teste', role=User.Role.PROFESSOR,
        )
        self.professor = ProfessorProfile.objects.create(user=prof_user)
        Supervision.objects.create(professor=self.professor, student=self.student)

        self.coord = User.objects.create_user(
            email='coord@geicis.br', password='SenhaForte!2026',
            full_name='Coord', role=User.Role.COORDINATOR, is_staff=True,
        )

    def auth(self, email):
        res = self.client.post(
            '/api/auth/token/', {'email': email, 'password': 'SenhaForte!2026'}, format='json'
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {res.data["access"]}')
        return res.data

    def test_login_returns_user_and_tokens(self):
        data = self.auth('api@geicis.br')
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['user']['role'], 'STUDENT')

    def test_login_with_wrong_password_is_generic(self):
        res = self.client.post(
            '/api/auth/token/', {'email': 'api@geicis.br', 'password': 'errada'}, format='json'
        )
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data['error']['code'], 'INVALID_CREDENTIALS')

    def test_unauthenticated_request_is_rejected(self):
        res = self.client.get('/api/ranking/')
        self.assertEqual(res.status_code, 401)

    def test_check_in_then_check_out_flow(self):
        self.auth('api@geicis.br')

        res = self.client.get('/api/time-entries/current/')
        self.assertIsNone(res.data['open_entry'])

        res = self.client.post('/api/time-entries/check-in/', {'notes': 'Rack'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertTrue(res.data['is_open'])

        res = self.client.get('/api/time-entries/current/')
        self.assertIsNotNone(res.data['open_entry'])

        res = self.client.post('/api/time-entries/check-out/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertFalse(res.data['entry']['is_open'])
        self.assertIn('summary', res.data)
        self.assertIn('ranking_position', res.data['summary'])

    def test_double_check_in_returns_409_with_the_open_entry(self):
        self.auth('api@geicis.br')
        self.client.post('/api/time-entries/check-in/', {}, format='json')
        res = self.client.post('/api/time-entries/check-in/', {}, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['error']['code'], 'ENTRY_ALREADY_OPEN')
        self.assertIn('open_entry_id', res.data['error']['details'])

    def test_check_out_without_open_entry_returns_409(self):
        self.auth('api@geicis.br')
        res = self.client.post('/api/time-entries/check-out/', {}, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['error']['code'], 'NO_OPEN_ENTRY')

    def test_student_sees_only_their_own_entries(self):
        log_hours(self.student, 3, days_ago=0)
        log_hours(self.other, 3, days_ago=0)
        self.auth('api@geicis.br')
        res = self.client.get('/api/time-entries/')
        self.assertEqual(res.data['count'], 1)

    def test_professor_sees_supervised_students_entries(self):
        log_hours(self.student, 3, days_ago=0)
        log_hours(self.other, 3, days_ago=0)
        self.auth('prof@geicis.br')
        res = self.client.get('/api/time-entries/')
        self.assertEqual(res.data['count'], 1)

    def test_coordinator_sees_everything(self):
        log_hours(self.student, 3, days_ago=0)
        log_hours(self.other, 3, days_ago=0)
        self.auth('coord@geicis.br')
        res = self.client.get('/api/time-entries/')
        self.assertEqual(res.data['count'], 2)

    def test_student_cannot_adjust_timestamps(self):
        entry = log_hours(self.student, 3, days_ago=0)
        self.auth('api@geicis.br')
        res = self.client.patch(
            f'/api/time-entries/{entry.id}/',
            {'check_out': timezone.now().isoformat(), 'adjustment_reason': 'quero mais horas'},
            format='json',
        )
        self.assertEqual(res.status_code, 403)

    def test_professor_adjustment_requires_a_reason(self):
        entry = TimeEntry.objects.create(
            student=self.student, check_in=timezone.now() - timedelta(hours=20)
        )
        self.auth('prof@geicis.br')
        res = self.client.patch(
            f'/api/time-entries/{entry.id}/',
            {'check_out': timezone.now().isoformat()},
            format='json',
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['error']['code'], 'VALIDATION_ERROR')

    def test_professor_can_adjust_with_a_reason(self):
        entry = TimeEntry.objects.create(
            student=self.student, check_in=timezone.now() - timedelta(hours=20)
        )
        self.auth('prof@geicis.br')
        res = self.client.patch(
            f'/api/time-entries/{entry.id}/',
            {
                'check_out': (entry.check_in + timedelta(hours=6)).isoformat(),
                'adjustment_reason': 'Aluno esqueceu de bater a saida',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['was_adjusted'])
        self.assertEqual(res.data['duration_hours'], '6.00')

    def test_student_cannot_raise_or_lower_their_own_target(self):
        self.auth('api@geicis.br')
        res = self.client.patch(
            f'/api/students/{self.student.id}/', {'required_hours': 10}, format='json'
        )
        self.assertEqual(res.status_code, 403)
        self.student.refresh_from_db()
        self.assertEqual(self.student.required_hours, 300)

    def test_coordinator_can_change_the_target(self):
        self.auth('coord@geicis.br')
        res = self.client.patch(
            f'/api/students/{self.student.id}/', {'required_hours': 400}, format='json'
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.student.refresh_from_db()
        self.assertEqual(self.student.required_hours, 400)

    def test_summary_of_an_unsupervised_student_is_404_not_403(self):
        self.auth('prof@geicis.br')
        res = self.client.get(f'/api/students/{self.other.id}/summary/')
        self.assertEqual(res.status_code, 404)

    def test_registration_creates_student_with_targets(self):
        res = self.client.post('/api/auth/register/', {
            'email': 'novo@geicis.br',
            'full_name': 'Aluno Novo',
            'password': 'SenhaMuitoForte!2026',
            'password_confirm': 'SenhaMuitoForte!2026',
            'registration_number': '20260001',
            'internship_id': self.internship.id,
            'required_hours': 300,
            'weekly_minimum_hours': 20,
            'started_at': '2026-08-01',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['required_hours'], 300)
        created = User.objects.get(email='novo@geicis.br')
        self.assertEqual(created.role, 'STUDENT')

    def test_registration_cannot_grant_a_privileged_role(self):
        res = self.client.post('/api/auth/register/', {
            'email': 'hacker@geicis.br',
            'full_name': 'Tentativa',
            'password': 'SenhaMuitoForte!2026',
            'password_confirm': 'SenhaMuitoForte!2026',
            'registration_number': '20260002',
            'required_hours': 300,
            'weekly_minimum_hours': 20,
            'started_at': '2026-08-01',
            'role': 'COORDINATOR',
        }, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(User.objects.get(email='hacker@geicis.br').role, 'STUDENT')

    def test_registration_rejects_weekly_minimum_above_total(self):
        res = self.client.post('/api/auth/register/', {
            'email': 'ruim@geicis.br',
            'full_name': 'Meta Ruim',
            'password': 'SenhaMuitoForte!2026',
            'password_confirm': 'SenhaMuitoForte!2026',
            'registration_number': '20260003',
            'required_hours': 10,
            'weekly_minimum_hours': 40,
            'started_at': '2026-08-01',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_internship_with_students_cannot_be_deleted(self):
        self.auth('coord@geicis.br')
        res = self.client.delete(f'/api/internships/{self.internship.id}/')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['error']['code'], 'INTERNSHIP_HAS_STUDENTS')

    def test_student_cannot_create_an_internship(self):
        self.auth('api@geicis.br')
        res = self.client.post(
            '/api/internships/', {'title': 'X', 'organization': 'Y'}, format='json'
        )
        self.assertEqual(res.status_code, 403)

    def test_duplicate_supervision_is_rejected(self):
        self.auth('coord@geicis.br')
        res = self.client.post('/api/supervisions/', {
            'professor_id': self.professor.id,
            'student_id': self.student.id,
            'role': 'CO_ADVISOR',
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['error']['code'], 'SUPERVISION_ALREADY_EXISTS')

    def test_second_advisor_for_the_same_student_is_rejected(self):
        other_prof = ProfessorProfile.objects.create(
            user=User.objects.create_user(
                email='prof2@geicis.br', password='SenhaForte!2026',
                full_name='Prof Dois', role=User.Role.PROFESSOR,
            )
        )
        self.auth('coord@geicis.br')
        res = self.client.post('/api/supervisions/', {
            'professor_id': other_prof.id,
            'student_id': self.student.id,
            'role': 'ADVISOR',
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['error']['code'], 'STUDENT_ALREADY_HAS_ADVISOR')

    def test_ranking_is_visible_to_any_authenticated_user(self):
        log_hours(self.student, 8, days_ago=0)
        self.auth('api@geicis.br')
        res = self.client.get('/api/ranking/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['results'][0]['full_name'], 'Aluno API')

    def test_dashboard_is_coordinator_only(self):
        self.auth('api@geicis.br')
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 403)
        self.auth('coord@geicis.br')
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 200)

    def test_internships_minimal_is_unpaginated(self):
        self.auth('api@geicis.br')
        res = self.client.get('/api/internships/?minimal=true')
        self.assertIsInstance(res.data, list)

    def test_me_returns_the_student_profile(self):
        self.auth('api@geicis.br')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('student_profile', res.data)
        self.assertEqual(res.data['student_profile']['required_hours'], 300)


class LoginThrottleTests(TestCase):
    """The brute-force ceiling on the only endpoint that accepts a password."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        make_student('throttle@geicis.br', 'Alvo')

    def tearDown(self):
        cache.clear()

    def test_repeated_failed_logins_are_throttled(self):
        for _ in range(5):
            self.client.post(
                '/api/auth/token/',
                {'email': 'throttle@geicis.br', 'password': 'errada'},
                format='json',
            )
        res = self.client.post(
            '/api/auth/token/',
            {'email': 'throttle@geicis.br', 'password': 'errada'},
            format='json',
        )
        self.assertEqual(res.status_code, 429)
        self.assertEqual(res.data['error']['code'], 'THROTTLED')
