import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  CircleAlert, Eye, EyeOff, GraduationCap, Loader2, Lock, Mail,
  Radio, ScanFace, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import GoogleButton from '../../components/GoogleButton'

// Dev-only quick-fill accounts (hidden automatically in production builds)
const DEMO = [
  { label: 'Teacher', email: 'teacher@kuet.ac.bd', password: 'teacher123' },
  { label: 'Student', email: 'student@kuet.ac.bd', password: 'student123' },
  { label: 'Admin', email: 'admin@kuet.ac.bd', password: 'admin123' },
]

const FEATURES = [
  {
    icon: ScanFace,
    title: 'Contactless check-in',
    text: 'Faces are recognized by camera. No queues, no touching.',
  },
  {
    icon: ShieldCheck,
    title: 'Spoof protection',
    text: 'Printed photos and phone screens are rejected by liveness checks.',
  },
  {
    icon: Radio,
    title: 'Live dashboard',
    text: 'Attendance and security alerts update in real time.',
  },
]

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 outline-none transition ' +
  'focus:border-brand focus:ring-4 focus:ring-brand/15'

export default function Login() {
  const { user, login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to={`/${user.role}`} replace />

  // Shared flow for both email/password and Google sign-in
  const submit = async (action) => {
    setError('')
    setLoading(true)
    try {
      const signedIn = await action()
      navigate(`/${signedIn.role}`)
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

  return (
    <div className="flex min-h-screen">
      {/* Left: branding panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:w-1/2 xl:p-16">
        {/* Decorative circles, echoing the project slides */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -right-48 h-[34rem] w-[34rem] rounded-full bg-navy-800/70"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/5"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand">
            <GraduationCap size={24} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Khulna University of Engineering &amp; Technology</p>
            <p className="text-xs text-slate-400">Department of Computer Science &amp; Engineering</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
            Edge-Assisted Smart Attendance
            <br />
            &amp; Access Control System
          </h1>
          <p className="mt-4 text-slate-300">
            Automatic attendance by face recognition, built for the classroom door.
          </p>

          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-brand">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm text-slate-300">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">CSE3200, System Development Project</p>
      </aside>

      {/* Right: sign-in form */}
      <main className="flex flex-1 flex-col bg-white">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">
            {/* Logo shown only on small screens (the branding panel is hidden there) */}
            <div className="mb-8 flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
                <GraduationCap size={20} />
              </div>
              <span className="font-bold text-navy-900">Smart Attendance</span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-navy-900">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Log in with your KUET account to continue.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <div className="relative">
                  <Mail size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@kuet.ac.bd"
                    className={`${inputClass} pr-3`}
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Password
                  </label>
                  {/* Not functional yet: will open the OTP reset flow */}
                  <button type="button" className="text-sm font-medium text-brand hover:text-brand-dark hover:underline">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-slate-400 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                >
                  <CircleAlert size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                {loading ? 'Logging in...' : 'Log in'}
              </button>
            </form>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <GoogleButton
              onCredential={handleGoogle}
              onError={setError}
              disabled={loading}
            />

            {/* Dev only: removed automatically from production builds */}
            {import.meta.env.DEV && (
              <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">Dev only: quick fill</p>
                <div className="flex gap-2">
                  {DEMO.map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => {
                        setEmail(d.email)
                        setPassword(d.password)
                      }}
                      className="flex-1 rounded-md border border-slate-200 bg-white py-1.5 text-xs text-slate-600 hover:border-brand hover:text-brand"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="px-6 pb-6 text-center text-xs text-slate-400">
          &copy; 2026 KUET, Department of CSE
        </p>
      </main>
    </div>
  )
}