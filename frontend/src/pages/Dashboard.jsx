import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Trophy } from 'lucide-react'
import { apiError } from '../api/client'
import { students, timeEntries } from '../api/endpoints'
import { useAuth } from '../context/AuthContext'
import ClockButton from '../components/ClockButton'
import ProgressRing from '../components/ProgressRing'
import WeekStrip from '../components/WeekStrip'
import EntryRow from '../components/EntryRow'
import { Card, CardTitle, Skeleton, useToast } from '../components/ui'

export default function Dashboard() {
  const { profile, isStudent, user } = useAuth()
  const { push } = useToast()
  const [summary, setSummary] = useState(null)
  const [openEntry, setOpenEntry] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const studentId = profile?.id

  const load = useCallback(async () => {
    if (!studentId) {
      setLoading(false)
      return
    }
    try {
      const [summaryRes, currentRes, listRes] = await Promise.all([
        students.summary(studentId),
        timeEntries.current(),
        timeEntries.list({ student: studentId }),
      ])
      setSummary(summaryRes.data)
      setOpenEntry(currentRes.data.open_entry)
      setRecent(listRes.data.results?.slice(0, 10) ?? [])
    } catch (err) {
      push(apiError(err).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [studentId, push])

  useEffect(() => {
    load()
  }, [load])

  // A student who clocked in on their phone sees the running timer here.
  useEffect(() => {
    const onFocus = () => {
      if (!studentId) return
      timeEntries
        .current()
        .then(({ data }) => setOpenEntry(data.open_entry))
        .catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [studentId])

  async function handleCheckIn() {
    setBusy(true)
    try {
      const { data } = await timeEntries.checkIn('')
      setOpenEntry(data)
      push('Entrada registrada. Bom trabalho!', 'success')
    } catch (err) {
      const error = apiError(err)
      if (error.code === 'ENTRY_ALREADY_OPEN') {
        // The UI drifted from the server. Correct it silently — the student
        // did nothing wrong.
        const { data } = await timeEntries.current()
        setOpenEntry(data.open_entry)
      } else {
        push(error.message, 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckOut() {
    setBusy(true)
    try {
      const { data } = await timeEntries.checkOut()
      setOpenEntry(null)
      // The response carries the updated summary, so the counters and the
      // progress ring refresh without a second request.
      setSummary((current) => (current ? { ...current, ...data.summary } : current))
      setRecent((list) => [data.entry, ...list].slice(0, 10))
      push(`Saída registrada — ${Number(data.entry.duration_hours).toFixed(2)}h.`, 'success')
      load()
    } catch (err) {
      const error = apiError(err)
      if (error.code === 'NO_OPEN_ENTRY') {
        setOpenEntry(null)
        load()
      } else {
        push(error.message, 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!isStudent) {
    return (
      <Card>
        <CardTitle>Bem-vindo, {user?.full_name}</CardTitle>
        <p className="text-sm muted">
          Sua conta é de {user?.role === 'PROFESSOR' ? 'professor' : 'coordenação'}. Use o{' '}
          <Link to="/ranking" className="text-indigo-600 hover:underline dark:text-indigo-400">
            ranking
          </Link>{' '}
          e os{' '}
          <Link to="/registros" className="text-indigo-600 hover:underline dark:text-indigo-400">
            registros
          </Link>{' '}
          para acompanhar os alunos.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  const staleOpen = openEntry?.is_stale

  return (
    <div className="space-y-5">
      {staleOpen && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            Você tem um ponto aberto desde{' '}
            <strong>
              {new Date(openEntry.check_in).toLocaleString('pt-BR', {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>
            . Enquanto ele estiver aberto, essas horas não contam. Peça a um professor para
            corrigir o registro.
          </p>
        </div>
      )}

      <ClockButton
        openEntry={openEntry}
        onCheckIn={handleCheckIn}
        onCheckOut={handleCheckOut}
        busy={busy}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex items-center justify-center">
          <ProgressRing
            percentage={summary?.completion_percentage}
            total={summary?.total_hours}
            required={summary?.required_hours}
            remaining={summary?.remaining_hours}
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Esta semana</CardTitle>
            <WeekStrip
              hoursThisWeek={summary?.current_week_hours}
              minimum={summary?.weekly_minimum_hours}
            />
          </Card>

          <Link to="/ranking" className="block">
            <Card className="flex items-center gap-4 transition hover:border-indigo-400 hover:shadow-md">
              <div className="rounded-xl bg-amber-100 p-2.5 dark:bg-amber-500/15">
                <Trophy size={20} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide muted">Sua posição</p>
                <p className="tabular text-2xl font-bold">
                  {summary?.ranking_position ? `${summary.ranking_position}º` : '—'}
                </p>
              </div>
              <span className="ml-auto text-sm muted">ver ranking →</span>
            </Card>
          </Link>
        </div>
      </div>

      <Card>
        <CardTitle>Últimos registros</CardTitle>
        {recent.length === 0 ? (
          <p className="py-6 text-center text-sm muted">
            Nenhum registro ainda. Bata sua primeira entrada acima.
          </p>
        ) : (
          recent.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </Card>

      {summary?.last_8_weeks?.length > 0 && (
        <Card>
          <CardTitle>Últimas semanas</CardTitle>
          <div className="flex items-end gap-2">
            {summary.last_8_weeks.map((week) => {
              const value = Number(week.hours)
              const max = Math.max(
                ...summary.last_8_weeks.map((w) => Number(w.hours)),
                Number(summary.weekly_minimum_hours),
              )
              const height = max > 0 ? (value / max) * 100 : 0
              return (
                <div key={week.week_start} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <div
                      className={`w-full rounded-t-lg transition-all duration-500 ${
                        week.target_met ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ height: `${Math.max(4, height)}%` }}
                      title={`${value.toFixed(1)}h`}
                    />
                  </div>
                  <span className="tabular text-[10px] muted">{value.toFixed(0)}h</span>
                  <span className="text-[9px] muted">
                    {new Date(`${week.week_start}T00:00:00`).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
