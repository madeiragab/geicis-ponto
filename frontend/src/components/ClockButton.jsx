import { LogIn, LogOut } from 'lucide-react'
import { Button, cn } from './ui'
import LiveTimer from './LiveTimer'

/**
 * The one primary action on the student dashboard.
 *
 * Idle and running are never both on screen — the button *is* the state, so
 * there is nothing to misread.
 */
export default function ClockButton({ openEntry, onCheckIn, onCheckOut, busy }) {
  const running = Boolean(openEntry)

  return (
    <div className="space-y-3">
      <Button
        variant={running ? 'running' : 'primary'}
        size="xl"
        loading={busy}
        onClick={running ? onCheckOut : onCheckIn}
        className={cn(
          'w-full flex-col gap-1 shadow-lg',
          running && 'animate-pulse-ring',
        )}
      >
        <span className="flex items-center gap-2">
          {running ? <LogOut size={22} /> : <LogIn size={22} />}
          {running ? 'Bater saída' : 'Bater entrada'}
        </span>
        {running && (
          <LiveTimer since={openEntry.check_in} className="text-3xl font-bold tracking-tight" />
        )}
      </Button>

      {running && (
        <p className="text-center text-sm muted">
          Entrada às{' '}
          {new Date(openEntry.check_in).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {openEntry.notes ? ` — ${openEntry.notes}` : ''}
        </p>
      )}
    </div>
  )
}
