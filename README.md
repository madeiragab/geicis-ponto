# GEICIS Ponto

Internship time-tracking system for **GEICIS — Grupo de Estudos em Infraestrutura
Computacional e Impacto Social**.

Students clock in and clock out. The system accumulates their hours, ranks them,
and emails whoever falls short of the weekly minimum every Friday at 23:59.

## Status

**Working.** Backend and frontend are implemented against the design below, with
52 passing backend tests. The domain model and the API contract were settled in
`docs/` before any code was written, so implementation had nothing left to guess.

## Running it locally

Backend — Django on `:8000`:

```bash
cd backend && python -m venv venv && venv/Scripts/pip install -r requirements.txt && venv/Scripts/python manage.py migrate && venv/Scripts/python manage.py runserver
```

Frontend — Vite on `:5173`, proxying `/api` to the backend:

```bash
cd frontend && npm install && npm run dev
```

Demo data (refuses to run unless `DEBUG=True`):

```bash
cd backend && venv/Scripts/python manage.py seed_demo
```

That creates three placements, two professors, and seven students with eight
weeks of backdated hours. Logins are `coord@geicis.br`, `ana.correia@geicis.br`
and `maria.souza@geicis.br`, all with the password `GeicisDemo!2026`.

The weekly job, which cron runs at `59 23 * * 5`:

```bash
cd backend && venv/Scripts/python manage.py send_weekly_alerts --dry-run
```

Tests:

```bash
cd backend && venv/Scripts/python manage.py test apps
```

## Stack

| Layer      | Choice                                          |
| ---------- | ----------------------------------------------- |
| Backend    | Django + Django REST Framework                  |
| Auth       | SimpleJWT (access 1h / refresh 7d)              |
| Database   | SQLite in development, PostgreSQL in production |
| Frontend   | React + Vite + Tailwind CSS                     |
| Scheduling | Django management command driven by cron        |

Everything the frontend does goes through the REST API. There are no Django
server-rendered pages other than the admin.

## Documentation

| Document                                             | What it covers                                          |
| ---------------------------------------------------- | ------------------------------------------------------- |
| [architecture.md](docs/architecture.md)              | Layers, responsibilities, project layout, deployment    |
| [data-model.md](docs/data-model.md)                  | Every entity, field, and database constraint            |
| [business-rules.md](docs/business-rules.md)          | Clock-in/out rules, hour math, ranking, weekly alert    |
| [api.md](docs/api.md)                                | Full REST surface, payloads, permissions, error codes   |
| [frontend-spec.md](docs/frontend-spec.md)            | Screens, components, states, visual direction           |
| [decisions.md](docs/decisions.md)                    | Why each significant choice was made, and what was not  |

## Diagrams

| Diagram                                                          | What it shows                            |
| ---------------------------------------------------------------- | ---------------------------------------- |
| [er-diagram.md](docs/diagrams/er-diagram.md)                     | Relational schema and cardinalities      |
| [class-diagram.md](docs/diagrams/class-diagram.md)               | Domain classes and their behaviour       |
| [sequence-diagrams.md](docs/diagrams/sequence-diagrams.md)       | Clock-in/out, ranking, weekly alert      |
| [state-diagram.md](docs/diagrams/state-diagram.md)               | TimeEntry and StudentProfile lifecycles  |

All diagrams are Mermaid inside Markdown, so they render directly on GitHub and
stay reviewable in diffs.

## Core relationships in one breath

- A **professor** supervises many **students**, and a student may have many
  professors — many-to-many, through `Supervision`.
- An **internship** hosts many **students**, and a student holds exactly one
  internship — one-to-many, `StudentProfile.internship` is the foreign key.
- A **student** logs many **time entries**, at most one of them open at a time.

## Roadmap

1. ~~Domain modeling and documentation~~
2. ~~Backend: models, migrations, admin~~
3. ~~Backend: authentication and the time-entry endpoints~~
4. ~~Backend: ranking, summaries, weekly alert command~~
5. ~~Frontend: authentication, clock-in/out screen, ranking~~
6. ~~Frontend: professor and coordinator dashboards~~
7. Deployment ← you are here

Deployment still needs a host, a PostgreSQL instance, real SMTP credentials, and
the cron entry. Nothing in the code assumes SQLite or the console mail backend —
both are read from the environment.
