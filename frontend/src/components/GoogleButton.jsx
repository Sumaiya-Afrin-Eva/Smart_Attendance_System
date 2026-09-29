import { useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { ArrowRight, Sparkles } from 'lucide-react'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

// Real mode: Opens a Google popup to sign in.
function RealGoogleButton({ onCredential, onError, disabled }) {
  const [busy, setBusy] = useState(false)

  const googleLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setBusy(false)
      onCredential(tokenResponse.access_token)
    },
    onError: (errorResponse) => {
      setBusy(false)
      console.error('Google login error:', errorResponse)
      onError('Google sign-in was cancelled or failed. Please try again.')
    },
    onNonOAuthError: (error) => {
      setBusy(false)
      console.error('Google non-OAuth error:', error)
      if (error?.type === 'popup_closed') return
      onError('Google sign-in popup was blocked. Please allow popups for this site.')
    },
  })

  const handleClick = () => {
    setBusy(true)
    googleLogin()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className="group relative flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-slate-300/90 bg-white font-display text-xs font-semibold text-slate-800 shadow-2xs transition-all duration-200 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
    >
      <GoogleLogo />
      <span>{busy ? 'Signing in with Google…' : 'Continue with Google'}</span>
    </button>
  )
}

// Dev mode (no client ID)
function DevLoginButton({ onDevLogin, disabled }) {
  const [email, setEmail] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    onDevLogin(email.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="relative">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="yourroll@stud.kuet.ac.bd"
          aria-label="Student email for dev login"
          className="h-10.5 w-full rounded-xl border border-teal-200 bg-white px-3.5 text-xs text-slate-900 shadow-2xs outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15"
        />
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="flex h-10.5 w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/80 font-display text-xs font-semibold text-teal-800 transition hover:bg-teal-700 hover:text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        <GoogleLogo />
        <span>Continue with Google (Dev Login)</span>
        <ArrowRight size={14} />
      </button>
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
        <Sparkles size={11} className="text-amber-500" />
        <span>Dev mode active · try entering <strong>demo@stud.kuet.ac.bd</strong></span>
      </div>
    </form>
  )
}

export default function GoogleButton(props) {
  return CLIENT_ID ? <RealGoogleButton {...props} /> : <DevLoginButton {...props} />
}