import { CircleAlert, Info, Loader2 } from 'lucide-react'

export function Card({ title, subtitle, action, icon: Icon, children, className = '', hover = false, variant = 'default' }) {
  const variantStyles = {
    default: 'bg-white border-slate-200/80 shadow-2xs',
    glass: 'bg-white/90 backdrop-blur-md border-slate-200/70 shadow-2xs',
    subtle: 'bg-slate-50/70 border-slate-200/60',
  }

  return (
    <section
      className={`rounded-2xl border transition-all duration-200 ${variantStyles[variant]} ${
        hover ? 'hover:shadow-xs hover:border-slate-300' : ''
      } ${className}`}
    >
      {(title || action || Icon) && (
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <div className="flex h-7.5 w-7.5 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Icon size={16} />
              </div>
            )}
            <div>
              <h3 className="font-display text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500 ${className}`} role="status">
      <div className="relative flex h-8 w-8 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-teal-600" />
      </div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Spinner label="Loading application..." />
    </div>
  )
}

export function ErrorBox({ children, className = '' }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className={`animate-fade-in flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-800 shadow-2xs ${className}`}
    >
      <CircleAlert size={16} className="mt-0.5 shrink-0 text-rose-600" />
      <div className="flex-1 font-medium leading-relaxed">{children}</div>
    </div>
  )
}

export function InfoBox({ children, className = '' }) {
  if (!children) return null
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3.5 text-xs text-teal-900 shadow-2xs ${className}`} >
      <Info size={16} className="mt-0.5 shrink-0 text-teal-600" />
      <div className="flex-1 leading-relaxed text-teal-800">{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="relative mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <Icon size={22} className="text-slate-500" />
        </div>
      )}
      <p className="font-display text-sm font-semibold text-slate-800">{title}</p>
      {text && <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const BADGE_CONFIG = {
  green: {
    bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    dot: 'bg-emerald-500',
  },
  amber: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200/70',
    dot: 'bg-amber-500',
  },
  red: {
    bg: 'bg-rose-50 text-rose-700 border-rose-200/70',
    dot: 'bg-rose-500',
  },
  slate: {
    bg: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
  brand: {
    bg: 'bg-teal-50 text-teal-800 border-teal-200/70',
    dot: 'bg-teal-600',
  },
}

export function Badge({ tone = 'slate', withDot = false, children, className = '' }) {
  const cfg = BADGE_CONFIG[tone] ?? BADGE_CONFIG.slate
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-semibold tracking-tight border transition-colors ${cfg.bg} ${className}`}
    >
      {withDot && <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />}
      {children}
    </span>
  )
}

export const GRADE_TONE = { full: 'green', partial: 'amber', incomplete: 'red', no_classes: 'slate' }
export const STATUS_TONE = { present: 'green', late: 'amber', absent: 'red' }
export const STATUS_LABEL = { present: 'Present', late: 'Late', absent: 'Absent' }

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', ...props }) {
  const sizeStyles = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9.5 px-4 text-xs font-semibold gap-2',
    lg: 'h-11 px-5 text-sm font-semibold gap-2.5',
  }

  const variantStyles = {
    primary:
      'bg-teal-700 text-white shadow-2xs hover:bg-teal-800 active:scale-[0.99] border border-teal-600/30',
    secondary:
      'border border-slate-300/90 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 active:scale-[0.99]',
    ghost:
      'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.99]',
    danger:
      'bg-rose-600 text-white shadow-2xs hover:bg-rose-700 active:scale-[0.99]',
    outline:
      'border border-teal-700 text-teal-700 hover:bg-teal-50 active:scale-[0.99]',
  }

  return (
    <button
      disabled={loading || props.disabled}
      {...props}
      className={`inline-flex items-center justify-center rounded-xl transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
        sizeStyles[size]
      } ${variantStyles[variant]} ${className}`}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  )
}

export const inputClass =
  'h-10 w-full rounded-xl border border-slate-300/80 bg-white px-3.5 text-xs text-slate-900 shadow-2xs ' +
  'placeholder:text-slate-400 outline-none transition-all duration-150 ' +
  'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 hover:border-slate-400 ' +
  'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-200'

export function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-rose-600 animate-fade-in">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      )}
    </div>
  )
}
