# API Reference

🇧🇷 [Português](pt-br/api.md) | 🇺🇸 **English**

Base URL: `/api/`
All requests and responses are JSON. All timestamps are ISO 8601 with offset
(`2026-07-24T14:03:00-03:00`). All hour values are decimal numbers with two
decimal places.

## Authentication

JWT via `rest_framework_simplejwt`, the same setup as the `social-network`
project: access token valid for **1 hour**, refresh token for **7 days**.

Every endpoint except `POST /auth/token/`, `POST /auth/token/refresh/`, and
`POST /auth/register/` requires:

```
Authorization: Bearer <access_token>
```

`DEFAULT_PERMISSION_CLASSES` is `IsAuthenticated`, so a forgotten decorator fails
closed rather than open.

### Hardening beyond the social-network baseline

Time entries are auditable records, so three settings are tightened:

| Setting                    | Value  | Why                                                       |
| -------------------------- | ------ | --------------------------------------------------------- |
| `ROTATE_REFRESH_TOKENS`    | `True` | a stolen refresh token is invalidated on next legitimate use |
| `BLACKLIST_AFTER_ROTATION` | `True` | makes rotation meaningful; enables real logout            |
| Throttling on login        | `5/min` per IP | brute-force resistance on the only password endpoint |

Passwords are hashed by Django (PBKDF2-SHA256) and checked against the four
standard validators. They are never accepted or returned by any read endpoint.

---

### `POST /auth/token/`

```json
{ "email": "aluno@geicis.br", "password": "..." }
```

**200**
```json
{
  "access": "eyJ...",
  "refresh": "eyJ...",
  "user": {
    "id": 12,
    "email": "aluno@geicis.br",
    "full_name": "Maria Souza",
    "role": "STUDENT"
  }
}
```

**401** `INVALID_CREDENTIALS` — same message for wrong e-mail and wrong password,
so the endpoint does not confirm which addresses exist.

### `POST /auth/token/refresh/`

```json
{ "refresh": "eyJ..." }
```
**200** → `{ "access": "eyJ...", "refresh": "eyJ..." }` (rotated)

### `POST /auth/logout/`

Blacklists the supplied refresh token. **204**.

### `POST /auth/register/`

Public. Creates a `User` with role `STUDENT` **and** its `StudentProfile`, in one
transaction.

```json
{
  "email": "maria@geicis.br",
  "full_name": "Maria Souza",
  "password": "...",
  "password_confirm": "...",
  "registration_number": "20231044",
  "internship_id": 3,
  "required_hours": 300,
  "weekly_minimum_hours": 20,
  "started_at": "2026-08-01",
  "expected_end_at": "2026-12-15"
}
```

**201** → the created user plus its profile.
**400** → field errors; see [Errors](#errors).

`role` is not accepted here. Privileged accounts are created by a coordinator
through `POST /users/`.

### `GET /auth/me/`

The authenticated user, with the matching profile inlined and, for students, the
computed summary.

---

## Internships

| Method   | Path                            | Who         |
| -------- | ------------------------------- | ----------- |
| `GET`    | `/internships/`                 | any         |
| `POST`   | `/internships/`                 | coordinator |
| `GET`    | `/internships/{id}/`            | any         |
| `PATCH`  | `/internships/{id}/`            | coordinator |
| `DELETE` | `/internships/{id}/`            | coordinator |
| `GET`    | `/internships/{id}/students/`   | any         |

`GET /internships/` is public to authenticated users and also un-paginated when
called with `?active=true&minimal=true`, because the registration form needs the
full list in a select.

Query params: `?active=true|false`, `?search=<title or organization>`

**Internship object**
```json
{
  "id": 3,
  "title": "Infraestrutura de Redes",
  "organization": "TRE-PE",
  "description": "Suporte à infraestrutura...",
  "supervisor_name": "Carlos Lima",
  "supervisor_email": "carlos@tre-pe.jus.br",
  "is_active": true,
  "student_count": 7,
  "created_at": "2026-03-01T09:00:00-03:00"
}
```

**409** `INTERNSHIP_HAS_STUDENTS` on `DELETE` while students still reference it.

---

## Students

| Method  | Path                          | Who                          |
| ------- | ----------------------------- | ---------------------------- |
| `GET`   | `/students/`                  | any                          |
| `GET`   | `/students/{id}/`             | any                          |
| `PATCH` | `/students/{id}/`             | coordinator (see below)      |
| `GET`   | `/students/{id}/summary/`     | self, supervisor, coordinator |
| `GET`   | `/students/{id}/professors/`  | any                          |

A student may `PATCH` their own `started_at` and profile contact fields.
`required_hours`, `weekly_minimum_hours`, `internship`, and `status` are
coordinator-only — a student cannot lower their own target.

Query params: `?internship=<id>`, `?status=ACTIVE`, `?professor=<id>`,
`?search=<name or registration_number>`

**Student object**
```json
{
  "id": 12,
  "user": { "id": 12, "full_name": "Maria Souza", "email": "maria@geicis.br" },
  "registration_number": "20231044",
  "internship": { "id": 3, "title": "Infraestrutura de Redes", "organization": "TRE-PE" },
  "required_hours": 300,
  "weekly_minimum_hours": 20,
  "total_hours": 142.5,
  "remaining_hours": 157.5,
  "completion_percentage": 47.5,
  "current_week_hours": 12.0,
  "status": "ACTIVE",
  "started_at": "2026-08-01",
  "expected_end_at": "2026-12-15"
}
```

### `GET /students/{id}/summary/`

```json
{
  "student_id": 12,
  "total_hours": 142.5,
  "required_hours": 300,
  "remaining_hours": 157.5,
  "completion_percentage": 47.5,
  "current_week_hours": 12.0,
  "weekly_minimum_hours": 20,
  "weekly_target_met": false,
  "ranking_position": 4,
  "open_entry": null,
  "last_8_weeks": [
    { "week_start": "2026-06-01", "hours": 18.5, "target_met": false },
    { "week_start": "2026-06-08", "hours": 22.0, "target_met": true }
  ]
}
```

`last_8_weeks` is what the dashboard chart draws. It is returned inline to keep
the dashboard at one request.

---

## Professors and supervisions

| Method   | Path                          | Who         |
| -------- | ----------------------------- | ----------- |
| `GET`    | `/professors/`                | any         |
| `GET`    | `/professors/{id}/`           | any         |
| `GET`    | `/professors/{id}/students/`  | any         |
| `POST`   | `/users/`                     | coordinator |
| `GET`    | `/supervisions/`              | any         |
| `POST`   | `/supervisions/`              | coordinator |
| `DELETE` | `/supervisions/{id}/`         | coordinator |

`POST /supervisions/`
```json
{ "professor_id": 5, "student_id": 12, "role": "ADVISOR" }
```

**409** `SUPERVISION_ALREADY_EXISTS` — that pair is already linked.
**409** `STUDENT_ALREADY_HAS_ADVISOR` — role `ADVISOR` when one is already set.

---

## Time entries

The core of the system.

| Method   | Path                           | Who                            |
| -------- | ------------------------------ | ------------------------------ |
| `POST`   | `/time-entries/check-in/`      | student (self)                 |
| `POST`   | `/time-entries/check-out/`     | student (self)                 |
| `GET`    | `/time-entries/current/`       | student (self)                 |
| `GET`    | `/time-entries/`               | scoped by role                 |
| `GET`    | `/time-entries/{id}/`          | scoped by role                 |
| `PATCH`  | `/time-entries/{id}/`          | supervisor or coordinator      |
| `DELETE` | `/time-entries/{id}/`          | coordinator                    |

### `POST /time-entries/check-in/`

```json
{ "notes": "Configuração do rack" }
```
`notes` is optional. **No timestamp is accepted** — the server uses its own clock.

**201**
```json
{
  "id": 881,
  "student_id": 12,
  "check_in": "2026-07-24T13:02:11-03:00",
  "check_out": null,
  "duration_hours": null,
  "notes": "Configuração do rack",
  "is_open": true
}
```

**409** `ENTRY_ALREADY_OPEN` — body carries the existing open entry.
**403** `STUDENT_NOT_ACTIVE` — profile status is not `ACTIVE`.

### `POST /time-entries/check-out/`

Empty body. Closes the caller's open entry.

**200**
```json
{
  "entry": {
    "id": 881,
    "check_in": "2026-07-24T13:02:11-03:00",
    "check_out": "2026-07-24T17:31:40-03:00",
    "duration_hours": 4.49,
    "is_open": false
  },
  "summary": {
    "total_hours": 147.0,
    "current_week_hours": 16.49,
    "completion_percentage": 49.0,
    "ranking_position": 4
  }
}
```

Returning the updated summary alongside the entry means the clock-out screen
updates the counters and the progress bar without a second round trip.

**409** `NO_OPEN_ENTRY`

### `GET /time-entries/current/`

**200** with the open entry, or `{ "open_entry": null }`. This is what the UI
polls on load to decide whether to render "Clock in" or a running timer.

### `GET /time-entries/`

Scoped automatically: a student sees only their own, a professor sees their own
plus their supervised students', a coordinator sees everything. Paginated, 20 per
page, newest first.

Query params: `?student=<id>`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD`,
`?week=YYYY-MM-DD` (any date inside the week), `?open=true`

### `PATCH /time-entries/{id}/`

```json
{
  "check_out": "2026-07-24T18:00:00-03:00",
  "adjustment_reason": "Aluno esqueceu de bater a saída"
}
```

`adjustment_reason` is **required** whenever `check_in` or `check_out` changes.
`adjusted_by` is stamped from the token. A student sending this gets **403**; a
student may PATCH only `notes` on their own entry.

**400** `ADJUSTMENT_REASON_REQUIRED`
**400** `CHECKOUT_BEFORE_CHECKIN`

---

## Ranking

### `GET /ranking/`

Ordered by total hours, descending. Available to any authenticated user.

Query params: `?internship=<id>`, `?professor=<id>`, `?status=ACTIVE`,
`?limit=<n>`

```json
{
  "generated_at": "2026-07-24T18:12:00-03:00",
  "results": [
    {
      "position": 1,
      "student_id": 7,
      "full_name": "João Ferreira",
      "internship": "Infraestrutura de Redes",
      "total_hours": 210.0,
      "current_week_hours": 24.0,
      "required_hours": 300,
      "completion_percentage": 70.0,
      "status": "ACTIVE"
    }
  ]
}
```

Ties share a position and the next position skips accordingly.

### `GET /dashboard/`

Coordinator view, one request: student counts by status, total hours logged by
the group, students currently clocked in, students below their weekly minimum
right now, and the top 5 of the ranking.

---

## Weekly alerts

| Method | Path                    | Who                                   |
| ------ | ----------------------- | ------------------------------------- |
| `GET`  | `/weekly-alerts/`       | scoped: own / supervised / all        |
| `GET`  | `/weekly-alerts/{id}/`  | same scoping                          |

Read-only over HTTP. Alerts are created only by the scheduled command — there is
no endpoint that sends an e-mail on demand, so the API cannot be turned into a
mailing tool.

Query params: `?student=<id>`, `?week_start=YYYY-MM-DD`, `?delivery_status=FAILED`

```json
{
  "id": 40,
  "student": { "id": 12, "full_name": "Maria Souza" },
  "week_start": "2026-07-20",
  "hours_logged": 12.0,
  "minimum_required": 20.0,
  "shortfall_hours": 8.0,
  "sent_at": "2026-07-24T23:59:04-03:00",
  "delivery_status": "SENT"
}
```

---

## Errors

Uniform shape across the API:

```json
{
  "error": {
    "code": "ENTRY_ALREADY_OPEN",
    "message": "Você já tem um ponto aberto desde 24/07 às 13:02.",
    "details": { "open_entry_id": 881 }
  }
}
```

`message` is user-facing Portuguese and safe to render directly. `code` is what
the frontend branches on.

| HTTP | Code                          | Meaning                                      |
| ---- | ----------------------------- | -------------------------------------------- |
| 400  | `VALIDATION_ERROR`            | field errors in `details`                    |
| 400  | `ADJUSTMENT_REASON_REQUIRED`  | timestamp changed without a reason           |
| 400  | `CHECKOUT_BEFORE_CHECKIN`     | inverted interval                            |
| 401  | `INVALID_CREDENTIALS`         | login failed                                 |
| 401  | `TOKEN_EXPIRED`               | access token expired — refresh and retry     |
| 403  | `PERMISSION_DENIED`           | role does not allow it                       |
| 403  | `STUDENT_NOT_ACTIVE`          | profile status blocks clocking in            |
| 404  | `NOT_FOUND`                   | absent, or outside the caller's scope        |
| 409  | `ENTRY_ALREADY_OPEN`          | open entry exists                            |
| 409  | `NO_OPEN_ENTRY`               | nothing to close                             |
| 409  | `SUPERVISION_ALREADY_EXISTS`  | duplicate professor–student link             |
| 409  | `STUDENT_ALREADY_HAS_ADVISOR` | second `ADVISOR` for the same student        |
| 409  | `INTERNSHIP_HAS_STUDENTS`     | delete blocked by `PROTECT`                  |
| 429  | `THROTTLED`                   | rate limit hit                               |

`404` is returned instead of `403` for records outside the caller's scope, so the
API does not confirm that a record exists to someone not allowed to see it.

## Pagination

Page-number pagination, 20 per page, matching the `social-network` defaults.

```json
{ "count": 143, "next": "...?page=3", "previous": "...?page=1", "results": [] }
```

The ranking and `/internships/?minimal=true` are the exceptions and return the
full set.
