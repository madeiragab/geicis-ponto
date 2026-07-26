/**
 * Progress toward the student's own required_hours.
 *
 * The arc animates when it grows — motion here reports a change, which is the
 * only reason anything on this page moves.
 */
export default function ProgressRing({ percentage = 0, total = 0, required = 0, remaining = 0 }) {
  const size = 190
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(100, Math.max(0, Number(percentage) || 0))
  const offset = circumference - (pct / 100) * circumference
  const done = pct >= 100

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            className="fill-none stroke-slate-200 dark:stroke-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={
              done
                ? 'fill-none stroke-emerald-500 transition-[stroke-dashoffset] duration-700 ease-out'
                : 'fill-none stroke-indigo-500 transition-[stroke-dashoffset] duration-700 ease-out'
            }
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-4xl font-bold tracking-tight">{Number(total).toFixed(1)}</span>
          <span className="text-sm muted">de {required}h</span>
          <span
            className={`mt-1 tabular text-xs font-semibold ${
              done ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm muted">
        {done ? 'Meta cumprida' : `Faltam ${Number(remaining).toFixed(1)}h`}
      </p>
    </div>
  )
}
