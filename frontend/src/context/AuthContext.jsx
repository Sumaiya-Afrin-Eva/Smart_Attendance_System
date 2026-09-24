import { createContext, useContext, useState } from 'react'

// TEMPORARY mock users. They will be replaced by the backend (FastAPI + database).
// To test real Google sign-in, add your own Gmail here with the role you want, e.g.
// { email: 'your.name@gmail.com', password: 'unused123', name: 'Your Name', role: 'teacher' }
const MOCK_USERS = [
  { email: 'admin@kuet.ac.bd', password: 'admin123', name: 'System Admin', role: 'admin' },
  { email: 'teacher@kuet.ac.bd', password: 'teacher123', name: 'Sk Md Masudul Ahsan', role: 'teacher' },
  { email: 'student@kuet.ac.bd', password: 'student123', name: 'Tanha Islam Sinthi', role: 'student' },
]

// Never keep the password in app state or localStorage
const toSafeUser = ({ email, name, role }) => ({ email, name, role })

// Decode the payload of a JWT (handles base64url and UTF-8 names)
function decodeJwtPayload(token) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  )
  return JSON.parse(json)
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user'))
    } catch {
      return null
    }
  })

  const persist = (nextUser) => {
    setUser(nextUser)
    localStorage.setItem('user', JSON.stringify(nextUser))
    return nextUser
  }

  // Email + password login
  const login = async (email, password) => {
    // TODO: replace with
    // const { data } = await axios.post('/api/auth/login', { email, password })
    // and store the JWT returned by the backend.
    const found = MOCK_USERS.find(
      (u) => u.email === email.trim().toLowerCase() && u.password === password,
    )
    if (!found) throw new Error('Incorrect email or password.')
    return persist(toSafeUser(found))
  }

  // Google login. `credential` is the Google ID token (a JWT).
  const loginWithGoogle = async (credential) => {
    // SECURITY: in production, send the ID token to the backend:
    //   const { data } = await axios.post('/api/auth/google', { credential })
    // The backend verifies the token signature with Google and returns the app's own JWT.
    // The frontend must NOT trust the decoded token by itself. Decoding here is for the mock flow only.
    let profile
    try {
      profile = decodeJwtPayload(credential)
    } catch {
      throw new Error('Invalid Google sign-in response. Please try again.')
    }

    if (!profile.email || profile.email_verified === false) {
      throw new Error('This Google account has no verified email address.')
    }

    // Google login never creates accounts or assigns roles.
    // Only emails already registered by an admin can sign in.
    const found = MOCK_USERS.find((u) => u.email === profile.email.toLowerCase())
    if (!found) {
      throw new Error(
        'This Google account is not registered in the system. Please contact the admin.',
      )
    }
    return persist({ ...toSafeUser(found), picture: profile.picture })
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('user')
  }

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)