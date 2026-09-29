import axios from 'axios'

export const TOKEN_KEY = 'token'

// All backend calls go through this client. In development "/api" is forwarded
// to FastAPI by the Vite proxy (see vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
})

// Attach the login token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// If the token expired, tell AuthContext to log out
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginCall = error.config?.url?.startsWith('/auth/')
    if (error.response?.status === 401 && !isLoginCall) {
      window.dispatchEvent(new Event('auth:expired'))
    }
    return Promise.reject(error)
  },
)

// Turns any request error into a readable sentence
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error.response) return 'Cannot reach the server. Is the backend running?'
  const detail = error.response.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

// Field-level errors from the backend, e.g. { roll: 'Roll must be 7 digits' }
export const fieldErrors = (error) => error.response?.data?.errors ?? {}

export default api
