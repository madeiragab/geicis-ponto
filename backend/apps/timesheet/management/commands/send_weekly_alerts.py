"""
The Friday 23:59 job.

    59 23 * * 5  cd /srv/geicis-ponto/backend && venv/bin/python manage.py send_weekly_alerts

Holds no logic: it parses flags, calls the service, prints a report. Everything
testable lives in apps.timesheet.services, which never needs a fake cron.

Idempotent — `unique(student, week_start)` on WeeklyAlert means a second run on
the same Friday sends nothing, so a retry after a crash is safe.
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from apps.timesheet.services import run_weekly_alerts


class Command(BaseCommand):
    help = 'Envia o alerta semanal para alunos abaixo do mínimo de horas.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Mostra quem receberia o e-mail, sem enviar nada.',
        )
        parser.add_argument(
            '--week',
            type=str,
            default=None,
            help='Qualquer data dentro da semana a avaliar (YYYY-MM-DD). Padrão: semana atual.',
        )

    def handle(self, *args, **options):
        reference = None
        if options['week']:
            try:
                reference = datetime.strptime(options['week'], '%Y-%m-%d').date()
            except ValueError:
                raise CommandError('--week precisa estar no formato YYYY-MM-DD.')

        report = run_weekly_alerts(reference_date=reference, dry_run=options['dry_run'])

        mode = ' (dry-run)' if report['dry_run'] else ''
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f'Semana de {report["week_start"]:%d/%m/%Y}{mode}'
            )
        )
        for row in report['students']:
            self.stdout.write(
                f'  {row["student"]} <{row["email"]}> — '
                f'{row["hours"]}h de {row["minimum"]}h — {row["result"]}'
            )

        summary = (
            f'Avaliados: {report["evaluated"]} | enviados: {report["sent"]} | '
            f'pulados: {report["skipped"]} | falhas: {report["failed"]}'
        )
        style = self.style.WARNING if report['failed'] else self.style.SUCCESS
        self.stdout.write(style(summary))
