import { Badge } from './ui'
import { CheckCircle2, TrendingDown } from 'lucide-react'

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

/**
 * Hours logged this week against the weekly minimum.
 *
 * Amber while the week is short, emerald once the minimum is met — the same
 * meaning those colours carry everywhere else in the app.
 */
export default function WeekStrip({ hoursThisWeek = 0, minimum = 0, perDay = null }) {
  const logged = Number(hoursThisWeek) || 0
  const min = Number(minimum) || 0
  const met = logged >= min
  const pct = min > 0 ? Math.min(100, (logged / min) * 100) : 0

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <span className="tabular text-3xl font-bold">{logged.toFixed(1)}h</span>
          <span className="ml-1 text-sm muted">de {min}h nesta semana</span>
        </div>
        <Badge tone={met ? 'running' : 'warning'} icon={met ? CheckCircle2 : TrendingDown}>
          {met ? 'Mínimo batido' : `Faltam ${Math.max(0, min - logged).toFixed(1)}h`}
        </Badge>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            met ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {perDay && (
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {DAYS.map((label, index) => {
            const value = Number(perDay[index] ?? 0)
            const intensity = min > 0 ? Math.min(1, value / (min / 5)) : 0
            return (
              <div key={label} className="text-center">
                <div
                  className="mx-auto flex h-12 w-full items-end justify-center rounded-lg bg-slate-100 dark:bg-slate-800"
                  title={`${label}: ${value.toFixed(1)}h`}
                >
                  <div
                    className="w-full rounded-lg bg-indigo-500 transition-all duration-500"
                    style={{ height: `${Math.max(6, intensity * 100)}%`, opacity: value ? 1 : 0.15 }}
                  />
                </div>
                <span className="mt-1 block text-[10px] muted">{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
