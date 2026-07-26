# Class Diagram

Domain classes with the behaviour attached to them. Persisted fields are in
[../data-model.md](../data-model.md); this diagram is about where logic lives.

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
    Internship "1" -- "0..*" StudentProfile : hosts
    ProfessorProfile "1" -- "0..*" Supervision
    StudentProfile "1" -- "0..*" Supervision
    StudentProfile "1" -- "0..*" TimeEntry : logs
    StudentProfile "1" -- "0..*" WeeklyAlert : receives
    User "1" -- "0..*" TimeEntry : adjusts
```

## Service layer

The pieces that do not belong on a single model, because they coordinate several
or talk to the outside world:

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

    SendWeeklyAlertsCommand --> WeeklyAlertService : invokes
    WeeklyAlertService --> StudentQuerySet : queries
    RankingService --> StudentQuerySet : queries
    TimesheetService --> StudentQuerySet : queries
```

Three notes on the shape of this:

- **`StudentQuerySet` is where the hour arithmetic lives.** `with_total_hours()`
  and `with_week_hours()` are annotations, so the ranking, the summary, and the
  weekly job all sum hours through the same SQL rather than three near-identical
  Python loops that drift apart.
- **`TimesheetService.clock_in` still catches `IntegrityError`.** It checks for an
  open entry first for a clean error message, but the partial unique index is the
  real guarantee, and the code is written expecting the database to win a race.
- **`SendWeeklyAlertsCommand` holds no logic.** It parses `--dry-run` and
  `--week`, calls the service, prints a report. Everything testable sits in
  `WeeklyAlertService`, which never needs a fake cron to exercise.
