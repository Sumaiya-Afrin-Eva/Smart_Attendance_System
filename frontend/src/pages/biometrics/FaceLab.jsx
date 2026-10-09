import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Camera,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
  ArrowLeft,
  Clock,
  User,
  Users,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

export default function FaceLab() {
  const [cameraActive, setCameraActive] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [courseCode, setCourseCode] = useState('')
  const [opening, setOpening] = useState(false)
  const [activeClass, setActiveClass] = useState(null)
  const [recentLogs, setRecentLogs] = useState([])
  const [currentTime, setCurrentTime] = useState(new Date())

  const videoRef = useRef(null)
  const streamRef = useRef(null)

  // Live Digital Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Start Camera with reliable element binding
  const startCamera = useCallback(async () => {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera API is not supported in this browser. Please use Chrome, Edge, or Brave on localhost.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error)
        }
      }
      setCameraActive(true)
    } catch (err) {
      console.error('Camera start error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Camera permission was denied. Please click the camera icon in your browser URL bar to allow access.')
      } else if (err.name === 'NotReadableError') {
        setError('Camera is currently in use by another application (Zoom, Teams, etc.). Please close it and retry.')
      } else {
        setError(`Unable to access camera (${err.name || 'Unknown'}).`)
      }
      setCameraActive(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }, [])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  // Ensure stream stays bound whenever video element mounts
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.play().catch(console.error)
      }
    }
  }, [cameraActive])

  const handleOpenKiosk = async (event) => {
    event.preventDefault()
    setOpening(true)
    setError('')
    setResult(null)
    try {
      const { data } = await api.post('/face/kiosk/open', { course_code: courseCode })
      setActiveClass(data)
    } catch (err) {
      setError(errorMessage(err, 'Could not open the attendance kiosk for this course.'))
    } finally {
      setOpening(false)
    }
  }

  const handleCloseKiosk = () => {
    stopCamera()
    setActiveClass(null)
    setResult(null)
    setRecentLogs([])
    setError('')
  }

  // Capture a frame and record attendance for the opened course session.
  const handleScan = async () => {
    if (!activeClass || !videoRef.current || !cameraActive) {
      setError('Please start the camera before scanning.')
      return
    }

    const video = videoRef.current
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError('Camera is still loading video frames. Please wait a moment and try again.')
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const b64 = canvas.toDataURL('image/jpeg', 0.9)

    setScanning(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('session_id', activeClass.session_id)
      formData.append('image_base64', b64)
      formData.append('threshold', 0.6)

      const res = await api.post('/face/kiosk/scan', formData, {
        timeout: 120000,
        skipNetworkRetry: true,
      })
      setResult(res.data)

      if (res.data?.matched && res.data?.student) {
        const newLog = {
          name: res.data.student.name,
          roll: res.data.student.roll,
          alreadyMarked: res.data.attendance.already_marked,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        setRecentLogs((prev) => [newLog, ...prev.slice(0, 4)])
      }
    } catch (err) {
      setError(err.code === 'ECONNABORTED'
        ? 'Face verification timed out. The first scan may take longer while the recognition model starts; please retry.'
        : errorMessage(err, 'Face identification failed. Please look straight at the camera.'))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f5] text-stone-900 px-4 py-6 sm:px-8 flex flex-col justify-between max-w-6xl mx-auto space-y-6">
      {/* ─── Top Bar ─── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 pb-4">
        <div className="flex items-center gap-3.5">
          <Link
            to="/login"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 shadow-2xs transition cursor-pointer"
            title="Return to Portal"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Classroom Attendance Kiosk Terminal
            </h1>
            <p className="text-xs text-stone-500 font-medium">
              {activeClass
                ? `${activeClass.course.code} · ${activeClass.course.title}`
                : 'KUET Department of Computer Science & Engineering'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 shadow-2xs">
            <Clock size={14} className="text-stone-400" />
            <span className="font-mono">{currentTime.toLocaleTimeString()}</span>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Kiosk Terminal Online</span>
          </div>
          {activeClass && (
            <button
              type="button"
              onClick={handleCloseKiosk}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
              Change course
            </button>
          )}
        </div>
      </header>

      {!activeClass ? (
        <main className="mx-auto my-auto w-full max-w-xl">
          <form onSubmit={handleOpenKiosk} className="space-y-5 rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
            <div>
              <h2 className="font-display text-2xl font-bold text-stone-900">Open a class kiosk</h2>
              <p className="mt-2 text-sm text-stone-600">
                Enter the course code to create or reopen today&apos;s attendance session.
              </p>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-600">Course code</span>
              <input
                required
                maxLength={20}
                autoFocus
                value={courseCode}
                onChange={(event) => setCourseCode(event.target.value)}
                placeholder="e.g. CSE 3200"
                className="h-12 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 text-sm font-semibold text-stone-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
              />
            </label>
            {error && !activeClass && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertCircle size={17} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={opening || !courseCode.trim()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {opening ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
              {opening ? 'Opening class…' : 'Open kiosk'}
            </button>
          </form>
        </main>
      ) : (
      <>
      {/* ─── Main Content Grid ─── */}
      <main className="grid gap-6 lg:grid-cols-12 items-start my-auto">
        {/* Left: Camera Feed Viewport */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-3xl border border-stone-200/90 bg-stone-900 shadow-sm flex items-center justify-center">
            {/* Always rendered video element so ref is never null */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover -scale-x-100 ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 text-stone-400 space-y-3 bg-stone-900">
                <Camera size={48} className="mx-auto text-stone-600" />
                <p className="text-sm font-semibold text-stone-300">Camera is Currently Paused</p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                >
                  Start Camera
                </button>
              </div>
            )}

            {/* Minimalist Face Target HUD */}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`relative h-60 w-60 rounded-3xl border-2 transition-all duration-300 ${
                    scanning
                      ? 'border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.35)] animate-pulse'
                      : result?.matched
                      ? 'border-emerald-400 shadow-[0_0_25px_rgba(52,211,153,0.35)]'
                      : 'border-white/40'
                  }`}
                >
                  {/* Clean Corner Brackets */}
                  <div className="absolute -left-1 -top-1 h-5 w-5 border-l-4 border-t-4 border-emerald-400 rounded-tl" />
                  <div className="absolute -right-1 -top-1 h-5 w-5 border-r-4 border-t-4 border-emerald-400 rounded-tr" />
                  <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-emerald-400 rounded-bl" />
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-emerald-400 rounded-br" />
                </div>
              </div>
            )}

            {/* Camera Status Overlay */}
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full bg-stone-900/70 backdrop-blur-md px-3 py-1 text-2xs font-semibold text-white">
              <span className={`h-2 w-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>{cameraActive ? 'Live Camera Feed' : 'Camera Off'}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleScan}
              disabled={!cameraActive || scanning}
              className="flex-1 flex h-13 items-center justify-center gap-2.5 rounded-2xl bg-emerald-800 font-display text-sm sm:text-base font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 cursor-pointer transition"
            >
              {scanning ? (
                <>
                  <RefreshCw size={19} className="animate-spin" />
                  <span>Verifying Face…</span>
                </>
              ) : (
                <>
                  <Zap size={19} />
                  <span>Scan Face &amp; Record Attendance</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className="flex h-13 items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 text-xs sm:text-sm font-semibold text-stone-700 hover:bg-stone-50 active:scale-[0.99] cursor-pointer shadow-2xs"
            >
              <Camera size={17} />
              <span>{cameraActive ? 'Pause' : 'Start'}</span>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs sm:text-sm font-medium text-rose-800">
              <AlertCircle size={17} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right: Verification Status & Recent Log */}
        <div className="lg:col-span-5 space-y-4">
          {/* Result Card */}
          <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm min-h-72 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
                <h2 className="font-display text-sm font-bold text-stone-900 flex items-center gap-2">
                  <ShieldCheck size={17} className="text-emerald-700" />
                  <span>Attendance Verification</span>
                </h2>
                {result && (
                  <span className="text-2xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Confidence: {result.similarity_percent}%
                  </span>
                )}
              </div>

              {scanning ? (
                <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-10 text-center">
                  <RefreshCw size={28} className="mb-3 animate-spin text-amber-600" />
                  <p className="text-sm font-semibold text-stone-800">Verifying face…</p>
                  <p className="mt-1 max-w-xs text-xs text-stone-500">
                    Checking the active course roster. The first scan may take longer while the recognition model starts.
                  </p>
                </div>
              ) : error ? (
                <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  <p className="font-bold">Scan could not be completed</p>
                  <p className="mt-1 text-xs leading-relaxed">{error}</p>
                </div>
              ) : result ? (
                result.matched && result.student ? (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Success Badge */}
                    <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs">
                        <CheckCircle2 size={22} />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                          {result.attendance.already_marked ? 'Already Present' : 'Attendance Recorded'}
                        </p>
                        <p className="text-xs text-emerald-700 font-medium">
                          {result.attendance.already_marked ? 'Attendance was already recorded for this class.' : 'Face verified and attendance saved.'}
                        </p>
                      </div>
                    </div>

                    {/* Student Info Card */}
                    <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80">
                      <p className="text-2xs font-bold uppercase tracking-wider text-stone-400 mb-1">
                        Student Identified
                      </p>
                      <h3 className="font-display text-lg font-bold text-stone-900">
                        {result.student.name}
                      </h3>
                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-stone-400">Roll Number:</span>
                          <p className="font-mono font-bold text-stone-800">{result.student.roll}</p>
                        </div>
                        <div>
                          <span className="text-stone-400">Department:</span>
                          <p className="font-semibold text-stone-800">{result.student.department}</p>
                        </div>
                        <div>
                          <span className="text-stone-400">Semester:</span>
                          <p className="font-semibold text-stone-800">{result.student.current_semester || '3-2'}</p>
                        </div>
                        <div>
                          <span className="text-stone-400">Section:</span>
                          <p className="font-semibold text-stone-800">{result.student.section || 'A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <XCircle size={20} className="text-amber-600" />
                      <p className="text-xs font-bold">No Match Found</p>
                    </div>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Face did not match any enrolled student with sufficient confidence (threshold 0.60). Please look directly at the camera and try again.
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-stone-400">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400 mb-2.5">
                    <User size={24} />
                  </div>
                  <p className="text-sm font-semibold text-stone-700">Ready for Next Student</p>
                  <p className="text-xs text-stone-400 max-w-xs mt-1">
                    Look into the camera and click scan to mark attendance.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-2xs text-stone-400">
              <span>Terminal: KUET-CSE-KIOSK-01</span>
              <span>Threshold: 0.60</span>
            </div>
          </div>

          {/* Recent Check-in Feed */}
          {recentLogs.length > 0 && (
            <div className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <Users size={14} className="text-emerald-700" />
                  <span>Recent Check-ins Today</span>
                </span>
                <span className="text-2xs font-mono text-stone-400">{recentLogs.length} verified</span>
              </div>

              <div className="space-y-2">
                {recentLogs.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-stone-800">{log.name}</p>
                      <p className="text-2xs text-stone-400 font-mono">Roll: {log.roll}</p>
                    </div>
                    <span className="font-mono text-2xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold">
                    {log.alreadyMarked ? 'Already marked' : log.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      </>
      )}
    </div>
  )
}
