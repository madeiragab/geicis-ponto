import { useState } from 'react'
import { Crown } from 'lucide-react'
import { cn } from './ui'

export function Avatar({ src, name, size = 36, ring = false, className }) {
  return (
    <img
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={cn(
        'shrink-0 rounded-full object-cover bg-slate-200 dark:bg-slate-800',
        ring && 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950',
        className,
      )}
      style={{ width: size, height: size }}
    />
  )
}

/**
 * The ranking as a chart: one horizontal bar per student, magnitude encoded by
 * length (total hours), identity encoded by the student's own photo rather
 * than by color — so the bar fill stays a single flat hue and "you" is
 * highlighted through a ring on the avatar, not a different color per rank.
 */
export function RankingChart({ rows = [], meId }) {
  const [hovered, setHovered] = useState(null)
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm muted">Nenhum aluno no ranking ainda.</p>
  }

  const max = Math.max(...rows.map((r) => Number(r.total_hours) || 0), 1)

  return (
    <div className="space-y-1">
      {rows.map((row, index) => {
        const isMe = row.student_id === meId
        const total = Number(row.total_hours) || 0
        const pct = Math.min(100, Number(row.completion_percentage) || 0)
        const widthPct = Math.max(3, (total / max) * 100)
        const isTop = row.position === 1
        const isHovered = hovered === row.student_id

        return (
          <div
            key={row.student_id}
            className={cn(
              'group relative flex animate-fade-up items-center gap-3 rounded-xl px-2 py-1.5 transition-colors',
              isMe && 'bg-indigo-50/70 dark:bg-indigo-500/10',
            )}
            style={{ animationDelay: `${Math.min(index, 14) * 30}ms` }}
            onMouseEnter={() => setHovered(row.student_id)}
            onMouseLeave={() => setHovered((h) => (h === row.student_id ? null : h))}
          >
            <span className="tabular w-6 shrink-0 text-right text-xs font-semibold muted">
              {row.position}º
            </span>

            <div className="relative shrink-0">
              <Avatar src={row.avatar_url} name={row.full_name} size={36} ring={isMe} />
              {isTop && (
                <Crown
                  size={14}
                  className="absolute -right-1 -top-1.5 rotate-12 text-amber-500 drop-shadow"
                  fill="currentColor"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {row.full_name}
                  {isMe && <span className="ml-1 text-xs text-indigo-500">(você)</span>}
                </span>
                <span className="tabular shrink-0 text-sm font-semibold">
                  {total.toFixed(1)}h
                </span>
              </div>
              {/* Thin mark, rounded ends, single flat hue — length is the only
                  encoding of magnitude here. */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-700 ease-out',
                    isMe ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-indigo-400 dark:bg-indigo-500/70',
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>

            {isHovered && (
              <div className="pointer-events-none absolute left-14 top-full z-10 mt-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <p className="font-medium">{row.internship || 'Sem estágio'}</p>
                <p className="tabular muted">
                  {Number(row.current_week_hours).toFixed(1)}h esta semana · {pct.toFixed(0)}% da meta
                </p>
              </div>
            )}
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
                  <div className="flex items-center gap-2">
                    <Avatar src={row.avatar_url} name={row.full_name} size={24} />
                    <span className="truncate">
                      {row.full_name}
                      {isMe && <span className="ml-1 text-xs text-indigo-500">(você)</span>}
                      {row.status === 'COMPLETED' && (
                        <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                          concluído
                        </span>
                      )}
                    </span>
                  </div>
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
