# Diagrama de Classes

🇧🇷 **Português** | 🇺🇸 [English](../../diagrams/class-diagram.md)

Classes de domínio com o comportamento associado a elas. Campos persistidos
estão em [../data-model.md](../data-model.md); este diagrama é sobre onde a
lógica vive.

```mermaid
classDiagram
    direction TB

    class User {
        +BigAutoField id
        +EmailField email
        +CharField full_name
        +CharField role
        +BooleanField is_active
        +BooleanField is_staff
        +is_student() bool
        +is_professor() bool
        +is_coordinator() bool
    }

    class StudentProfile {
        +OneToOne~User~ user
        +CharField registration_number
        +FK~Internship~ internship
        +int required_hours
        +int weekly_minimum_hours
        +DateField started_at
        +DateField expected_end_at
        +CharField status
        +total_hours() Decimal
        +remaining_hours() Decimal
        +completion_percentage() Decimal
        +hours_in_week(monday) Decimal
        +current_week_hours() Decimal
        +open_entry() TimeEntry
        +met_weekly_target(monday) bool
        +can_clock_in() bool
    }

    class ProfessorProfile {
        +OneToOne~User~ user
        +CharField siape
        +CharField department
        +students() QuerySet
        +supervises(student) bool
    }

    class Internship {
        +CharField title
        +CharField organization
        +TextField description
        +CharField supervisor_name
        +EmailField supervisor_email
        +BooleanField is_active
        +student_count() int
        +total_hours() Decimal
    }

    class Supervision {
        +FK~ProfessorProfile~ professor
        +FK~StudentProfile~ student
        +CharField role
        +DateTimeField created_at
    }

    class TimeEntry {
        +FK~StudentProfile~ student
        +DateTimeField check_in
        +DateTimeField check_out
        +CharField notes
        +FK~User~ adjusted_by
        +CharField adjustment_reason
        +is_open() bool
        +duration() timedelta
        +duration_hours() Decimal
        +week_start() date
        +close(at) void
        +clean() void
    }

    class WeeklyAlert {
        +FK~StudentProfile~ student
        +DateField week_start
        +Decimal hours_logged
        +Decimal minimum_required
        +DateTimeField sent_at
        +CharField delivery_status
        +CharField error_message
        +shortfall_hours() Decimal
    }

    User "1" -- "0..1" StudentProfile
    User "1" -- "0..1" ProfessorProfile
    Internship "1" -- "0..*" StudentProfile : hospeda
    ProfessorProfile "1" -- "0..*" Supervision
    StudentProfile "1" -- "0..*" Supervision
    StudentProfile "1" -- "0..*" TimeEntry : registra
    StudentProfile "1" -- "0..*" WeeklyAlert : recebe
    User "1" -- "0..*" TimeEntry : ajusta
```

## Camada de serviço

As partes que não pertencem a um único model, porque coordenam vários ou
conversam com o mundo externo:

```mermaid
classDiagram
    direction LR

    class TimesheetService {
        <<service>>
        +clock_in(student, notes) TimeEntry
        +clock_out(student) TimeEntry
        +adjust(entry, actor, changes, reason) TimeEntry
    }

    class RankingService {
        <<service>>
        +build(filters) list~RankingRow~
        +position_of(student) int
    }

    class WeeklyAlertService {
        <<service>>
        +students_below_minimum(monday) QuerySet
        +dispatch(student, monday) WeeklyAlert
        +run(reference_date) AlertReport
    }

    class SendWeeklyAlertsCommand {
        <<management command>>
        +handle(dry_run, week) void
    }

    class StudentQuerySet {
        <<queryset>>
        +with_total_hours() QuerySet
        +with_week_hours(monday) QuerySet
        +active() QuerySet
        +supervised_by(professor) QuerySet
    }

    SendWeeklyAlertsCommand --> WeeklyAlertService : invoca
    WeeklyAlertService --> StudentQuerySet : consulta
    RankingService --> StudentQuerySet : consulta
    TimesheetService --> StudentQuerySet : consulta
```

Três notas sobre esse formato:

- **`StudentQuerySet` é onde a aritmética de horas vive.** `with_total_hours()`
  e `with_week_hours()` são anotações, então o ranking, o resumo, e o job
  semanal somam horas através do mesmo SQL, em vez de três loops em Python
  quase idênticos que iriam divergir.
- **`TimesheetService.clock_in` ainda captura `IntegrityError`.** Ele checa
  por um registro aberto primeiro para uma mensagem de erro limpa, mas o
  índice único parcial é a garantia real, e o código é escrito esperando que
  o banco vença uma corrida.
- **`SendWeeklyAlertsCommand` não guarda lógica.** Ele processa `--dry-run` e
  `--week`, chama o serviço, imprime um relatório. Tudo o que é testável fica
  em `WeeklyAlertService`, que nunca precisa de um cron falso para ser
  exercitado.
