import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  CircleAlert, Eye, EyeOff, Loader2, Lock, Mail,
  UserCheck, CheckCircle2,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import GoogleButton from '../../components/GoogleButton'
import { useEffect } from 'react'
import api from '../../lib/api'

export default function Login() {
  const { user, loading: checking, login, bootstrapAdmin, loginWithGoogle, devLogin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('student') // 'student' | 'staff'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [adminName, setAdminName] = useState('')
  const [creatingAdmin, setCreatingAdmin] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [studentEmail, setStudentEmail] = useState('')
  const [studentPassword, setStudentPassword] = useState('')
  const [showStudentPw, setShowStudentPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const [metaInfo, setMetaInfo] = useState({
    instName: 'Khulna University of Engineering & Technology',
    deptName: 'Department of Computer Science & Engineering',
    instLogo: '/kuet_logo.png'
  })

  useEffect(() => {
    api.get('/meta').then(res => {
      if (res.data?.institution) {
        setMetaInfo(prev => ({...prev, ...res.data.institution}))
      }
    }).catch(err => console.error(err))
  }, [])

  if (checking) return null
  if (user) {
    const defaultRoute = user.role === 'system_admin' ? '/admin' : `/${user.role}`
    return <Navigate to={defaultRoute} replace />
  }

  const submit = async (action) => {
    setError('')
    setLoading(true)
    try {
      const signedIn = await action()
      const destination =
        signedIn.role === 'student' && !signedIn.onboarding?.complete
          ? signedIn.onboarding?.profile && !signedIn.onboarding?.face
            ? '/student/setup/face'
            : '/student/setup'
          : signedIn.role === 'system_admin'
            ? '/admin'
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
    submit(() => creatingAdmin
      ? bootstrapAdmin(email, adminName, password, accessCode)
      : login(email, password, accessCode))
  }

  const handleStudentSubmit = (e) => {
    e.preventDefault()
    submit(() => login(studentEmail, studentPassword))
  }

  const handleGoogle = (credential) => submit(() => loginWithGoogle(credential))
  const handleDevLogin = (email) => submit(() => devLogin(email))

  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[#faf9f5] bg-warm-mesh text-stone-900 px-4 py-6 sm:px-6">
      {/* ─── Top Header Bar ─── */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-stone-200/80 pb-4">
        <div className="flex items-center gap-3">
          <img
            src={metaInfo.instLogo || '/kuet_logo.png'}
            alt="Institution Logo"
            onError={(e) => { e.currentTarget.src = '/kuet_logo.png' }}
            className="h-10 w-10 object-contain drop-shadow-2xs"
          />
          <div>
            <h1 className="font-display text-base sm:text-lg font-bold tracking-tight text-stone-900 leading-tight">
              {metaInfo.instName}
            </h1>
            <p className="text-xs sm:text-sm font-medium text-stone-500">
              {metaInfo.deptName}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
          <span>Biometric System Online</span>
        </div>
      </header>

      {/* ─── Centerpiece Minimalist Portal Card ─── */}
      <main className="my-auto mx-auto w-full max-w-md py-6">
        <div className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white p-7 sm:p-9 shadow-[0_10px_35px_-5px_rgba(28,25,23,0.06),0_1px_3px_rgba(28,25,23,0.03)]">
          {/* Official KUET Logo & Card Title */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-50 p-2 border border-stone-200/80 shadow-2xs">
              <img
                src={metaInfo.instLogo || '/kuet_logo.png'}
                alt="Official Logo"
                onError={(e) => { e.currentTarget.src = '/kuet_logo.png' }}
                className="h-full w-full object-contain"
              />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900">
              Smart Attendance Portal
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-stone-500">
              Sign in to access your attendance records &amp; courses
            </p>
          </div>

          {/* Segmented Role Tabs */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1 border border-stone-200/80">
            <button
              type="button"
              onClick={() => {
                setTab('student')
                setError('')
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                tab === 'student'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <UserCheck size={16} className={tab === 'student' ? 'text-emerald-700' : 'text-stone-400'} />
              <span>Student</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab('staff')
                setError('')
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                tab === 'staff'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              <Lock size={16} className={tab === 'staff' ? 'text-emerald-700' : 'text-stone-400'} />
              <span>Faculty &amp; Staff</span>
            </button>
          </div>

          {/* ─── Tab 1: Student Login (Google & Manual Password) ─── */}
          {tab === 'student' && (
            <div className="space-y-4 animate-fade-in">
              <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4.5">
                <div className="mb-3.5 flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-stone-800">
                    KUET Student Account
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                    @stud.kuet.ac.bd
                  </span>
                </div>

                {/* Google Single Sign-On */}
                <GoogleButton
                  onCredential={handleGoogle}
                  onDevLogin={handleDevLogin}
                  onError={setError}
                  disabled={loading}
                />

                {/* Elegant Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-stone-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-stone-50/90 px-2 font-medium text-stone-400">
                      or sign in with password
                    </span>
                  </div>
                </div>

                {/* Manual Email & Password Form */}
                <form onSubmit={handleStudentSubmit} className="space-y-3">
                  <div>
                    <label
                      htmlFor="student-email"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wider text-stone-600"
                    >
                      Academic Email
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        id="student-email"
                        type="email"
                        required
                        value={studentEmail}
                        onChange={(e) => setStudentEmail(e.target.value)}
                        placeholder="student@stud.kuet.ac.bd"
                        className="w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3.5 py-2.5 text-xs sm:text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-stone-800 placeholder:text-stone-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="student-password"
                      className="mb-1 block text-xs font-semibold uppercase tracking-wider text-stone-600"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        id="student-password"
                        type={showStudentPw ? 'text' : 'password'}
                        required
                        value={studentPassword}
                        onChange={(e) => setStudentPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full rounded-xl border border-stone-200 bg-white pl-10 pr-10 py-2.5 text-xs sm:text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 text-stone-800 placeholder:text-stone-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStudentPw(!showStudentPw)}
                        aria-label={showStudentPw ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
                      >
                        {showStudentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Sign In with Password</span>
                    )}
                  </button>
                </form>

                {error && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs sm:text-sm text-rose-800"
                  >
                    <CircleAlert size={17} className="mt-0.5 shrink-0 text-rose-600" />
                    <span className="font-medium leading-relaxed">{error}</span>
                  </div>
                )}
              </div>

              {/* Student Features Checklist */}
              <div className="space-y-1.5 pt-0.5 text-xs text-stone-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span>Automated biometric facial attendance tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span>Real-time course percentage &amp; class logs</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span>Instant warning alerts for low attendance</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── Tab 2: Faculty & Staff Credentials Form ─── */}
          {tab === 'staff' && (
            <div className="space-y-4 animate-fade-in">
              <form onSubmit={handleSubmit} className="space-y-4">
                {creatingAdmin && (
                  <div>
                    <label htmlFor="admin-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600">
                      Administrator Name
                    </label>
                    <input
                      id="admin-name"
                      type="text"
                      required
                      minLength={3}
                      autoComplete="name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="h-11.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </div>
                )}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600"
                  >
                    {creatingAdmin ? 'KUET Admin Email' : 'Faculty / Admin Email'}
                  </label>
                  <div className="relative">
                    <Mail
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                    />
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@kuet.ac.bd"
                      className="h-11.5 w-full rounded-xl border border-stone-300 bg-white pl-10.5 pr-3.5 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 outline-none transition duration-150 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="access-code" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600">
                    Admin Access Code {creatingAdmin ? '' : '(required for admins)'}
                  </label>
                  <input
                    id="access-code"
                    type="password"
                    autoComplete="off"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    required={creatingAdmin}
                    className="h-11.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm text-stone-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="text-xs font-semibold uppercase tracking-wider text-stone-600"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password', { state: { email } })}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                    />
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      required
                      minLength={creatingAdmin ? 12 : undefined}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11.5 w-full rounded-xl border border-stone-300 bg-white pl-10.5 pr-10 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 outline-none transition duration-150 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 hover:text-stone-600 transition cursor-pointer"
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs sm:text-sm text-rose-800"
                  >
                    <CircleAlert size={17} className="mt-0.5 shrink-0 text-rose-600" />
                    <span className="font-medium leading-relaxed">{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-11.5 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 font-display text-xs sm:text-sm font-bold text-white shadow-xs transition duration-150 hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Verifying credentials…</span>
                    </>
                  ) : (
                    <span>{creatingAdmin ? 'Create First Admin Account' : 'Sign In as Faculty / Staff'}</span>
                  )}
                </button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setCreatingAdmin((value) => !value)
                  setError('')
                }}
                className="w-full text-center text-xs font-semibold text-emerald-800 hover:text-emerald-950"
              >
                {creatingAdmin ? 'Back to staff sign-in' : 'First-time admin? Set up admin account'}
              </button>
            </div>
          )}

        </div>
      </main>

      {/* ─── Clean Institutional Footer ─── */}
      <footer className="mx-auto w-full max-w-5xl border-t border-stone-200/80 pt-4 text-center text-xs sm:text-sm text-stone-400">
        &copy; {new Date().getFullYear()} {metaInfo.instName} · {metaInfo.deptName} · All rights reserved.
      </footer>
    </div>
  )
}