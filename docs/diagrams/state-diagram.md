# State Diagrams

🇧🇷 [Português](../pt-br/diagrams/state-diagram.md) | 🇺🇸 **English**

## TimeEntry

An entry has two real states. The third is a flag, not a state — an adjusted
entry is still closed.

```mermaid
stateDiagram-v2
    [*] --> Open : POST /check-in/<br/>check_in = now(), check_out = NULL

    Open --> Closed : POST /check-out/<br/>check_out = now()
    Open --> Closed : PATCH by professor/coordinator<br/>(forgotten clock-out)
    Open --> Stale : nightly sweep,<br/>open for over 16h

    Stale --> Closed : PATCH by professor/coordinator<br/>+ adjustment_reason
    Stale --> [*] : DELETE by coordinator

    Closed --> Closed : PATCH timestamps<br/>+ adjustment_reason → adjusted_by set
    Closed --> [*] : DELETE by coordinator

    note right of Open
        Does NOT count toward totals,
        ranking, or the weekly minimum.
        At most one per student —
        partial unique index.
    end note

    note right of Stale
        A flag, not a column:
        check_out IS NULL and the
        check_in is older than 16h.
        Never auto-closed — that would
        invent hours nobody worked.
    end note
```

## StudentProfile

```mermaid
stateDiagram-v2
    [*] --> Active : POST /auth/register/

    Active --> Completed : total_hours reaches required_hours<br/>(coordinator confirms)
    Active --> Suspended : coordinator
    Active --> Withdrawn : coordinator

    Suspended --> Active : coordinator
    Completed --> Active : coordinator reopens<br/>(target raised)

    Withdrawn --> [*]

    note right of Active
        The only state that can clock in
        and the only state the Friday
        alert evaluates.
    end note

    note left of Completed
        Keeps every logged hour and
        stays in the ranking. Finished
        students do not disappear
        from the board.
    end note
```

Reaching `required_hours` does **not** flip the status automatically. A
coordinator confirms it, because completing an internship is an administrative
act with paperwork behind it, and hours in the system are evidence for that
decision rather than the decision itself.

## Weekly evaluation cycle

Where a student sits within one week, from the alert's point of view.

```mermaid
stateDiagram-v2
    [*] --> BelowMinimum : Monday 00:00<br/>week_hours = 0

    BelowMinimum --> MinimumMet : accumulated closed hours<br/>reach weekly_minimum_hours
    MinimumMet --> MinimumMet : keeps logging

    BelowMinimum --> Alerted : Friday 23:59<br/>still below → e-mail + WeeklyAlert row
    MinimumMet --> [*] : Friday 23:59 → nothing sent

    Alerted --> Alerted : re-run of the command<br/>→ skipped, unique(student, week_start)
    Alerted --> [*] : week ends

    note right of BelowMinimum
        Only CLOSED entries move a student
        out of this state. A session still
        running at 23:59 on Friday does not
        count — and the e-mail goes out.
    end note
```
