import { useState, useRef, useEffect, useCallback } from 'react'
import api, { errorMessage } from '../../lib/api'

// How often the liveness check polls (ms)
const LIVENESS_POLL_MS = 220
// After a final decision (matched or not), wait this long before resetting to scan again
const RESET_DELAY_MS = 3000
const QR_RESET_DELAY_MS = 5000

/** Capture a JPEG frame from the live video element. */
const captureFrame = (video, maxWidth = 320, quality = 0.70) =>
  new Promise((resolve, reject) => {
    const scale = Math.min(1, maxWidth / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('Canvas context unavailable')); return }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Frame capture failed'))),
      'image/jpeg',
      quality,
    )
  })

// ─── Voice announcement helper ────────────────────────────────────────────────
let _speechQueue = []
let _speaking = false

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return
  _speechQueue.push(text)
  if (!_speaking) _flushSpeech()
}

function _flushSpeech() {
  if (!_speechQueue.length) { _speaking = false; return }
  _speaking = true
  const utt = new SpeechSynthesisUtterance(_speechQueue.shift())
  utt.rate = 1
  utt.pitch = 1
  utt.volume = 1
  utt.onend = _flushSpeech
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utt)
}

// ─── Kiosk states ─────────────────────────────────────────────────────────────
// 'liveness'  – camera on, ready & checking for live human face
// 'scanning'  – sending frame for instant student & routine matching
// 'success'   – face matched → show green banner, then auto-reset
// 'qr'        – face not recognized → show QR prompt, wait for QR scan
// 'qr-scan'   – QR token detected, verifying
// 'qr-ok'     – QR verified → show success banner, then auto-reset
// 'qr-fail'   – QR failed
// ─────────────────────────────────────────────────────────────────────────────

export default function FaceLab({ kioskId = 'CSE' }) {
  const normalizedKioskId = String(kioskId || 'CSE').trim().toUpperCase()
  const [phase, setPhase] = useState('liveness')      // starts immediately ready
  const [activeClass, setActiveClass] = useState(null)
  const [liveness, setLiveness] = useState({ human: false, liveness: false, message: '' })
  const [banner, setBanner] = useState(null)         // { text, ok } for overlay
  const [recentLogs, setRecentLogs] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(5)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const livenessKeyRef = useRef(0)       // bump to restart liveness polling
  const lastQrRef = useRef(null)
  const qrLockRef = useRef(false)
  const autoScanRef = useRef(false)
  const resetTimerRef = useRef(null)
  const qrIntervalRef = useRef(null)
  const consecutiveErrorsRef = useRef(0)

  // ── Digital clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Camera start / stop ────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (streamRef.current) return   // already running
    setCameraError(null)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('This browser does not support camera access.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(() => {})
      }
      setCameraReady(true)
      setCameraError(null)
    } catch (err) {
      console.error('Camera error:', err)
      setCameraReady(false)
      setCameraError(
        'Camera access was blocked. Please allow camera access for this site in the browser permissions and click retry.'
      )
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
  }, [])

  // Re-bind stream if video element remounts
  useEffect(() => {
    if (cameraReady && streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [cameraReady])

  // Optional background fetch of routine info for the header (never blocks scanning)
  useEffect(() => {
    let unmounted = false
    api.post('/face/kiosk/open', { kiosk_id: normalizedKioskId })
      .then((res) => { if (!unmounted) setActiveClass(res.data) })
      .catch(() => {})
    return () => { unmounted = true }
  }, [normalizedKioskId])

  // ── Boot: start camera immediately ─────────────────────────────────────────
  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
      clearTimeout(resetTimerRef.current)
      clearInterval(qrIntervalRef.current)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [startCamera, stopCamera])

  // ── Reset to liveness after a decision ────────────────────────────────────
  const scheduleReset = useCallback((delay = RESET_DELAY_MS) => {
    clearTimeout(resetTimerRef.current)
    clearInterval(qrIntervalRef.current)
    resetTimerRef.current = setTimeout(() => {
      clearInterval(qrIntervalRef.current)
      setBanner(null)
      lastQrRef.current = null
      qrLockRef.current = false
      autoScanRef.current = false
      setPhase('liveness')
      setLiveness({ human: false, liveness: false, message: '' })
      setQrSecondsLeft(5)
      livenessKeyRef.current += 1
    }, delay)
  }, [])

  // ── Liveness polling: checks if a human is in front of camera ──────────────
  useEffect(() => {
    if (phase !== 'liveness' || !cameraReady) return undefined
    const key = livenessKeyRef.current
    let cancelled = false
    let inFlight = false
    let timer
    consecutiveErrorsRef.current = 0

    const poll = async () => {
      if (cancelled || key !== livenessKeyRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        timer = setTimeout(poll, 150)
        return
      }
      if (inFlight) { timer = setTimeout(poll, LIVENESS_POLL_MS); return }
      inFlight = true
      try {
        const frame = await captureFrame(video, 260, 0.55)
        const fd = new FormData()
        fd.append('kiosk_id', normalizedKioskId)
        if (activeClass?.session_id) fd.append('session_id', activeClass.session_id)
        fd.append('image', frame, 'live.jpg')
        const { data } = await api.post('/face/kiosk/liveness', fd, { timeout: 5000, skipNetworkRetry: true })
        if (cancelled || key !== livenessKeyRef.current) return
        consecutiveErrorsRef.current = 0
        setLiveness(data)
        if (!data?.liveness) {
          timer = setTimeout(poll, LIVENESS_POLL_MS)
        }
        // liveness=true → auto-scan kicks in via the effect below
      } catch (error) {
        if (!cancelled && key === livenessKeyRef.current) {
          consecutiveErrorsRef.current += 1
          const status = error?.response?.status
          const isServerUnavailable = status === 502 || status === 504 || error?.code === 'ERR_NETWORK' || !error?.response
          const message = consecutiveErrorsRef.current >= 3 && isServerUnavailable
            ? 'Server unreachable (502 / Offline). Check backend or tunnel URL.'
            : `Liveness check failed. Retrying: ${errorMessage(error, 'Please keep your face visible.')}`
          setLiveness({ human: false, liveness: false, message })
          timer = setTimeout(poll, 600)
        }
      } finally {
        inFlight = false
      }
    }

    timer = setTimeout(poll, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraReady, livenessKeyRef.current])

  // ── Auto face scan when human presence/liveness is verified ────────────────
  const handleFaceScan = useCallback(async () => {
    if (!videoRef.current || !cameraReady) return
    setPhase('scanning')
    try {
      const frame = await captureFrame(videoRef.current, 320, 0.75)
      const fd = new FormData()
      fd.append('kiosk_id', normalizedKioskId)
      if (activeClass?.session_id) fd.append('session_id', activeClass.session_id)
      fd.append('image', frame, 'kiosk-frame.jpg')
      fd.append('threshold', 0.42)
      const { data } = await api.post('/face/kiosk/scan', fd, { timeout: 60000, skipNetworkRetry: true })

      if (data?.matched) {
        const recognizedList = Array.isArray(data?.students) && data.students.length > 0
          ? data.students
          : (data?.student ? [data.student] : [])

        const count = recognizedList.length
        if (count > 1) {
          const names = recognizedList.map((s) => s.name || s.roll).join(', ')
          setBanner({ text: `Recognized (${count}): ${names}`, ok: true })
          speak(`${count} Faces Recognized`)
        } else {
          setBanner({ text: data?.message || 'Face Recognized', ok: true })
          speak('Face Recognized')
        }

        if (recognizedList.length > 0) {
          const newEntries = recognizedList.map((s) => ({
            name: s.name,
            roll: s.roll,
            alreadyMarked: s.already_marked ?? data.attendance?.already_marked,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          }))
          setRecentLogs((prev) => [...newEntries, ...prev].slice(0, 6))
        }
        setPhase('success')
        scheduleReset(RESET_DELAY_MS)
      } else {
        setBanner({ text: 'Face Not Recognized. Please show your QR code', ok: false })
        speak('Face Not Recognized. Please show your QR code')
        setPhase('qr')
        autoScanRef.current = false
        setQrSecondsLeft(5)
        clearInterval(qrIntervalRef.current)
        qrIntervalRef.current = setInterval(() => {
          setQrSecondsLeft((s) => Math.max(0, s - 1))
        }, 1000)
        scheduleReset(QR_RESET_DELAY_MS)
      }
    } catch {
      setBanner({ text: 'Face Not Recognized. Please show your QR code', ok: false })
      speak('Face Not Recognized. Please show your QR code')
      setPhase('qr')
      autoScanRef.current = false
      setQrSecondsLeft(5)
      clearInterval(qrIntervalRef.current)
      qrIntervalRef.current = setInterval(() => {
        setQrSecondsLeft((s) => Math.max(0, s - 1))
      }, 1000)
      scheduleReset(QR_RESET_DELAY_MS)
    }
  }, [activeClass, cameraReady, normalizedKioskId, scheduleReset])

  useEffect(() => {
    if (phase !== 'liveness' || !liveness.liveness || autoScanRef.current) return
    autoScanRef.current = true
    void handleFaceScan()
  }, [phase, liveness.liveness, handleFaceScan])

  // ── QR fallback scanning ───────────────────────────────────────────────────
  const handleQrToken = useCallback(async (token) => {
    if (qrLockRef.current) return
    qrLockRef.current = true
    clearTimeout(resetTimerRef.current)
    clearInterval(qrIntervalRef.current)
    setPhase('qr-scan')
    try {
      const payload = { token, kiosk_id: normalizedKioskId }
      if (activeClass?.session_id) payload.session_id = activeClass.session_id
      const { data } = await api.post('/face/kiosk/qr-scan', payload, { timeout: 10000, skipNetworkRetry: true })

      setBanner({ text: data?.message || 'Attendance Recorded', ok: true })
      speak('Attendance Recorded')
      if (data?.student) {
        setRecentLogs((prev) => [{
          name: data.student.name,
          roll: data.student.roll,
          alreadyMarked: data.attendance?.already_marked,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }, ...prev.slice(0, 4)])
      }
      setPhase('qr-ok')
      scheduleReset(RESET_DELAY_MS)
    } catch {
      setBanner({ text: 'QR verification failed. Try again.', ok: false })
      speak('QR verification failed. Please try again.')
      setPhase('qr-fail')
      scheduleReset(RESET_DELAY_MS)
    }
  }, [activeClass, normalizedKioskId, scheduleReset])

  useEffect(() => {
    if (phase !== 'qr' || !cameraReady) return undefined
    if (typeof window?.BarcodeDetector !== 'function') return undefined

    let cancelled = false
    const video = videoRef.current
    if (!video) return undefined

    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    let rafId

    const loop = async () => {
      if (cancelled) return
      try {
        const hits = await detector.detect(video)
        if (hits.length && hits[0].rawValue && hits[0].rawValue !== lastQrRef.current) {
          lastQrRef.current = hits[0].rawValue
          void handleQrToken(hits[0].rawValue)
        } else {
          rafId = requestAnimationFrame(loop)
        }
      } catch {
        rafId = requestAnimationFrame(loop)
      }
    }
    rafId = requestAnimationFrame(loop)
    return () => { cancelled = true; cancelAnimationFrame(rafId) }
  }, [phase, cameraReady, handleQrToken])

  // ── Derived display values ─────────────────────────────────────────────────
  const timeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = currentTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const kioskLabel = `${normalizedKioskId} Kiosk`

  const isQrPhase = phase === 'qr' || phase === 'qr-scan' || phase === 'qr-ok' || phase === 'qr-fail'
  const showFrame = cameraReady

  // Liveness hint (subtle prompt when human is detected)
  const livenessHint = (phase === 'liveness' && !liveness.liveness)
    ? (liveness.message || 'Look at the camera to verify attendance.')
    : ''

  const permissionBanner = cameraError ? (
    <div className="absolute inset-x-0 top-24 flex justify-center px-6 pointer-events-none">
      <div className="max-w-[720px] rounded-2xl border border-amber-300/60 bg-black/55 px-6 py-4 text-center text-base font-medium text-amber-100 shadow-xl backdrop-blur-sm">
        <div className="mb-2 font-bold text-lg text-white">Camera permission required</div>
        {cameraError}
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => { void startCamera() }}
            className="pointer-events-auto rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black shadow-lg transition hover:bg-amber-400"
          >
            Retry camera
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      {/* ── Full-screen camera feed ──────────────────────────────────────── */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-cover -scale-x-100 transition-opacity duration-500 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Dark vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

      {/* ── Top bar: clock + kiosk label ───────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 flex items-start justify-between px-8 pt-6 pointer-events-none">
        <div>
          <div className="text-4xl font-bold text-white tabular-nums drop-shadow">{timeStr}</div>
          <div className="text-sm text-white/70 mt-1 drop-shadow">{dateStr}</div>
          <div className="mt-2 inline-flex rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/80">
            {kioskLabel}
          </div>
        </div>
      </div>

      {/* ── Face scan frame ─────────────────────────────────────────────── */}
      {showFrame && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`relative h-72 w-72 rounded-[2.5rem] transition-all duration-300 ${
            banner?.ok === true
              ? 'border-2 border-emerald-400 shadow-[0_0_60px_rgba(52,211,153,0.4)]'
              : banner?.ok === false
              ? 'border-2 border-rose-400 shadow-[0_0_60px_rgba(248,113,113,0.3)]'
              : 'border-2 border-white/30 shadow-[0_0_40px_rgba(255,255,255,0.1)]'
          }`}>
            {/* Corner accents */}
            {[
              'absolute -left-[3px] -top-[3px] border-l-[4px] border-t-[4px] rounded-tl-[2.5rem]',
              'absolute -right-[3px] -top-[3px] border-r-[4px] border-t-[4px] rounded-tr-[2.5rem]',
              'absolute -left-[3px] -bottom-[3px] border-l-[4px] border-b-[4px] rounded-bl-[2.5rem]',
              'absolute -right-[3px] -bottom-[3px] border-r-[4px] border-b-[4px] rounded-br-[2.5rem]',
            ].map((cls, i) => (
              <div key={i} className={`h-8 w-8 ${cls} ${
                banner?.ok === true ? 'border-emerald-400' : banner?.ok === false ? 'border-rose-400' : 'border-white/70'
              }`} />
            ))}

            {/* Scanning pulse */}
            {phase === 'scanning' && (
              <div className="absolute inset-0 rounded-[2.5rem] animate-ping border border-white/20" />
            )}
          </div>
        </div>
      )}

      {/* ── QR mode: big QR icon prompt ─────────────────────────────────── */}
      {isQrPhase && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-32 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white/80 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h6v6H3zM3 15h6v6H3zM15 3h6v6h-6zM15 15h2v2h-2zM19 15h2v2h-2zM17 17h2v2h-2zM19 19h2v2h-2zM15 19h2v2h-2z" />
            </svg>
            <span className="text-white/85 text-lg font-medium tracking-wide">Show your QR code to the camera</span>
            {phase === 'qr' && (
              <span className="text-amber-300 font-semibold text-xs tracking-wider uppercase bg-black/50 px-3.5 py-1.5 rounded-full border border-amber-300/40 backdrop-blur-sm shadow-lg">
                Auto-refreshing in {qrSecondsLeft}s
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom status banner ─────────────────────────────────────────── */}
      {banner && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-10 px-6 pointer-events-none">
          <div className={`min-w-[320px] max-w-[85vw] rounded-2xl px-8 py-5 text-center text-2xl font-bold shadow-2xl backdrop-blur-md border ${
            banner.ok
              ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-100'
              : 'bg-rose-500/25 border-rose-400/60 text-rose-100'
          }`}>
            {banner.text}
          </div>
        </div>
      )}

      {permissionBanner}

      {/* ── Liveness hint (subtle, centre-bottom) ───────────────────────── */}
      {!banner && !cameraError && livenessHint && (
        <div className="absolute inset-x-0 bottom-10 flex justify-center px-6 pointer-events-none">
          <div className="rounded-xl bg-black/40 backdrop-blur-sm border border-white/10 px-6 py-3 text-center text-sm text-white/70 max-w-[80vw]">
            {livenessHint}
          </div>
        </div>
      )}

      {/* ── Recent attendance log (top-right corner, subtle) ────────────── */}
      {recentLogs.length > 0 && (
        <div className="absolute top-24 right-6 w-64 space-y-2 pointer-events-none">
          {recentLogs.map((log, i) => (
            <div key={i} className={`rounded-xl px-4 py-2.5 text-xs backdrop-blur-md border transition-all ${
              log.alreadyMarked
                ? 'bg-amber-500/15 border-amber-400/30 text-amber-100'
                : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-100'
            }`}>
              <div className="font-semibold truncate">{log.name}</div>
              <div className="flex justify-between gap-2 text-white/60 mt-0.5">
                <span>Roll: {log.roll}</span>
                <span>{log.time}</span>
              </div>
              {log.alreadyMarked && <div className="text-amber-300/80 mt-0.5">Already marked</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
