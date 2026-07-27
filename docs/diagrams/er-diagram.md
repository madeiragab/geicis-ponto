# Entity–Relationship Diagram

🇧🇷 [Português](../pt-br/diagrams/er-diagram.md) | 🇺🇸 **English**

Relational schema. Field-level rules are in [../data-model.md](../data-model.md).

```mermaid
erDiagram
    USER ||--o| STUDENT_PROFILE   : "is"
    USER ||--o| PROFESSOR_PROFILE : "is"
    USER ||--o{ TIME_ENTRY        : "adjusts"

    INTERNSHIP ||--o{ STUDENT_PROFILE : "hosts"

    PROFESSOR_PROFILE ||--o{ SUPERVISION : "supervises through"
    STUDENT_PROFILE   ||--o{ SUPERVISION : "supervised through"

    STUDENT_PROFILE ||--o{ TIME_ENTRY   : "logs"
    STUDENT_PROFILE ||--o{ WEEKLY_ALERT : "receives"

    USER {
        bigint   id PK
        varchar  email UK "login identifier"
        varchar  full_name
        varchar  role "STUDENT|PROFESSOR|COORDINATOR"
        varchar  password "PBKDF2 hash"
        boolean  is_active
        boolean  is_staff
        datetime date_joined
        datetime last_login
    }

    STUDENT_PROFILE {
        bigint   id PK
        bigint   user_id FK,UK
        varchar  registration_number UK
        bigint   internship_id FK "PROTECT, nullable"
        int      required_hours "asked at registration"
        int      weekly_minimum_hours "drives Friday alert"
        date     started_at
        date     expected_end_at "nullable"
        varchar  status "ACTIVE|COMPLETED|SUSPENDED|WITHDRAWN"
        datetime created_at
        datetime updated_at
    }

    PROFESSOR_PROFILE {
        bigint   id PK
        bigint   user_id FK,UK
        varchar  siape UK "nullable"
        varchar  department
        datetime created_at
    }

    INTERNSHIP {
        bigint   id PK
        varchar  title
        varchar  organization
        text     description
        varchar  supervisor_name
        varchar  supervisor_email
        boolean  is_active
        datetime created_at
        datetime updated_at
    }

    SUPERVISION {
        bigint   id PK
        bigint   professor_id FK
        bigint   student_id FK
        varchar  role "ADVISOR|CO_ADVISOR"
        datetime created_at
    }

    TIME_ENTRY {
        bigint   id PK
        bigint   student_id FK
        datetime check_in
        datetime check_out "NULL means open"
        varchar  notes
        bigint   adjusted_by_id FK "nullable, SET_NULL"
        varchar  adjustment_reason
        datetime created_at
        datetime updated_at
    }

    WEEKLY_ALERT {
        bigint   id PK
        bigint   student_id FK
        date     week_start "the Monday"
        decimal  hours_logged
        decimal  minimum_required
        datetime sent_at
        varchar  delivery_status "SENT|FAILED"
        varchar  error_message
    }
```

## The two relationships that were specified explicitly

```mermaid
flowchart TB
    subgraph M2M["Professor ↔ Student — N:M"]
        direction LR
        P1["Prof. Ana"] --- S1["Maria"]
        P1 --- S2["João"]
        P2["Prof. Bruno"] --- S1
        P2 --- S3["Lucas"]
    end

    subgraph O2M["Internship → Student — 1:N"]
        direction LR
        I1["Internship<br/>TRE-PE"] --> A1["Maria"]
        I1 --> A2["João"]
        I2["Internship<br/>UFPE Labs"] --> A3["Lucas"]
    end
```

A professor has many students and a student has many professors, so the pair
needs the `SUPERVISION` join table. An internship hosts many students but a
student holds exactly one internship, so a single foreign key on
`STUDENT_PROFILE` is enough — no join table, and the "only one internship" rule
is structural rather than validated.

## Constraints that live in the database

These are database-level, not serializer-level. A race, a retry, or a direct
`psql` session cannot get around them.

| Table             | Constraint                                             | Protects against                     |
| ----------------- | ------------------------------------------------------ | ------------------------------------ |
| `USER`            | `unique(email)`                                        | duplicate accounts                   |
| `STUDENT_PROFILE` | `unique(registration_number)`                          | duplicate students                   |
| `STUDENT_PROFILE` | `required_hours > 0`, `weekly_minimum_hours > 0`       | nonsense targets                     |
| `STUDENT_PROFILE` | `weekly_minimum_hours <= required_hours`               | unreachable weekly target            |
| `STUDENT_PROFILE` | `expected_end_at >= started_at`                        | inverted period                      |
| `STUDENT_PROFILE` | FK `internship` `ON DELETE PROTECT`                    | orphaning hour records               |
| `INTERNSHIP`      | `unique(title, organization)`                          | duplicate placements                 |
| `SUPERVISION`     | `unique(professor_id, student_id)`                     | duplicate links                      |
| `SUPERVISION`     | partial `unique(student_id) where role='ADVISOR'`      | two main advisors                    |
| `TIME_ENTRY`      | `check_out IS NULL OR check_out > check_in`            | negative durations                   |
| `TIME_ENTRY`      | **partial `unique(student_id) where check_out IS NULL`** | two open entries from a double-click |
| `TIME_ENTRY`      | index `(student_id, check_in)`                         | slow ranking and weekly queries      |
| `WEEKLY_ALERT`    | `unique(student_id, week_start)`                       | duplicate Friday e-mails             |

The two in bold type matter most: the partial unique on open entries is what
makes clock-in safe under a double-tap, and the unique on `(student, week_start)`
is what makes the Friday job safe to re-run.
