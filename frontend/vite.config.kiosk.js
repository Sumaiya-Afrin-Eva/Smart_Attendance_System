// vite.config.kiosk.js
// ─────────────────────────────────────────────────────────────────────────────
// Used ONLY on the kiosk machine (Sumaiya's Mac).
// Supports any backend URL — local IP, Cloudflare tunnel, ngrok, etc.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Load regular .env first, then override with .env.kiosk (written by start-kiosk.sh)
  const base = loadEnv(mode, process.cwd(), '')
  const kioskEnvPath = path.resolve(process.cwd(), '.env.kiosk')
  let kioskOverrides = {}
  if (fs.existsSync(kioskEnvPath)) {
    const raw = fs.readFileSync(kioskEnvPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      kioskOverrides[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  }

  const env = { ...base, ...kioskOverrides }

  // Full backend root URL (without /api suffix)
  const apiUrl = env.VITE_API_URL || ''
  const backendRoot = apiUrl.replace(/\/api\/?$/, '') || 'http://192.168.1.42:8000'

  // Decide whether we need secure WebSocket (wss) for HTTPS tunnels
  const isHttps = backendRoot.startsWith('https://')

  return {
    plugins: [react(), tailwindcss()],

    // Expose the API URL to the React bundle
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl || `${backendRoot}/api`),
    },

    server: {
      port: 5173,
      strictPort: false,
      host: 'localhost',

      proxy: {
        // All /api/* calls → remote backend (tunnel or LAN IP)
        '/api': {
          target: backendRoot,
          changeOrigin: true,
          secure: isHttps,       // validate SSL cert only for real HTTPS
          ws: true,              // forward WebSocket upgrades if used later
        },
        // Static student pictures served by the backend
        '/picture': {
          target: backendRoot,
          changeOrigin: true,
          secure: isHttps,
        },
      },
    },
  }
})
