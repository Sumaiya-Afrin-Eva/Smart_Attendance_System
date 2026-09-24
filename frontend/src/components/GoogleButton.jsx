import { useEffect, useRef, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'

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

// Real mode: Google's official button. Returns an ID token (credential).
function RealGoogleButton({ onCredential, onError, disabled }) {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(0)

  // Google's button needs a pixel width (200-400), so match the container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setWidth(Math.min(Math.round(el.offsetWidth), 400))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className={`flex justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      {width > 0 && (
        <GoogleLogin
          onSuccess={(response) => onCredential(response.credential)}
          onError={() => onError('Google sign-in was cancelled or failed. Please try again.')}
          text="continue_with"
          theme="outline"
          size="large"
          shape="rectangular"
          logo_alignment="center"
          width={String(width)}
        />
      )}
    </div>
  )
}

// Demo mode (no client ID): simulates a Google sign-in as student@kuet.ac.bd
function DemoGoogleButton({ onCredential, disabled }) {
  const handleClick = () => {
    const payload = {
      email: 'student@kuet.ac.bd',
      name: 'Demo Student',
      email_verified: true,
    }
    // Unsigned fake token, only understood by the mock AuthContext
    const fakeCredential = ['demo', btoa(JSON.stringify(payload)), 'demo'].join('.')
    onCredential(fakeCredential)
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleLogo />
        Continue with Google
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">
        Demo mode: signs in as student@kuet.ac.bd (no Google client ID set).
      </p>
    </div>
  )
}

export default function GoogleButton(props) {
  return CLIENT_ID ? <RealGoogleButton {...props} /> : <DemoGoogleButton {...props} />
}