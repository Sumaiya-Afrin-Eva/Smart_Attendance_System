import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  CircleAlert, Eye, EyeOff, GraduationCap, Loader2, Lock, Mail,
  Radio, ScanFace, ShieldCheck, Sparkles, UserCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import GoogleButton from '../../components/GoogleButton'

const DEMO = [
  { label: 'Teacher Portal', email: 'teacher@kuet.ac.bd', password: 'teacher123', role: 'Faculty' },
  { label: 'System Admin', email: 'admin@kuet.ac.bd', password: 'admin123', role: 'Administrator' },
]

const FEATURES = [
  {
    icon: ScanFace,
    title: 'Instant Face Recognition',
    text: 'Edge-assisted 128-d facial embedding matching for instant contactless classroom check-in.',
  },
  {
    icon: ShieldCheck,
    title: 'Anti-Spoofing Liveness Verification',
    text: 'Multi-frame verification actively rejects photo prints, digital masks, and replay attacks.',
  },
  {
    icon: Radio,
    title: 'Real-Time Campus Telemetry',
    text: 'Live roster synchronization between classroom camera nodes and faculty dashboards.',
  },
]

const STATS = [
  { value: '99.8%', label: 'Recognition Precision' },
  { value: '< 250ms', label: 'Average Check-in' },
  { value: '100%', label: 'Contactless' },
]

const inputClass =
  'h-11 w-full rounded-xl border border-stone-300/80 bg-white pl-10 text-xs text-stone-900 ' +
  'placeholder:text-stone-400 outline-none transition-all duration-150 ' +
  'focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15'

export default function Login() {
  const { user, loading: checking, login, loginWithGoogle, devLogin } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (checking) return null
  if (user) return <Navigate to={`/${user.role}`} replace />

  const submit = async (action) => {
    setError('')
    setLoading(true)
    try {
      const signedIn = await action()
      const destination = signedIn.role === 'student' && !signedIn.onboarding?.complete
        ? '/student/setup'
        : `/${signedIn.role}`
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    submit(() => login(email, password))
  }

  const handleGoogle = (credential) => submit(() => loginWithGoogle(credential))
  const handleDevLogin = (email) => submit(() => devLogin(email))

  return (
    <div className="flex min-h-screen bg-[#faf9f5]">
      {/* Left panel — Botanical Forest Jade presentation */}
      <aside className="relative hidden w-[500px] shrink-0 flex-col justify-between overflow-hidden border-r border-emerald-950/20 bg-[#0f2e1d] p-10 text-white lg:flex xl:w-[540px] xl:p-12">
        {/* Soft atmospheric ambient light glows */}
        <div className="pointer-events-none absolute -left-16 -top-16 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />

        {/* Top — Institution Branding */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-900/60 text-emerald-300 shadow-sm">
            <GraduationCap size={24} />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold tracking-tight text-white">Khulna University of Engineering &amp; Technology</p>
            <p className="text-xs font-medium text-emerald-200/80">Department of Computer Science &amp; Engineering</p>
          </div>
        </div>

        {/* Center — System Highlights & Biometrics */}
        <div className="relative z-10 my-auto py-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-900/60 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>Edge Biometrics Active</span>
          </div>

          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
            Smart Attendance &amp; <br />
            <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-amber-200 bg-clip-text text-transparent">
              Face Recognition Access
            </span>
          </h1>

          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-emerald-100/80">
            Automated contactless attendance logging powered by edge face recognition algorithms for KUET CSE classrooms and laboratories.
          </p>

          {/* Stats Bar */}
          <div className="mt-6 grid grid-cols-3 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-base font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-emerald-200/70">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="mt-6 space-y-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group flex gap-3.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 transition-all duration-200 hover:border-emerald-400/30 hover:bg-white/[0.06]"
              >
                <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-900/60 text-emerald-300">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-100/70">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status */}
        <div className="relative z-10 flex items-center justify-between border-t border-emerald-800/60 pt-4 text-xs text-emerald-200/80">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-medium text-emerald-100">KUET Campus LAN Online</span>
          </div>
          <span className="font-mono text-[11px] text-emerald-300/60">v2.4-edge</span>
        </div>
      </aside>

      {/* Right — Clean Light Sign-in Container */}
      <main className="flex flex-1 flex-col justify-between overflow-y-auto">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            {/* Mobile Header */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 text-white shadow-2xs">
                <GraduationCap size={22} />
              </div>
              <div>
                <p className="font-display font-bold text-stone-900">Smart Attendance System</p>
                <p className="text-xs text-stone-500">KUET CSE Department</p>
              </div>
            </div>

            {/* Title */}
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900">
                Sign in to your portal
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-stone-500">
                Authenticate with your university credentials to continue.
              </p>
            </div>

            {/* Student Google Auth Container */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
                  <UserCheck size={14} className="text-emerald-700" />
                  <span>Student Sign-in</span>
                </div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  @stud.kuet.ac.bd
                </span>
              </div>
              <GoogleButton
                onCredential={handleGoogle}
                onDevLogin={handleDevLogin}
                onError={setError}
                disabled={loading}
              />
              <p className="mt-2.5 text-center text-[11px] text-stone-500 leading-relaxed">
                First-time student? Sign in with your varsity Google account to complete one-time face registration.
              </p>
            </div>

            {/* Clean Light Divider */}
            <div className="relative my-7 text-center">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#faf9f5] px-3 font-semibold tracking-wider text-stone-400">
                  Or faculty &amp; staff login
                </span>
              </div>
            </div>

            {/* Staff Credentials Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-600">
                  Faculty / Staff Email
                </label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teacher@kuet.ac.bd"
                    className={`${inputClass} pr-3`}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-wider text-stone-600">
                    Password
                  </label>
                  <button type="button" className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition cursor-pointer">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-600 transition cursor-pointer"
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-800 shadow-2xs">
                  <CircleAlert size={16} className="mt-0.5 shrink-0 text-rose-600" />
                  <span className="font-medium leading-relaxed">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 font-display text-xs font-bold text-white shadow-sm transition-all duration-200 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verifying session…</span>
                  </>
                ) : (
                  <span>Sign In as Staff</span>
                )}
              </button>
            </form>

            {/* Quick-fill testing buttons */}
            {import.meta.env.DEV && (
              <div className="mt-6 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <Sparkles size={13} className="text-emerald-700" /> Quick-Fill Credentials
                  </p>
                  <span className="text-[10px] font-medium text-emerald-700">1-click test</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {DEMO.map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => {
                        setEmail(d.email)
                        setPassword(d.password)
                      }}
                      className="flex flex-col items-start rounded-xl border border-stone-200 bg-white p-2.5 text-left shadow-2xs transition-all hover:border-emerald-400 hover:shadow-xs active:scale-[0.98] cursor-pointer"
                    >
                      <span className="font-display text-xs font-bold text-stone-800">{d.label}</span>
                      <span className="text-[10px] text-stone-500 truncate max-w-[140px]">{d.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="px-6 pb-6 text-center text-xs text-stone-400">
          &copy; 2026 Khulna University of Engineering &amp; Technology · CSE Department
        </p>
      </main>
    </div>
  )
}