import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  CircleAlert, Eye, EyeOff, GraduationCap, Loader2, Lock, Mail,
  Radio, ScanFace, ShieldCheck, Sparkles, UserCheck, Zap,
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
    text: 'Automated 128-d face embedding recognition running on-device for immediate check-in.',
  },
  {
    icon: ShieldCheck,
    title: 'Anti-Spoofing Liveness Check',
    text: 'Multi-frame verification actively rejects photo prints and mobile screen replays.',
  },
  {
    icon: Radio,
    title: 'Real-Time Campus Telemetry',
    text: 'Instant live roster synchronization between classroom cameras and teacher dashboard.',
  },
]

const STATS = [
  { value: '99.8%', label: 'Recognition Precision' },
  { value: '< 250ms', label: 'Average Check-in' },
  { value: '100%', label: 'Contactless' },
]

const inputClass =
  'h-11 w-full rounded-xl border border-slate-300/80 bg-slate-50/50 pl-10 text-xs text-slate-900 ' +
  'placeholder:text-slate-400 outline-none transition-all duration-150 ' +
  'focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-500/15'

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
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* Left panel — soothing deep slate-teal atmosphere */}
      <aside className="relative hidden w-[500px] shrink-0 flex-col justify-between overflow-hidden border-r border-slate-800/80 bg-[#0e1e30] p-10 text-white lg:flex xl:w-[550px] xl:p-12">
        {/* Soft atmospheric background glows */}
        <div className="pointer-events-none absolute -left-16 -top-16 h-80 w-80 rounded-full bg-teal-600/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-80 w-80 rounded-full bg-sky-600/15 blur-3xl" />

        {/* Top — institution branding */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-950/70 text-teal-300 shadow-xs">
            <GraduationCap size={24} />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold tracking-tight text-white">Khulna University of Engineering &amp; Technology</p>
            <p className="text-xs font-medium text-slate-400">Department of Computer Science &amp; Engineering</p>
          </div>
        </div>

        {/* Center — system info & face recognition statement */}
        <div className="relative z-10 my-auto py-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-950/60 px-3.5 py-1.5 text-xs font-semibold text-teal-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
            </span>
            <span>AI Face Recognition · Active</span>
          </div>

          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
            Smart Attendance &amp; <br />
            <span className="bg-gradient-to-r from-teal-300 via-teal-200 to-sky-300 bg-clip-text text-transparent">
              Face Recognition Access
            </span>
          </h1>

          <p className="mt-3 text-xs sm:text-sm leading-relaxed text-slate-300">
            Automated face recognition check-in system designed for KUET academic laboratories and lecture halls.
          </p>

          {/* Recognition Precision Stats bar */}
          <div className="mt-6 grid grid-cols-3 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 backdrop-blur-xs">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-base font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Feature items */}
          <div className="mt-6 space-y-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group flex gap-3.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-all duration-200 hover:border-teal-500/40 hover:bg-white/[0.05]"
              >
                <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-950/60 text-teal-300">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-100">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — network footer */}
        <div className="relative z-10 flex items-center justify-between border-t border-slate-800/80 pt-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-teal-400" />
            <span className="font-medium text-slate-300">KUET Campus Network · Active</span>
          </div>
          <span className="text-[11px] text-slate-500">v2.4</span>
        </div>
      </aside>

      {/* Right — sign-in form */}
      <main className="flex flex-1 flex-col justify-between">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            {/* Mobile logo header */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-2xs">
                <GraduationCap size={22} />
              </div>
              <div>
                <p className="font-display font-bold text-slate-800">Smart Attendance System</p>
                <p className="text-xs text-slate-500">KUET CSE Department</p>
              </div>
            </div>

            {/* Title Header */}
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-800">
                Sign in to your portal
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                Authenticate with your university credentials to continue.
              </p>
            </div>

            {/* Students Google Auth Container */}
            <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-800">
                  <UserCheck size={14} />
                  <span>Student Sign-in</span>
                </div>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-semibold text-teal-800">
                  @stud.kuet.ac.bd
                </span>
              </div>
              <GoogleButton
                onCredential={handleGoogle}
                onDevLogin={handleDevLogin}
                onError={setError}
                disabled={loading}
              />
              <p className="mt-2.5 text-center text-[11px] text-slate-500 leading-relaxed">
                First-time student? Sign in with your varsity Google account to complete one-time face registration.
              </p>
            </div>

            {/* Soothing Divider */}
            <div className="relative my-7 text-center">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#f8fafc] px-3 font-semibold tracking-wider text-slate-400">
                  Or faculty &amp; staff login
                </span>
              </div>
            </div>

            {/* Staff Credentials Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Faculty / Staff Email
                </label>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
                  <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    Password
                  </label>
                  <button type="button" className="text-xs font-semibold text-teal-700 hover:text-teal-800 transition cursor-pointer">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer"
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
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 font-display text-xs font-bold text-white shadow-2xs transition-all duration-200 hover:bg-teal-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verifying session…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In as Staff</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick-fill testing buttons */}
            {import.meta.env.DEV && (
              <div className="mt-6 rounded-2xl border border-dashed border-teal-200 bg-teal-50/30 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                    <Sparkles size={13} className="text-teal-700" /> Quick-Fill Credentials
                  </p>
                  <span className="text-[10px] font-medium text-teal-600">1-click test</span>
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
                      className="flex flex-col items-start rounded-xl border border-slate-200/80 bg-white p-2.5 text-left shadow-2xs transition-all hover:border-teal-400 hover:shadow-2xs active:scale-[0.98] cursor-pointer"
                    >
                      <span className="font-display text-xs font-bold text-slate-800">{d.label}</span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[140px]">{d.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="px-6 pb-6 text-center text-xs text-slate-400">
          &copy; 2026 Khulna University of Engineering &amp; Technology · CSE Department
        </p>
      </main>
    </div>
  )
}