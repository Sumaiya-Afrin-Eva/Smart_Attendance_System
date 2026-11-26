import { useState, useRef, useEffect, useCallback } from 'react'
import { BrowserQRCodeReader } from '@zxing/browser'
import api from '../../lib/api'

// How often the liveness check polls (ms)
const LIVENESS_POLL_MS = 180
// After a final decision (matched or not), wait this long before resetting to scan again
const RESET_DELAY_MS = 3000
const SUCCESS_RESET_DELAY_MS = 5000

/** Capture a JPEG frame from the live video element. */
const captureFrame = (video, maxWidth = 320) =>
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
      0.70,
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

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const livenessKeyRef = useRef(0)       // bump to restart liveness polling
  const lastQrRef = useRef(null)
  const qrLockRef = useRef(false)
  const autoScanRef = useRef(false)
  const resetTimerRef = useRef(null)

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
    let loading = false
    const refreshClass = async (refreshOnly = true) => {
      if (loading) return
      loading = true
      try {
        const { data } = await api.post('/face/kiosk/open', {
          kiosk_id: normalizedKioskId,
          refresh_only: refreshOnly,
        })
        if (!unmounted) {
          setActiveClass((current) => (
            current?.session_id === data?.session_id && current?.course?.id === data?.course?.id
              ? current
              : data
          ))
        }
      } catch (error) {
        console.warn('Could not refresh kiosk class schedule', error)
      } finally {
        loading = false
      }
    }

    void refreshClass(false)
    const timer = window.setInterval(refreshClass, 30000)
    return () => {
      unmounted = true
      window.clearInterval(timer)
    }
  }, [normalizedKioskId])

  // ── Boot: start camera immediately ─────────────────────────────────────────
  useEffect(() => {
    void startCamera()
    return () => {
      stopCamera()
      clearTimeout(resetTimerRef.current)
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [startCamera, stopCamera])

  // ── Reset to liveness after a decision ────────────────────────────────────
  const scheduleReset = useCallback((delay = RESET_DELAY_MS) => {
    clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      setBanner(null)
      lastQrRef.current = null
      qrLockRef.current = false
      autoScanRef.current = false
      setPhase('liveness')
      setLiveness({ human: false, liveness: false, message: '' })
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
        const frame = await captureFrame(video, 480)
        const fd = new FormData()
        fd.append('kiosk_id', normalizedKioskId)
        if (activeClass?.session_id) fd.append('session_id', activeClass.session_id)
        fd.append('image', frame, 'live.jpg')
        const { data } = await api.post('/face/kiosk/liveness', fd, { timeout: 5000, skipNetworkRetry: true })
        if (cancelled || key !== livenessKeyRef.current) return
        setLiveness(data)
        if (!data?.liveness) {
          timer = setTimeout(poll, LIVENESS_POLL_MS)
        }
        // liveness=true → auto-scan kicks in via the effect below
      } catch {
        if (!cancelled) timer = setTimeout(poll, 1000)
      } finally {
        inFlight = false
      }
    }

    timer = setTimeout(poll, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraReady, activeClass?.session_id, livenessKeyRef.current])

  // ── Auto face scan when human presence/liveness is verified ────────────────
  const handleFaceScan = useCallback(async () => {
    if (!videoRef.current || !cameraReady) return
    setPhase('scanning')
    try {
      const frame = await captureFrame(videoRef.current, 640)
      const fd = new FormData()
      fd.append('kiosk_id', normalizedKioskId)
      if (activeClass?.session_id) fd.append('session_id', activeClass.session_id)
      fd.append('image', frame, 'kiosk-frame.jpg')
      fd.append('threshold', 0.48)
      const { data } = await api.post('/face/kiosk/scan', fd, { timeout: 60000, skipNetworkRetry: true })

      if (data?.matched) {
        const studentName = data.student?.name ? ` — ${data.student.name}` : ''
        const bannerText = data.attendance?.already_marked
          ? `Already Marked${studentName}`
          : `Face Recognized${studentName}`
        setBanner({ text: bannerText, ok: true })
        speak(data.attendance?.already_marked ? 'Attendance already marked' : 'Face Recognized')
        if (data.student) {
          setRecentLogs((prev) => [{
            name: data.student.name,
            roll: data.student.roll,
            alreadyMarked: data.attendance?.already_marked,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          }, ...prev.slice(0, 4)])
        }
        setPhase('success')
        scheduleReset(SUCCESS_RESET_DELAY_MS)
      } else {
        setBanner({ text: 'Face Not Recognized. Please show your QR code', ok: false })
        speak('Face Not Recognized. Please show your QR code')
        setPhase('qr')
        autoScanRef.current = false
        scheduleReset(RESET_DELAY_MS)
      }
    } catch {
      setBanner({ text: 'Face Not Recognized. Please show your QR code', ok: false })
      speak('Face Not Recognized. Please show your QR code')
      setPhase('qr')
      autoScanRef.current = false
      scheduleReset(RESET_DELAY_MS)
    }
  }, [activeClass, cameraReady, scheduleReset])

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
      scheduleReset()
    } catch {
      setBanner({ text: 'QR verification failed. Try again.', ok: false })
      speak('QR verification failed. Please try again.')
      setPhase('qr-fail')
      scheduleReset()
    }
  }, [activeClass, scheduleReset])

  useEffect(() => {
    if (phase !== 'qr' || !cameraReady) return undefined

    let cancelled = false
    const video = videoRef.current
    if (!video) return undefined

    if (typeof window?.BarcodeDetector !== 'function') {
      let controls
      const reader = new BrowserQRCodeReader()
      void reader.decodeFromVideoElement(video, (result, _error, scannerControls) => {
        controls = scannerControls
        if (cancelled || !result) return
        const rawValue = result.getText()
        if (!rawValue || rawValue === lastQrRef.current) return
        lastQrRef.current = rawValue
        scannerControls.stop()
        void handleQrToken(rawValue)
      }).then((scannerControls) => {
        if (cancelled) scannerControls.stop()
        else controls = scannerControls
      }).catch((error) => {
        if (!cancelled) console.error('QR scanner could not start:', error)
      })

      return () => {
        cancelled = true
        controls?.stop()
      }
    }

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
            <span className="text-white/70 text-lg font-medium tracking-wide">Show your QR code to the camera</span>
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
