import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const pictureDir = path.resolve(rootDir, 'picture')
const dbPath = path.resolve(rootDir, 'attendance.db')

function localPictureSyncPlugin() {
  return {
    name: 'local-picture-sync',
    configureServer(server) {
      // 1. Dual-save endpoint for student face enrollment
      server.middlewares.use('/_local_sync/save-face-samples', (req, res, next) => {
        if (req.method !== 'POST') return next()

        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}')
            const dept = (payload.department || 'CSE').trim().toUpperCase()
            const roll = String(payload.roll || '').trim()
            const images = Array.isArray(payload.images) ? payload.images : []

            if (!roll || images.length === 0) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ error: 'Missing roll or images' }))
            }

            const deptDir = path.join(pictureDir, dept)
            if (!fs.existsSync(deptDir)) {
              fs.mkdirSync(deptDir, { recursive: true })
            }

            const savedPaths = []
            let mainBuffer = null

            for (const item of images) {
              const stepName = item.step || 'sample'
              const base64Data = (item.data || '').replace(/^data:image\/\w+;base64,/, '')
              if (!base64Data) continue

              const buffer = Buffer.from(base64Data, 'base64')
              if (!mainBuffer && (stepName === 'look_straight' || savedPaths.length === 0)) {
                mainBuffer = buffer
              }

              const filename = `${roll}_${stepName}.jpg`
              const filePath = path.join(deptDir, filename)
              fs.writeFileSync(filePath, buffer)
              savedPaths.push(`picture/${dept}/${filename}`)
            }

            if (mainBuffer) {
              const mainFilePath = path.join(deptDir, `${roll}.jpg`)
              fs.writeFileSync(mainFilePath, mainBuffer)
            }

            // Sync into Mac local attendance.db if present
            if (fs.existsSync(dbPath)) {
              try {
                const pyScript = `
import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
c = conn.cursor()
roll = sys.argv[2]
dept = sys.argv[3]
paths_json = sys.argv[4]
main_path = f"picture/{dept}/{roll}.jpg"
c.execute("UPDATE student_roster SET photo_path = ?, face_sample_paths = ? WHERE roll = ?", (main_path, paths_json, roll))
conn.commit()
conn.close()
`
                const child = spawn('python3', ['-c', pyScript, dbPath, roll, dept, JSON.stringify(savedPaths)])
                child.on('error', () => {})
              } catch (_) {}
            }

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, count: savedPaths.length, saved_paths: savedPaths }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })

      // 2. Local picture serving & caching: serve local picture if it exists, otherwise fall through to proxy
      server.middlewares.use('/picture', (req, res, next) => {
        const decodedUrl = decodeURIComponent(req.url || '')
        const localFilePath = path.join(pictureDir, decodedUrl.replace(/^\//, ''))
        if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
          const ext = path.extname(localFilePath).toLowerCase()
          const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
          }
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
          return fs.createReadStream(localFilePath).pipe(res)
        }
        return next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawTarget = process.env.VITE_BACKEND_TARGET || env.VITE_BACKEND_TARGET || env.VITE_API_URL?.replace(/\/api\/?$/, '') || 'http://127.0.0.1:8000'
  const targetBackend = rawTarget.trim().replace(/\/+$/, '')

  console.log(`\n  📡 [Vite Proxy] Active Backend Target: ${targetBackend}\n`)

  return {
    plugins: [react(), tailwindcss(), localPictureSyncPlugin()],
    server: {
      port: 5173,
      strictPort: false,
      host: 'localhost',
      // Every request to /api/... is forwarded to the active backend (local or remote)
      proxy: {
        '/api': {
          target: targetBackend,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/picture': {
          target: targetBackend,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})

