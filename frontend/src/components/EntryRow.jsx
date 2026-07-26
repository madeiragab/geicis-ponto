import { PencilLine } from 'lucide-react'
import { Badge } from './ui'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function EntryRow({ entry, onAdjust, showStudent = false }) {
  const checkIn = new Date(entry.check_in)
  const checkOut = entry.check_out ? new Date(entry.check_out) : null

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800/60">
      <div className="w-12 shrink-0">
        <p className="tabular text-sm font-semibold">{dateFmt.format(checkIn)}</p>
        <p className="text-[10px] uppercase muted">
          {checkIn.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        {showStudent && (
          <p className="truncate text-sm font-medium">{entry.student_name}</p>
        )}
        <p className="tabular text-sm">
          {timeFmt.format(checkIn)}
          {' → '}
          {checkOut ? timeFmt.format(checkOut) : <span className="muted">em aberto</span>}
        </p>
        {entry.notes && <p className="truncate text-xs muted">{entry.notes}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {entry.is_open && entry.is_stale && (
          <Badge tone="danger">esquecido</Badge>
        )}
        {entry.is_open && !entry.is_stale && <Badge tone="running">rodando</Badge>}
        {entry.was_adjusted && (
          <span title={entry.adjustment_reason}>
            <Badge tone="neutral" icon={PencilLine}>
              ajustado
            </Badge>
          </span>
        )}
        {entry.duration_hours != null && (
          <span className="tabular w-16 text-right text-sm font-semibold">
            {Number(entry.duration_hours).toFixed(2)}h
          </span>
        )}
        {onAdjust && (
          <button
            onClick={() => onAdjust(entry)}
            className="rounded-lg p-1.5 muted transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Ajustar registro"
          >
            <PencilLine size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
