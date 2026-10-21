import { useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CircleAlert, Lock, Mail } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

export default function PasswordRecovery() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isReset = Boolean(token)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (isReset && password !== confirmation) {
      setError('The passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const { data } = isReset
        ? await api.post('/auth/password-reset/confirm', { token, password })
        : await api.post('/auth/password-reset/request', { email })
      setMessage(data.message)
    } catch (requestError) {
      setError(errorMessage(requestError, 'Password recovery failed. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f5] px-4 py-8 text-stone-900">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
        <Link to="/login" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950">
          <ArrowLeft size={17} />
          Back to sign in
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {isReset ? 'Choose a new password' : 'Reset your password'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          {isReset
            ? 'Choose a strong password with at least 12 characters.'
            : 'Enter your faculty or admin email. If an active account exists, we will send a one-time reset link.'}
        </p>

        {message ? (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p>{message}</p>
            {isReset && <Link to="/login" className="mt-3 inline-block font-semibold underline">Return to sign in</Link>}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {!isReset ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600">Staff email</span>
                <span className="relative block">
                  <Mail size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-12 w-full rounded-xl border border-stone-300 bg-white pl-10.5 pr-3.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
                </span>
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600">New password</span>
                  <span className="relative block">
                    <Lock size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={128}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-12 w-full rounded-xl border border-stone-300 bg-white pl-10.5 pr-3.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600">Confirm password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
                </label>
              </>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <CircleAlert size={17} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-xl bg-emerald-800 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Please wait…' : isReset ? 'Save new password' : 'Send reset link'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
