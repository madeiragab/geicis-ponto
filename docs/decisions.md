# Architectural Decisions

🇧🇷 [Português](pt-br/decisions.md) | 🇺🇸 **English**

The significant choices made while designing the system, and why. Each records
what was rejected, because the rejected option is usually the interesting half.

## Backend framework

Django + Django REST Framework, matching the `social-network` project. Mature
ORM, migrations, an admin the coordinator gets for free, and a permission system
that does not need inventing. The admin alone removes a whole CRUD screen from
the frontend backlog.

## Authentication

SimpleJWT with the same shape as `social-network` — access 1h, refresh 7d, bearer
header — so there is one auth pattern to learn across both projects.

Three settings are tightened here, because time entries are records that justify
academic credit rather than social posts:

- `ROTATE_REFRESH_TOKENS = True` and `BLACKLIST_AFTER_ROTATION = True`, so a
  leaked refresh token dies on the next legitimate use and logout is real rather
  than cosmetic.
- Login throttled to 5/min per IP.
- Login by e-mail rather than username, and the same error message for an unknown
  address and a wrong password, so the endpoint cannot be used to enumerate who
  is in the group.

## Internship as the "1" side

The specification was: a professor has many students, a student has many
professors, and a student does exactly one internship.

`Internship` is therefore modeled as a **placement** — a host organization or
project — which several GEICIS students can share, with the foreign key on
`StudentProfile`. That makes "one internship per student" a property of the
schema rather than a rule someone has to remember to validate.

Rejected: modeling `Internship` as one row per student, which would make the
relationship 1:1 and duplicate the organization's name and supervisor details
across every student sent to the same place.

Deferred: a student's *history* of internships. The current schema holds one
placement per student with no past record. If GEICIS later needs history, the
migration is a `StudentInternship` join table carrying `started_at`, `ended_at`,
and `is_current` — additive, and no existing data is invalidated.

## Supervision as an explicit model

The professor↔student many-to-many is a real table rather than a bare
`ManyToManyField`, because it already carries `role` (`ADVISOR` / `CO_ADVISOR`)
and `created_at`, and because permission checks read from it constantly. The same
reasoning the `social-network` project applied to reactions: make the
relationship explicit instead of hiding rules inside an implicit join.

## Duration is computed, never stored

`TimeEntry` stores `check_in` and `check_out`. It does not store a duration.

A stored duration is a second source of truth, and the first correction a
professor makes to a timestamp leaves it stale. The subtraction is cheap, and
`(student_id, check_in)` is indexed, so aggregate queries stay fast without a
denormalized column to keep honest.

If the group grows past the point where the ranking aggregate is slow — several
hundred students, tens of thousands of entries — the fix is a materialized
summary refreshed on write, not a duration column on the entry.

## `check_out IS NULL` means open

An open entry is one whose `check_out` is null. No status column.

The payoff is the **partial unique index on `student_id where check_out is
null`**. It makes "at most one open entry per student" a database guarantee
rather than a serializer check, which matters because clock-in is exactly the
kind of button that gets double-tapped on a phone with a slow connection. A
status column could not express that constraint as cleanly.

## Open entries do not count

Hours from an entry that is still open are excluded from totals, the ranking, and
the weekly minimum.

The alternative — counting elapsed time on an open entry — makes the ranking
depend on when you look at it and rewards a student who clocks in and walks away.
The cost is that forgetting to clock out loses the session until a professor
corrects it, which is the right pressure: clocking out is the student's job.

Stale entries are flagged after 16 hours but never auto-closed. Auto-closing
would write hours nobody worked into a record that exists to prove hours worked.

## Ranking by absolute hours

The leaderboard sorts on total accumulated hours, descending — not percentage of
target.

Students have different targets, so percentage is arguably fairer. It is also not
what a group leaderboard is for: people compare the raw number, and a student at
90% of a 120h target above a student at 60% of a 400h target reads as wrong to
everyone looking at it. Percentage still appears on every row as a per-student
progress bar, so the fair comparison is visible without being the sort key.

Completed students stay in the ranking. Removing them would quietly erase the
people who did the most work.

## Weekly minimum, not a deadline countdown

The Friday e-mail compares the week's hours against a per-student
`weekly_minimum_hours`, set at registration.

Rejected: alerting anyone who has not finished their total `required_hours`,
which would e-mail every active student every Friday for months and be filtered
into oblivion by week three. Also rejected: deriving an expected pace from
`required_hours / weeks_remaining`, which is more accurate but produces a moving
target students cannot predict, and turns a missed week into a permanently rising
demand.

A fixed weekly number is the version a student can hold in their head.

## The weekly job is a management command, not Celery

`python manage.py send_weekly_alerts`, invoked by cron at `59 23 * * 5`.

Celery would mean a broker, a worker, and a beat process — three moving parts and
a Redis instance to keep alive, for one job that runs once a week. Cron plus a
command is a fraction of the operational surface, is trivially testable
(`--dry-run`, `--week=YYYY-MM-DD`), and runs identically on a developer's laptop.

If GEICIS later needs per-student scheduling or retries with backoff, Celery
becomes worth it. One weekly job is not that.

## Idempotency through a unique constraint

`unique(student_id, week_start)` on `WeeklyAlert`, and the row is inserted
**before** the e-mail is sent.

This makes the command safe to re-run: a second execution on the same Friday
collides with the constraint and sends nothing. Claiming the row first is what
protects the student's inbox — if the e-mail went out first and the process died
before the insert, a retry would send a duplicate. Inserting first means a crash
leaves a visible, fixable row instead.

The alert row is written for failures too, with `delivery_status = FAILED` and
the error message, so an SMTP problem surfaces to the coordinator instead of
vanishing.

## Timezone is `America/Sao_Paulo`

`USE_TZ = True`, storage in UTC, `TIME_ZONE = 'America/Sao_Paulo'`.

Unlike `social-network`, which runs on UTC, this system has business rules
anchored to local wall-clock time: "Friday at 23:59" and "which week does this
entry belong to". On UTC, the Friday job would fire at 20:59 local and the week
boundary would sit at 21:00 Sunday, silently moving entries between weeks.

An entry belongs to the week of its `check_in`, so a session crossing midnight or
a week boundary counts entirely toward the week it started in. Splitting it would
be marginally more accurate and considerably harder to explain to a student
looking at their own numbers.

## Completion is confirmed, not automatic

Reaching `required_hours` does not flip a student's status to `COMPLETED`. A
coordinator does that.

Finishing an internship is an administrative act with paperwork attached. The
system's hour count is evidence for that decision, and pretending otherwise would
make the software the authority on something it is not.

## Business rules live in the backend

Every rule in [business-rules.md](business-rules.md) is enforced by the API. The
frontend mirrors some of them for responsiveness — hiding the clock-in button
when an entry is open — but the API refuses the request regardless. The frontend
is an untrusted client, the same position the `social-network` project takes.

## Records outside scope return 404

A professor requesting a student they do not supervise gets `404`, not `403`. A
`403` would confirm the record exists to someone not allowed to know that.

## Out of scope, deliberately

| Not building                        | Why                                                        |
| ----------------------------------- | ---------------------------------------------------------- |
| Geolocation / IP-pinned clock-in    | Surveillance of students, for a study group built on trust |
| Photo or biometric check-in         | Same, plus a whole category of data protection obligation  |
| Mobile app                          | A responsive web app covers the one interaction that matters |
| Real-time updates (WebSocket)       | Nothing here changes second-to-second except a local timer |
| Automatic PDF hour certificates     | Real value, but it needs the institution's template first  |
| Multi-group / multi-tenant support  | The system is for GEICIS; generalizing now is speculative  |
| Shift scheduling and rosters        | This tracks hours worked, not hours planned                |

The certificate export is the most likely first addition once the institutional
format is known.
