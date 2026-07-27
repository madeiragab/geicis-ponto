# Frontend Specification

🇧🇷 [Português](pt-br/frontend-spec.md) | 🇺🇸 **English**

React + Vite + Tailwind CSS, the same stack as the `social-network` frontend
(axios, lucide-react, clsx, tailwind-merge). A single-page app that consumes the
REST API and renders nothing server-side.

## Design direction

The system is used in short bursts — a student opens it, taps one button, and
leaves. Everything is arranged around that.

- **One primary action per screen.** On the student dashboard it is a single
  large button that is either "Bater entrada" or "Bater saída". Never both.
- **Numbers are the ornament.** Big hour counters, a progress ring, a ranking
  podium. There is no decorative illustration anywhere — the data is the visual
  interest.
- **Motion means something.** The running timer ticks, the progress bar animates
  when it grows, the ranking rows stagger in on load. Nothing animates that is
  not reporting a change.
- **Dark and light**, following `prefers-color-scheme` with a manual toggle.

### Palette

| Token         | Light                | Dark                 | Used for                       |
| ------------- | -------------------- | -------------------- | ------------------------------ |
| `surface`     | `slate-50`           | `slate-950`          | page background                |
| `card`        | `white`              | `slate-900`          | panels                         |
| `border`      | `slate-200`          | `slate-800`          | dividers                       |
| `text`        | `slate-900`          | `slate-100`          | primary text                   |
| `muted`       | `slate-500`          | `slate-400`          | labels, secondary text         |
| `primary`     | `indigo-600`         | `indigo-400`         | clock in, links, active states  |
| `running`     | `emerald-500`        | `emerald-400`        | an open entry, met targets     |
| `warning`     | `amber-500`          | `amber-400`          | below the weekly minimum       |
| `danger`      | `rose-500`           | `rose-400`           | stale entries, destructive     |

Semantic, not decorative: green always means "counting or on target", amber
always means "behind", rose always means "something is wrong with this record".

Accessibility: every pairing meets WCAG AA (4.5:1) in both themes, and status is
never carried by colour alone — the badge has a label and an icon too.

## Screens

### `/login`
E-mail and password, centered card, GEICIS wordmark. On success stores the token
pair and redirects by role. One generic error message for bad credentials.

### `/register`
Student self-registration. Two steps, so the form never looks like a wall:

1. Identity — name, e-mail, registration number, password + confirmation, with a
   live strength meter mirroring Django's validators.
2. Internship — internship select (from `?minimal=true`), **total required
   hours**, **weekly minimum hours**, start date, expected end date.

Step 2 shows a live sentence under the fields: *"20h/semana até 15/12/2026 dá
cerca de 400h — sua meta é 300h."* It is a hint, not a validation; it just makes
an unrealistic pair of numbers obvious before submitting.

### `/` — Student dashboard

The screen that matters. Top to bottom:

1. **The button.** Full-width, tall, unmissable.
   - Idle → indigo, "Bater entrada".
   - Running → emerald, "Bater saída", with a live `HH:MM:SS` timer counting up
     from `check_in` and a soft pulse on the border. The timer is computed from
     the server's `check_in`, never from a client-side start moment, so a page
     refresh or a sleeping laptop cannot drift it.
2. **Progress ring** — `completion_percentage`, with `total_hours` of
   `required_hours` in the middle and `remaining_hours` below.
3. **Week strip** — seven cells, Monday to Sunday, filled by hours logged per
   day, with the weekly minimum drawn as a line across them. Amber while the week
   is short, emerald once the minimum is met.
4. **Ranking position card** — "4º de 23", tappable through to `/ranking`.
5. **Recent entries** — last ten, date, in, out, duration, and an "ajustado"
   badge where `adjusted_by` is set.

If an entry has been open for more than 16 hours, a rose banner sits above
everything: *"Você tem um ponto aberto desde sexta às 14:02. Peça a um professor
para corrigir."*

### `/ranking`

The screen the group actually opens.

- **Podium** for the top three — 1st raised in the middle, avatars as initials,
  hour totals large.
- **Table** below: position, name, internship, total hours, hours this week, and
  a thin per-row progress bar for the student's own percentage. The current
  user's row is highlighted and sticks to the bottom of the viewport when it
  scrolls out of view, so you never lose your own line.
- **Filters**: internship, professor, active only.
- Rows stagger in on load, and positions animate when the list reorders after a
  clock-out.

Sorting is by absolute hours. The percentage bar is context, not the sort key.

### `/entries`
Full history, paginated, filterable by date range and week. CSV export for the
coordinator.

### `/students/:id`
Everything from the student dashboard, read-only, for supervisors. Adds the
correction dialog for professors — set the missing timestamp, type the reason,
submit. The reason field is required and the submit button stays disabled until
it has content.

### `/admin-panel` — Coordinator
One request to `/api/dashboard/`: counts by status, group total, who is clocked
in right now, who is below their weekly minimum, top 5. Plus CRUD for
internships, students, professors, and the professor↔student links, and the
weekly alert log with a filter for `delivery_status=FAILED`.

## Components

```
components/
├── ui/            Button, Card, Badge, Modal, Input, Select, Toast, Skeleton
├── ClockButton    the state machine: idle | running | submitting | error
├── LiveTimer      ticks from a server check_in, resync-safe
├── ProgressRing   SVG ring, animated arc
├── WeekStrip      seven day cells + the minimum line
├── RankingPodium  top three
├── RankingTable   sortable, sticky own-row
├── EntryRow       one time entry + adjusted badge
├── EntryAdjustModal
└── StatCard       label, big number, delta
```

## Data flow

- `axios` instance with a request interceptor attaching the bearer token, and a
  response interceptor that catches `401 TOKEN_EXPIRED`, refreshes once, and
  replays the original request. Concurrent 401s queue behind a single refresh.
- `AuthContext` holds the user, the role, and the token pair. Tokens live in
  memory with the refresh token in an `httpOnly` cookie where deployment allows
  it; `localStorage` is the documented fallback with its trade-off acknowledged.
- Route guards by role. Guards are convenience only — the API enforces the same
  rules, so a hand-edited route reaches a 403, not data.
- `POST /check-out/` returns the updated summary, so the dashboard updates from
  the response. No refetch, no flash of stale numbers.
- `GET /time-entries/current/` runs on mount and on window focus, which is how a
  student who clocked in on their phone sees the running timer on a laptop.

## Error handling

The API returns `error.message` as user-facing Portuguese, so it renders straight
into a toast. The frontend branches on `error.code` for the two that need special
handling:

| Code                 | UI response                                                 |
| -------------------- | ----------------------------------------------------------- |
| `ENTRY_ALREADY_OPEN` | swap to the running state using the entry in `details`       |
| `NO_OPEN_ENTRY`      | swap to the idle state and refetch `current`                 |
| everything else      | toast with `error.message`                                   |

Both special cases mean the UI drifted from the server. Neither shows an error —
the screen just corrects itself, because the student did nothing wrong.

## Responsiveness

Mobile first. Students clock in from their phones, standing up, often on the way
in or out. The clock button is thumb-reachable at the bottom of the viewport on
small screens, the ranking table collapses to cards under `sm`, and the
coordinator panel is the only view that assumes a desktop width.
