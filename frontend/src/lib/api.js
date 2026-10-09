import axios from 'axios'

export const TOKEN_KEY = 'token'

// All backend calls go through this client. In development "/api" is forwarded
// to FastAPI by the Vite proxy (see vite.config.js).
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 180000,
})

// Attach the login token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  config._retryCount = config._retryCount ?? 0
  return config
})

// Response interceptor: handle auth expiry + auto-retry on network errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config

    const isLoginCall = config?.url?.startsWith('/auth/')

    // If the token expired (401 on non-login calls), force logout
    if (error.response?.status === 401 && !isLoginCall) {
      window.dispatchEvent(new Event('auth:expired'))
      return Promise.reject(error)
    }

    // Retry on pure network errors (no response at all) for ALL requests.
    // This handles the server being momentarily unavailable.
    // We do NOT retry on actual HTTP error responses (4xx, 5xx).
    const isNetworkError = !error.response
    const maxRetries = 3
    if (isNetworkError && config && config._retryCount < maxRetries) {
      config._retryCount += 1
      await new Promise((resolve) => setTimeout(resolve, 700))
      return api(config)
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
