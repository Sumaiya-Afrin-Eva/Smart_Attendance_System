import { CircleAlert, Info, Loader2 } from 'lucide-react'

export function Card({ title, subtitle, action, icon: Icon, children, className = '', hover = false, variant = 'default' }) {
  const variantStyles = {
    default: 'glass-card',
    interactive: 'glass-card-interactive',
    subtle: 'bg-[#f7f6f2] border border-[#e7e5e0]',
    glow: 'bg-white border-emerald-300 shadow-[0_4px_20px_-2px_rgba(5,150,105,0.1)]',
  }

  return (
    <section
      className={`rounded-2xl transition-all duration-200 ${variantStyles[variant] || variantStyles.default} ${
        hover ? 'hover:border-emerald-300 hover:shadow-md' : ''
      } ${className}`}
    >
      {(title || action || Icon) && (
        <div className="flex items-center justify-between gap-4 border-b border-[#f0eee6] px-6 py-4.5">
          <div className="flex items-center gap-3.5">
            {Icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-50 text-emerald-800 shadow-2xs">
                <Icon size={18} />
              </div>
            )}
            <div>
              <h3 className="font-display text-base font-semibold tracking-tight text-stone-900">{title}</h3>
              {subtitle && <p className="mt-0.5 text-xs sm:text-sm text-stone-500">{subtitle}</p>}
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
    <div className={`flex flex-col items-center justify-center gap-3.5 py-16 text-stone-500 ${className}`} role="status">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-700" />
      </div>
      <span className="text-sm font-medium text-stone-700">{label}</span>
    </div>
  )
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf9f5]">
      <Spinner label="Loading application..." />
    </div>
  )
}

export function ErrorBox({ children, className = '' }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className={`animate-fade-in flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800 shadow-2xs ${className}`}
    >
      <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-600" />
      <div className="flex-1 font-medium leading-relaxed">{children}</div>
    </div>
  )
}

export function InfoBox({ children, className = '' }) {
  if (!children) return null
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950 shadow-2xs ${className}`} >
      <Info size={18} className="mt-0.5 shrink-0 text-emerald-700" />
      <div className="flex-1 leading-relaxed text-emerald-950">{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="relative mb-3.5 flex h-15 w-15 items-center justify-center rounded-2xl border border-stone-200 bg-stone-100/70 text-stone-600 shadow-inner">
          <Icon size={26} className="text-emerald-700" />
        </div>
      )}
      <p className="font-display text-base font-semibold text-stone-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-stone-500 leading-relaxed">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const BADGE_CONFIG = {
  green: {
    bg: 'bg-emerald-50 text-emerald-850 border-emerald-200/80',
    dot: 'bg-emerald-600',
  },
  amber: {
    bg: 'bg-amber-50 text-amber-900 border-amber-200/80',
    dot: 'bg-amber-600',
  },
  red: {
    bg: 'bg-rose-50 text-rose-850 border-rose-200/80',
    dot: 'bg-rose-600',
  },
  slate: {
    bg: 'bg-stone-100 text-stone-750 border-stone-200',
    dot: 'bg-stone-400',
  },
  brand: {
    bg: 'bg-emerald-50 text-emerald-850 border-emerald-200/80',
    dot: 'bg-emerald-600',
  },
  cyan: {
    bg: 'bg-teal-50 text-teal-850 border-teal-200/80',
    dot: 'bg-teal-600',
  },
  violet: {
    bg: 'bg-purple-50 text-purple-850 border-purple-200/80',
    dot: 'bg-purple-600',
  },
}

export function Badge({ tone = 'slate', withDot = false, children, className = '' }) {
  const cfg = BADGE_CONFIG[tone] ?? BADGE_CONFIG.slate
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold tracking-tight border transition-colors ${cfg.bg} ${className}`}
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
    sm: 'h-9 px-3.5 text-xs font-medium gap-1.5',
    md: 'h-10.5 px-4.5 text-sm font-semibold gap-2',
    lg: 'h-12 px-6 text-base font-semibold gap-2.5',
  }

  const variantStyles = {
    primary:
      'bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white font-semibold shadow-sm hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] border border-emerald-900/20',
    secondary:
      'border border-stone-300/90 bg-white text-stone-800 shadow-2xs hover:bg-stone-50 hover:text-stone-950 active:scale-[0.98]',
    ghost:
      'text-stone-600 hover:bg-stone-100 hover:text-stone-900 active:scale-[0.98]',
    danger:
      'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-2xs hover:from-rose-500 hover:to-rose-600 active:scale-[0.98] border border-rose-700/20',
    outline:
      'border border-emerald-800 text-emerald-800 hover:bg-emerald-50 active:scale-[0.98]',
  }

  return (
    <button
      disabled={loading || props.disabled}
      {...props}
      className={`inline-flex items-center justify-center rounded-xl transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
        sizeStyles[size]
      } ${variantStyles[variant]} ${className}`}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export const inputClass =
  'h-11 w-full rounded-xl border border-stone-300/80 bg-white px-4 text-sm text-stone-900 ' +
  'placeholder:text-stone-400 outline-none transition-all duration-150 ' +
  'focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-600/15 hover:border-stone-400 ' +
  'disabled:bg-stone-100/60 disabled:text-stone-400 disabled:cursor-not-allowed aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-200 shadow-2xs'

export function Field({ label, htmlFor, error, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm font-medium text-rose-600 animate-fade-in">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-stone-500">{hint}</p>
      )}
    </div>
  )
}
