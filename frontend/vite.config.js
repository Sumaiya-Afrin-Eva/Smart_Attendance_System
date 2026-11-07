import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const targetBackend = env.VITE_BACKEND_TARGET || env.VITE_API_URL?.replace(/\/api\/?$/, '') || 'http://127.0.0.1:8000'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: false,
      host: 'localhost',
      // Every request to /api/... is forwarded to the active backend (local or remote)
      proxy: {
        '/api': {
          target: targetBackend,
          changeOrigin: true,
          secure: targetBackend.startsWith('https://'),
          ws: true,
        },
        '/picture': {
          target: targetBackend,
          changeOrigin: true,
          secure: targetBackend.startsWith('https://'),
        },
      },
    },
  }
})

