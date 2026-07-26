# Data Model

Every entity, field, and constraint. The visual counterpart is
[diagrams/er-diagram.md](diagrams/er-diagram.md).

## Cardinality summary

| Relationship            | Cardinality | Implemented as                             |
| ----------------------- | ----------- | ------------------------------------------ |
| Professor ↔ Student     | N:M         | `Supervision` join table                   |
| Internship → Student    | 1:N         | `StudentProfile.internship` FK             |
| Student → TimeEntry     | 1:N         | `TimeEntry.student` FK                     |
| Student → WeeklyAlert   | 1:N         | `WeeklyAlert.student` FK                   |
| User → StudentProfile   | 1:1         | `StudentProfile.user` OneToOne             |
| User → ProfessorProfile | 1:1         | `ProfessorProfile.user` OneToOne           |

The internship relationship reads: **one internship hosts many students, one
student holds exactly one internship.** The foreign key therefore lives on the
student, not on the internship.

---

## User

The authentication record. One row per person, whatever their role. Extends
`AbstractBaseUser` + `PermissionsMixin`, and is set as `AUTH_USER_MODEL`.

| Field           | Type              | Rules                                          |
| --------------- | ----------------- | ---------------------------------------------- |
| `id`            | BigAutoField      | PK                                             |
| `email`         | EmailField        | **unique**, `USERNAME_FIELD` — login identifier |
| `full_name`     | CharField(150)    | required                                       |
| `role`          | CharField(16)     | `STUDENT` \| `PROFESSOR` \| `COORDINATOR`      |
| `password`      | CharField(128)    | PBKDF2 hash, never returned by the API         |
| `is_active`     | BooleanField      | default `True`; blocks login when `False`      |
| `is_staff`      | BooleanField      | `True` only for `COORDINATOR`                  |
| `date_joined`   | DateTimeField     | auto                                           |
| `last_login`    | DateTimeField     | auto, set by SimpleJWT                         |

Login is by e-mail, not username — the students already identify themselves that
way and the alert e-mails go to the same address, so there is no second contact
field to keep in sync.

---

## StudentProfile

The student side of a `User`. Created together with the user during registration.

| Field                   | Type                | Rules                                                        |
| ----------------------- | ------------------- | ------------------------------------------------------------ |
| `id`                    | BigAutoField        | PK                                                           |
| `user`                  | OneToOne(User)      | `on_delete=CASCADE`, `related_name='student_profile'`         |
| `registration_number`   | CharField(32)       | **unique** — matrícula                                        |
| `internship`            | FK(Internship)      | `on_delete=PROTECT`, nullable until assigned                 |
| `required_hours`        | PositiveIntegerField| total hours the internship demands; asked at registration    |
| `weekly_minimum_hours`  | PositiveIntegerField| hours expected per week; drives the Friday alert             |
| `started_at`            | DateField           | first day of the internship                                  |
| `expected_end_at`       | DateField           | nullable; deadline for `required_hours`                      |
| `status`                | CharField(16)       | `ACTIVE` \| `COMPLETED` \| `SUSPENDED` \| `WITHDRAWN`        |
| `created_at`            | DateTimeField       | auto                                                         |
| `updated_at`            | DateTimeField       | auto                                                         |

**Constraints**

- `required_hours > 0`
- `weekly_minimum_hours > 0`
- `weekly_minimum_hours <= required_hours`
- `expected_end_at IS NULL OR expected_end_at >= started_at`

`internship` uses `PROTECT` deliberately: deleting a placement that still has
students attached would orphan real hour records. The coordinator has to move the
students first, or deactivate the internship instead of deleting it.

**Derived values** (computed, never stored — see
[business-rules.md](business-rules.md#hour-computation)):
`total_hours`, `remaining_hours`, `completion_percentage`, `current_week_hours`.

---

## ProfessorProfile

| Field         | Type            | Rules                                            |
| ------------- | --------------- | ------------------------------------------------ |
| `id`          | BigAutoField    | PK                                               |
| `user`        | OneToOne(User)  | `on_delete=CASCADE`, `related_name='professor_profile'` |
| `siape`       | CharField(32)   | **unique**, nullable — institutional registration |
| `department`  | CharField(120)  | optional                                          |
| `created_at`  | DateTimeField   | auto                                              |

---

## Internship

A placement: the host organization or project where students intern. Shared by
many students.

| Field              | Type            | Rules                                  |
| ------------------ | --------------- | -------------------------------------- |
| `id`               | BigAutoField    | PK                                     |
| `title`            | CharField(150)  | required — e.g. "Infraestrutura — TRE-PE" |
| `organization`     | CharField(150)  | required — host institution             |
| `description`      | TextField       | optional                                |
| `supervisor_name`  | CharField(150)  | optional — contact at the organization  |
| `supervisor_email` | EmailField      | optional                                |
| `is_active`        | BooleanField    | default `True`                          |
| `created_at`       | DateTimeField   | auto                                    |
| `updated_at`       | DateTimeField   | auto                                    |

**Constraints**

- `unique(title, organization)` — no two identical placements

---

## Supervision

The many-to-many join between professors and students. A separate model rather
than a bare `ManyToManyField`, because the relationship carries its own data and
will grow.

| Field         | Type                    | Rules                                  |
| ------------- | ----------------------- | -------------------------------------- |
| `id`          | BigAutoField            | PK                                     |
| `professor`   | FK(ProfessorProfile)    | `on_delete=CASCADE`, `related_name='supervisions'` |
| `student`     | FK(StudentProfile)      | `on_delete=CASCADE`, `related_name='supervisions'` |
| `role`        | CharField(16)           | `ADVISOR` \| `CO_ADVISOR`, default `ADVISOR` |
| `created_at`  | DateTimeField           | auto                                    |

**Constraints**

- `unique(professor, student)` — the same pair cannot be linked twice
- At most one `ADVISOR` per student — enforced in the serializer, since a partial
  unique index on `(student)` where `role='ADVISOR'` is the database half

---

## TimeEntry

One clock-in/clock-out pair. The heart of the system.

| Field         | Type                | Rules                                                 |
| ------------- | ------------------- | ----------------------------------------------------- |
| `id`          | BigAutoField        | PK                                                    |
| `student`     | FK(StudentProfile)  | `on_delete=CASCADE`, `related_name='time_entries'`     |
| `check_in`    | DateTimeField       | required, set on clock-in                             |
| `check_out`   | DateTimeField       | **nullable** — null means the entry is open           |
| `notes`       | CharField(255)      | optional, what was worked on                          |
| `adjusted_by` | FK(User)            | nullable, `on_delete=SET_NULL` — who corrected it     |
| `adjustment_reason` | CharField(255) | required when `adjusted_by` is set                    |
| `created_at`  | DateTimeField       | auto                                                  |
| `updated_at`  | DateTimeField       | auto                                                  |

**Constraints**

- `check_out IS NULL OR check_out > check_in`
- **At most one open entry per student** — partial unique index on `student`
  where `check_out IS NULL`. This is a database constraint, not just a serializer
  check: a double-tapped clock-in button must not be able to create two open
  entries.
- `check_in <= now()` — no clocking in from the future

**Index**: `(student, check_in)` — every ranking, summary, and weekly query
filters on exactly that pair.

Duration is **not** a stored column. It is `check_out - check_in`, computed in
the query. Storing it would create a second source of truth that a correction
could leave stale.

---

## WeeklyAlert

The audit trail of Friday warnings. Its unique constraint is what makes the
weekly job safe to re-run.

| Field              | Type                | Rules                                    |
| ------------------ | ------------------- | ---------------------------------------- |
| `id`               | BigAutoField        | PK                                       |
| `student`          | FK(StudentProfile)  | `on_delete=CASCADE`, `related_name='weekly_alerts'` |
| `week_start`       | DateField           | the Monday of the week evaluated         |
| `hours_logged`     | DecimalField(6,2)   | hours the student had in that week       |
| `minimum_required` | DecimalField(6,2)   | the target at evaluation time            |
| `sent_at`          | DateTimeField       | when the e-mail actually left            |
| `delivery_status`  | CharField(16)       | `SENT` \| `FAILED`                       |
| `error_message`    | CharField(255)      | populated when `FAILED`                  |

**Constraints**

- `unique(student, week_start)` — one alert per student per week, forever

`minimum_required` is copied in rather than read back from the profile, because
the coordinator may change a student's weekly minimum later and the historical
record should still say what was actually demanded that week.

---

## Deletion behaviour, at a glance

| Deleting…    | Effect                                                              |
| ------------ | ------------------------------------------------------------------- |
| `User`       | cascades to its profile, and from there to entries and alerts       |
| `Internship` | **blocked** while any student references it (`PROTECT`)             |
| `Professor`  | cascades to `Supervision` rows only; students are untouched         |
| `TimeEntry`  | hard delete, coordinator only, logged in the Django admin log       |
