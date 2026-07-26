import { Card, cn } from './ui'

export default function StatCard({ label, value, sub, icon: Icon, tone = 'default', className }) {
  const tones = {
    default: 'text-slate-900 dark:text-slate-100',
    running: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-rose-600 dark:text-rose-400',
    primary: 'text-indigo-600 dark:text-indigo-400',
  }

  return (
    <Card className={cn('flex items-center gap-4', className)}>
      {Icon && (
        <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
          <Icon size={20} className={tones[tone]} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide muted">{label}</p>
        <p className={cn('tabular text-2xl font-bold', tones[tone])}>{value}</p>
        {sub && <p className="truncate text-xs muted">{sub}</p>}
      </div>
    </Card>
  )
}
