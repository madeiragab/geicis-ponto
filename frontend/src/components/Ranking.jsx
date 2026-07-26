import { Crown, Medal } from 'lucide-react'
import { cn } from './ui'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const PODIUM_STYLES = [
  { order: 'order-2', height: 'h-28', ring: 'ring-amber-400', chip: 'bg-amber-400 text-amber-950' },
  { order: 'order-1', height: 'h-20', ring: 'ring-slate-400', chip: 'bg-slate-300 text-slate-800' },
  { order: 'order-3', height: 'h-16', ring: 'ring-orange-400', chip: 'bg-orange-300 text-orange-950' },
]

export function RankingPodium({ rows = [], meId }) {
  if (rows.length === 0) return null
  const top = rows.slice(0, 3)
  // Visual order is 2nd, 1st, 3rd — first place raised in the middle.
  const arranged = [top[1], top[0], top[2]].filter(Boolean)

  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6">
      {arranged.map((row) => {
        const rank = top.indexOf(row)
        const style = PODIUM_STYLES[rank]
        const isMe = row.student_id === meId
        return (
          <div
            key={row.student_id}
            className={cn('flex flex-1 flex-col items-center animate-fade-up', style.order)}
            style={{ animationDelay: `${rank * 80}ms` }}
          >
            <div
              className={cn(
                'mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-lg font-bold ring-4 dark:bg-slate-800',
                style.ring,
              )}
            >
              {initials(row.full_name)}
            </div>
            <p className="max-w-[7rem] truncate text-center text-sm font-semibold" title={row.full_name}>
              {row.full_name}
              {isMe && <span className="ml-1 text-indigo-500">(você)</span>}
            </p>
            <p className="tabular text-xs muted">{Number(row.total_hours).toFixed(1)}h</p>
            <div
              className={cn(
                'mt-2 flex w-full items-start justify-center rounded-t-xl pt-2 font-bold',
                style.height,
                style.chip,
              )}
            >
              {rank === 0 ? <Crown size={20} /> : <Medal size={18} />}
              <span className="ml-1">{row.position}º</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function RankingTable({ rows = [], meId }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            <th className="w-12 py-2 font-medium muted">#</th>
            <th className="py-2 font-medium muted">Aluno</th>
            <th className="hidden py-2 font-medium muted sm:table-cell">Estágio</th>
            <th className="py-2 text-right font-medium muted">Total</th>
            <th className="hidden py-2 text-right font-medium muted sm:table-cell">Semana</th>
            <th className="hidden w-32 py-2 font-medium muted md:table-cell">Meta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isMe = row.student_id === meId
            const pct = Math.min(100, Number(row.completion_percentage) || 0)
            return (
              <tr
                key={row.student_id}
                className={cn(
                  'animate-fade-up border-b border-slate-100 last:border-0 dark:border-slate-800/60',
                  isMe && 'bg-indigo-50/70 dark:bg-indigo-500/10',
                )}
                style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
              >
                <td className="tabular py-2.5 font-semibold">{row.position}º</td>
                <td className="py-2.5 font-medium">
                  {row.full_name}
                  {isMe && <span className="ml-1 text-xs text-indigo-500">(você)</span>}
                  {row.status === 'COMPLETED' && (
                    <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                      concluído
                    </span>
                  )}
                </td>
                <td className="hidden max-w-[12rem] truncate py-2.5 muted sm:table-cell">
                  {row.internship || '—'}
                </td>
                <td className="tabular py-2.5 text-right font-semibold">
                  {Number(row.total_hours).toFixed(1)}h
                </td>
                <td className="tabular hidden py-2.5 text-right muted sm:table-cell">
                  {Number(row.current_week_hours).toFixed(1)}h
                </td>
                <td className="hidden py-2.5 md:table-cell">
                  {/* Percentage is context, not the sort key — the ranking is
                      ordered by absolute hours. */}
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="tabular w-10 text-right text-xs muted">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="py-8 text-center text-sm muted">Nenhum aluno no ranking ainda.</p>
      )}
    </div>
  )
}
