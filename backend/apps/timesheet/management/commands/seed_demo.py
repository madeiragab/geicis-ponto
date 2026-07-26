"""
Populates a development database with a believable GEICIS group.

Destructive only in the sense that it creates records; it never deletes. Refuses
to run unless DEBUG is on, so it cannot be pointed at production by accident.
"""

import random
from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.internships.models import Internship
from apps.timesheet.models import TimeEntry
from apps.timesheet.weeks import current_week_start, week_bounds
from apps.users.models import ProfessorProfile, StudentProfile, Supervision, User

PASSWORD = 'GeicisDemo!2026'

INTERNSHIPS = [
    ('Infraestrutura de Redes', 'TRE-PE', 'Carlos Lima', 'carlos@tre-pe.jus.br'),
    ('Laboratório de Sistemas', 'UFPE', 'Fernanda Rocha', 'fernanda@ufpe.br'),
    ('Suporte e Help Desk', 'Prefeitura do Recife', 'Marcos Dias', 'marcos@recife.pe.gov.br'),
]

PROFESSORS = [
    ('Ana Beatriz Correia', 'ana.correia@geicis.br', '1122334', 'Computação'),
    ('Bruno Tavares', 'bruno.tavares@geicis.br', '2233445', 'Redes'),
]

STUDENTS = [
    ('Maria Souza', 'maria.souza@geicis.br', '20231044', 300, 20),
    ('João Ferreira', 'joao.ferreira@geicis.br', '20231045', 300, 20),
    ('Lucas Andrade', 'lucas.andrade@geicis.br', '20231046', 240, 16),
    ('Camila Nunes', 'camila.nunes@geicis.br', '20231047', 400, 25),
    ('Rafael Bezerra', 'rafael.bezerra@geicis.br', '20231048', 300, 20),
    ('Beatriz Lima', 'beatriz.lima@geicis.br', '20231049', 180, 12),
    ('Diego Martins', 'diego.martins@geicis.br', '20231050', 200, 15),
]


class Command(BaseCommand):
    help = 'Cria dados de demonstração para desenvolvimento.'

    def add_arguments(self, parser):
        parser.add_argument('--weeks', type=int, default=8, help='Semanas de histórico.')

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('seed_demo só roda com DEBUG=True.')

        random.seed(42)  # reproducible demo data
        weeks = options['weeks']

        internships = [
            Internship.objects.get_or_create(
                title=title,
                organization=org,
                defaults={'supervisor_name': sup, 'supervisor_email': mail},
            )[0]
            for title, org, sup, mail in INTERNSHIPS
        ]

        coord, created = User.objects.get_or_create(
            email='coord@geicis.br',
            defaults={
                'full_name': 'Coordenação GEICIS',
                'role': User.Role.COORDINATOR,
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if created:
            coord.set_password(PASSWORD)
            coord.save()

        professors = []
        for name, email, siape, dept in PROFESSORS:
            user, created = User.objects.get_or_create(
                email=email, defaults={'full_name': name, 'role': User.Role.PROFESSOR}
            )
            if created:
                user.set_password(PASSWORD)
                user.save()
            professor, _ = ProfessorProfile.objects.get_or_create(
                user=user, defaults={'siape': siape, 'department': dept}
            )
            professors.append(professor)

        monday = current_week_start()
        start_date = monday - timedelta(weeks=weeks)

        for index, (name, email, matricula, required, weekly) in enumerate(STUDENTS):
            user, created = User.objects.get_or_create(
                email=email, defaults={'full_name': name, 'role': User.Role.STUDENT}
            )
            if created:
                user.set_password(PASSWORD)
                user.save()

            student, created = StudentProfile.objects.get_or_create(
                user=user,
                defaults={
                    'registration_number': matricula,
                    'internship': internships[index % len(internships)],
                    'required_hours': required,
                    'weekly_minimum_hours': weekly,
                    'started_at': start_date,
                    'expected_end_at': date.today() + timedelta(days=120),
                },
            )
            if not created:
                continue

            # An advisor for everyone, a co-advisor for some — the N:M in use.
            Supervision.objects.get_or_create(
                professor=professors[index % len(professors)],
                student=student,
                defaults={'role': Supervision.Role.ADVISOR},
            )
            if index % 3 == 0:
                Supervision.objects.get_or_create(
                    professor=professors[(index + 1) % len(professors)],
                    student=student,
                    defaults={'role': Supervision.Role.CO_ADVISOR},
                )

            # Backdated history. Some students keep pace, some fall behind, so
            # the ranking and the weekly alert both have something to say.
            pace = [1.15, 1.05, 0.85, 1.3, 0.6, 0.95, 0.4][index]
            for week_offset in range(weeks, 0, -1):
                week = monday - timedelta(weeks=week_offset)
                week_start_dt, _ = week_bounds(week)
                target = weekly * pace * random.uniform(0.8, 1.2)
                remaining = target
                for weekday in range(5):
                    if remaining <= 0:
                        break
                    block = min(remaining, random.uniform(2, 5))
                    check_in = week_start_dt + timedelta(
                        days=weekday, hours=random.choice([8, 9, 13, 14])
                    )
                    TimeEntry.objects.create(
                        student=student,
                        check_in=check_in,
                        check_out=check_in + timedelta(hours=block),
                        notes=random.choice([
                            'Configuração de switches', 'Documentação', 'Atendimento a chamados',
                            'Manutenção de servidores', 'Reunião de acompanhamento', '',
                        ]),
                    )
                    remaining -= block

            # Partial current week, so "esta semana" is not empty.
            week_start_dt, _ = week_bounds(monday)
            today_index = min(timezone.localtime().weekday(), 4)
            for weekday in range(today_index):
                if random.random() < 0.3:
                    continue
                check_in = week_start_dt + timedelta(days=weekday, hours=9)
                TimeEntry.objects.create(
                    student=student,
                    check_in=check_in,
                    check_out=check_in + timedelta(hours=random.uniform(3, 6) * pace),
                    notes='',
                )

        self.stdout.write(self.style.SUCCESS('Dados de demonstração criados.'))
        self.stdout.write(f'  Coordenação: coord@geicis.br / {PASSWORD}')
        self.stdout.write(f'  Professor:   ana.correia@geicis.br / {PASSWORD}')
        self.stdout.write(f'  Aluno:       maria.souza@geicis.br / {PASSWORD}')
