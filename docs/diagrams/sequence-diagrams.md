# Sequence Diagrams

The four flows that were modeled before implementation.

---

## 1. Student registration

The only flow where `required_hours` and `weekly_minimum_hours` are collected.

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant UI as React SPA
    participant API as DRF API
    participant DB as Database

    S->>UI: opens /register
    UI->>API: GET /api/internships/?active=true&minimal=true
    API->>DB: SELECT active internships
    DB-->>API: list
    API-->>UI: 200 internships
    UI-->>S: form with internship select

    S->>UI: name, e-mail, password, registration nº,<br/>internship, required hours, weekly minimum
    UI->>API: POST /api/auth/register/

    API->>API: validate password (4 validators)
    API->>API: required_hours is positive<br/>weekly_minimum not above required_hours

    alt validation fails
        API-->>UI: 400 VALIDATION_ERROR
        UI-->>S: field-level errors
    else valid
        API->>DB: BEGIN
        API->>DB: INSERT User (role=STUDENT, hashed password)
        API->>DB: INSERT StudentProfile (targets, internship FK)
        API->>DB: COMMIT
        Note over DB: unique(email) and unique(registration_number)<br/>reject duplicates here, not in Python
        DB-->>API: created
        API-->>UI: 201 user + profile
        UI->>API: POST /api/auth/token/
        API-->>UI: access + refresh
        UI-->>S: redirect to dashboard
    end
```

---

## 2. Clock in and clock out

The central interaction. Two buttons, and only ever one of them visible.

```mermaid
sequenceDiagram
    autonumber
    actor S as Student
    participant UI as React SPA
    participant API as DRF API
    participant SVC as TimesheetService
    participant DB as Database

    Note over S,DB: — page load —
    UI->>API: GET /api/time-entries/current/
    API->>DB: SELECT entry WHERE student=me AND check_out IS NULL
    DB-->>API: none
    API-->>UI: { open_entry: null }
    UI-->>S: renders "Bater entrada"

    Note over S,DB: — clock in —
    S->>UI: clicks "Bater entrada"
    UI->>API: POST /api/time-entries/check-in/
    API->>SVC: clock_in(student, notes)
    SVC->>SVC: student.status == ACTIVE?
    SVC->>DB: INSERT TimeEntry (check_in = now(), check_out = NULL)

    alt a second request races the first
        DB-->>SVC: IntegrityError — partial unique on open entries
        SVC-->>API: raise EntryAlreadyOpen
        API-->>UI: 409 ENTRY_ALREADY_OPEN + existing entry
        UI-->>S: shows the running timer instead
    else first request wins
        DB-->>SVC: entry #881
        SVC-->>API: entry
        API-->>UI: 201 entry
        UI-->>S: running timer, "Bater saída" button
    end

    Note over S,DB: — hours later —
    S->>UI: clicks "Bater saída"
    UI->>API: POST /api/time-entries/check-out/
    API->>SVC: clock_out(student)
    SVC->>DB: SELECT open entry FOR UPDATE

    alt no open entry
        DB-->>SVC: none
        API-->>UI: 409 NO_OPEN_ENTRY
    else found
        SVC->>DB: UPDATE check_out = now()
        Note over DB: CHECK constraint holds —<br/>check_out is after check_in
        SVC->>DB: SELECT SUM(check_out - check_in) for totals
        DB-->>SVC: 147.0h total, 16.49h this week
        SVC-->>API: entry + summary
        API-->>UI: 200 { entry, summary }
        UI-->>S: duration, updated total, progress bar,<br/>new ranking position — no second request
    end
```

---

## 3. Ranking

```mermaid
sequenceDiagram
    autonumber
    actor U as Any authenticated user
    participant UI as React SPA
    participant API as DRF API
    participant RS as RankingService
    participant DB as Database

    U->>UI: opens /ranking
    UI->>API: GET /api/ranking/?internship=3
    API->>RS: build(filters)

    RS->>DB: SELECT student, user.full_name, internship.title,<br/>SUM(check_out - check_in) AS total_hours<br/>FROM student LEFT JOIN time_entry<br/>WHERE check_out IS NOT NULL<br/>GROUP BY student ORDER BY total_hours DESC

    Note over DB: one query, index (student_id, check_in)<br/>open entries excluded by the WHERE

    DB-->>RS: ordered rows
    RS->>RS: assign positions,<br/>ties share a position
    RS-->>API: rows
    API-->>UI: 200 { generated_at, results }
    UI-->>U: podium for top 3, table below,<br/>own row highlighted
```

---

## 4. Weekly alert — Friday 23:59

The flow the scheduler exists for.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as cron (Friday 23:59)
    participant CMD as send_weekly_alerts
    participant SVC as WeeklyAlertService
    participant DB as Database
    participant SMTP as SMTP
    actor S as Student

    Cron->>CMD: manage.py send_weekly_alerts
    CMD->>SVC: run(today)
    SVC->>SVC: monday = week_start(today)<br/>America/Sao_Paulo

    SVC->>DB: SELECT students WHERE status = ACTIVE<br/>AND user.is_active<br/>ANNOTATE week_hours = SUM(closed entries since monday)<br/>HAVING week_hours under weekly_minimum_hours
    DB-->>SVC: candidates

    loop for each candidate
        SVC->>DB: INSERT WeeklyAlert (student, monday, ...)

        alt alert already exists for (student, monday)
            DB-->>SVC: IntegrityError — unique(student, week_start)
            SVC->>SVC: skip — already warned this week
            Note over SVC: this is what makes a re-run harmless
        else new row
            DB-->>SVC: alert #40
            SVC->>SMTP: send e-mail — hours logged,<br/>minimum, shortfall, running total, link

            alt delivery ok
                SMTP-->>SVC: accepted
                SVC->>DB: UPDATE delivery_status = SENT
                SMTP-->>S: 📧 reminder
            else delivery failed
                SMTP-->>SVC: error
                SVC->>DB: UPDATE delivery_status = FAILED,<br/>error_message = ...
                Note over DB: the row stays — the coordinator<br/>sees the failure at /weekly-alerts/?delivery_status=FAILED
            end
        end
    end

    SVC-->>CMD: AlertReport (evaluated, sent, skipped, failed)
    CMD-->>Cron: prints the report, exit 0
```

**Why the `WeeklyAlert` row is written before the e-mail is sent:** the unique
constraint has to be claimed first. If the e-mail went out first and the process
died before the insert, a re-run would mail the student twice. In the other
order, a crash at worst leaves a row whose `delivery_status` never left its
initial value — visible, and fixable, and not a duplicate in someone's inbox.

---

## 5. Professor corrects a forgotten clock-out

```mermaid
sequenceDiagram
    autonumber
    actor P as Professor
    participant UI as React SPA
    participant API as DRF API
    participant DB as Database

    P->>UI: opens a supervised student's entries
    UI->>API: GET /api/time-entries/?student=12
    API->>DB: check Supervision(professor=me, student=12)
    alt not supervised
        API-->>UI: 404 NOT_FOUND
        Note over API: 404, not 403 — the API does not confirm<br/>a record exists to someone who may not see it
    else supervised
        DB-->>API: entries
        API-->>UI: 200 (entry #881 flagged: open 19h)
    end

    P->>UI: sets check_out, types the reason
    UI->>API: PATCH /api/time-entries/881/
    API->>API: adjustment_reason present?
    alt missing
        API-->>UI: 400 ADJUSTMENT_REASON_REQUIRED
    else present
        API->>DB: UPDATE check_out, adjusted_by = me, adjustment_reason
        DB-->>API: ok
        API-->>UI: 200 entry (marked as adjusted)
        UI-->>P: row shows the "ajustado" badge and the reason on hover
    end
```
