import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export const cn = (...parts) => twMerge(clsx(parts))

/* ---------------------------------------------------------------- Button */

const VARIANTS = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  running:
    'bg-emerald-500 text-white hover:bg-emerald-600 focus-visible:ring-emerald-500 dark:bg-emerald-500',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  outline:
    'border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-rose-500 text-white hover:bg-rose-600 focus-visible:ring-rose-500',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
  xl: 'px-8 py-6 text-lg rounded-2xl',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  disabled,
  children,
  ...props
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'dark:focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ Card */

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('card p-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }) {
  return (
    <h2 className={cn('mb-4 text-sm font-semibold uppercase tracking-wide muted', className)}>
      {children}
    </h2>
  )
}

/* ----------------------------------------------------------------- Badge */

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  running: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  primary: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
}

export function Badge({ tone = 'neutral', icon: Icon, children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {/* Status is never carried by colour alone: there is a label, and an icon. */}
      {Icon && <Icon size={12} />}
      {children}
    </span>
  )
}

/* ----------------------------------------------------------------- Input */

export function Field({ label, error, hint, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs muted">{hint}</span>}
      {error && (
        <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </span>
      )}
    </label>
  )
}

export function Input({ className, ...props }) {
  return <input className={cn('field', className)} {...props} />
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn('field', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, rows = 3, ...props }) {
  return <textarea rows={rows} className={cn('field resize-y', className)} {...props} />
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800', className)} />
}

/* ----------------------------------------------------------------- Modal */

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="card w-full max-w-lg animate-fade-up rounded-b-none p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="muted hover:text-slate-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Toast */

const ToastContext = createContext(null)

const TOAST_TONES = {
  success: { cls: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200', Icon: CheckCircle2 },
  error: { cls: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200', Icon: AlertTriangle },
  info: { cls: 'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100', Icon: Info },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, tone = 'info') => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list, { id, message, tone }])
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {toasts.map(({ id, message, tone }) => {
          const { cls, Icon } = TOAST_TONES[tone] ?? TOAST_TONES.info
          return (
            <div
              key={id}
              className={cn(
                'pointer-events-auto flex animate-slide-in items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg',
                cls,
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">{message}</span>
              <button onClick={() => dismiss(id)} className="opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast precisa estar dentro de ToastProvider')
  return ctx
}
