# Business Rules

Every rule listed here is enforced by the backend. The frontend may mirror some
of them for responsiveness, but the API is the authority.

## Registration

- A student registers with: e-mail, full name, password, registration number,
  internship, **total required hours**, and **weekly minimum hours**.
- `required_hours` is asked once, at registration, and only a coordinator can
  change it afterwards. A student cannot lower their own target.
- Both hour values must be positive, and `weekly_minimum_hours` cannot exceed
  `required_hours`.
- E-mail and registration number are unique across the system.
- Professors and coordinators are created by a coordinator, not by self-service.
  There is no public path to a privileged role.

## Clock in

`POST /api/time-entries/check-in/`

1. The caller must be an active `STUDENT` whose profile status is `ACTIVE`.
2. The student must have **no open entry**. If one exists, the request is
   rejected with `409 ENTRY_ALREADY_OPEN` and the open entry is returned so the
   UI can show it instead.
3. `check_in` is set server-side to `timezone.now()`. The client does not send a
   timestamp — that would be trivially forgeable.
4. `notes` may be supplied and is optional.

A student whose status is `COMPLETED`, `SUSPENDED`, or `WITHDRAWN` cannot clock
in. Their historical hours remain visible and still count in the ranking.

## Clock out

`POST /api/time-entries/check-out/`

1. The student must have exactly one open entry, otherwise `409 NO_OPEN_ENTRY`.
2. `check_out` is set server-side to `timezone.now()`.
3. `check_out > check_in` is guaranteed by the clock, and enforced by a database
   constraint anyway.
4. The response includes the closed entry with its computed duration and the
   student's updated totals, so the UI needs no second request.

### Entries left open

A student who forgets to clock out leaves an entry open indefinitely. Two
mitigations, both deliberate:

- **The open entry does not count** toward totals, the ranking, or the weekly
  minimum. Only closed entries are counted. Forgetting to clock out costs the
  student the session, which is the correct incentive.
- **A nightly sweep** flags entries open for more than 16 hours. They are not
  auto-closed and not deleted — the student sees a banner and asks a professor to
  correct the entry. Automatic closing would invent hours nobody worked.

## Corrections

- A professor may correct the entries of students they supervise. A coordinator
  may correct any entry.
- A student may **never** edit `check_in` or `check_out`, on their own entries or
  anyone else's. They may edit `notes` on their own entries.
- Any correction requires `adjustment_reason` and stamps `adjusted_by`. Corrected
  entries are visibly marked in the UI and in the API response.

## Hour computation

The unit everywhere is **hours as a decimal**, rounded to two places at the point
of display.

```
duration(entry) = check_out - check_in          # only when check_out is not null
total_hours(student) = Σ duration(closed entries of that student)
remaining_hours(student) = max(0, required_hours - total_hours)
completion_percentage(student) = min(100, total_hours / required_hours * 100)
```

Implemented as a single aggregate, not a Python loop:

```python
StudentProfile.objects.annotate(
    total_hours=Coalesce(
        Sum(F('time_entries__check_out') - F('time_entries__check_in'),
            filter=Q(time_entries__check_out__isnull=False)),
        timedelta(0),
    )
)
```

`completion_percentage` is capped at 100 but `total_hours` is not: a student who
works past their target keeps accumulating, and the ranking reflects it.

## Weeks

A week runs **Monday 00:00:00 to Sunday 23:59:59.999** in `America/Sao_Paulo`.

An entry belongs to the week of its **`check_in`**. A session that starts at
23:30 on Friday and ends at 01:15 on Saturday counts entirely toward the Friday
week. Splitting sessions across week boundaries would make the arithmetic
unexplainable to the students, and the case is rare.

`week_start` is always the Monday date, and it is the key used by `WeeklyAlert`.

## Ranking

`GET /api/ranking/`

- Ordered by **total accumulated hours, descending**. Absolute hours, not
  percentage of target — the ranking is a group leaderboard, and the raw number
  is what people compare.
- Only closed entries count.
- All students appear, including `COMPLETED` ones, so finished students do not
  vanish from the board.
- Ties share a position: two students on 40h are both 3rd, and the next is 5th
  (standard competition ranking).
- The ranking is public to any authenticated user. Everyone in GEICIS sees
  everyone's totals — that is the point of it.
- Each row carries: position, name, internship, total hours, hours this week, and
  percentage of the student's own target.

## Weekly alert

The rule the whole scheduler exists for.

**When** — every Friday at 23:59, `America/Sao_Paulo`, via cron:

```
59 23 * * 5   cd /srv/geicis-ponto/backend && python manage.py send_weekly_alerts
```

**Who gets an e-mail** — a student is alerted when *all* of:

1. `status == ACTIVE`
2. `user.is_active` is true
3. hours logged in the current week (Monday 00:00 → the moment the job runs)
   are **strictly less than** `weekly_minimum_hours`
4. no `WeeklyAlert` already exists for that `(student, week_start)`

Condition 4 is what makes the command **idempotent**. Running it twice on the
same Friday sends nothing the second time, so a retry after a crash is safe and
cron misfires are harmless.

**What the e-mail says** — the student's name, hours logged this week, the
weekly minimum, the shortfall, the running total against `required_hours`, and a
link to the dashboard. Plain, not scolding. It is a reminder, not a penalty.

**Recorded either way** — a `WeeklyAlert` row is written whether SMTP succeeds or
fails, with `delivery_status` set accordingly. A failure must be visible to the
coordinator rather than silently swallowed, and the row still blocks a duplicate
send.

**Note the open-entry interaction:** a student clocked in at 23:59 on Friday has
an open entry, and open entries do not count. If that session would have carried
them over the minimum, they still get the e-mail. This is a known and accepted
edge — clocking out is the student's responsibility, and the alternative is
counting hours that have not been worked yet.

## Permissions matrix

| Action                              | Student        | Professor              | Coordinator |
| ----------------------------------- | -------------- | ---------------------- | ----------- |
| Clock in / clock out                | own only       | —                      | —           |
| View own entries                    | ✓              | ✓                      | ✓           |
| View another student's entries      | ✗              | supervised only        | ✓           |
| Correct an entry                    | ✗              | supervised only        | ✓           |
| Edit notes on own entry             | ✓              | ✓                      | ✓           |
| View ranking                        | ✓              | ✓                      | ✓           |
| Create/edit internships             | ✗              | ✗                      | ✓           |
| Create professors/coordinators      | ✗              | ✗                      | ✓           |
| Link professor ↔ student            | ✗              | ✗                      | ✓           |
| Change a student's `required_hours` | ✗              | ✗                      | ✓           |
| View weekly alerts                  | own only       | supervised only        | ✓           |
