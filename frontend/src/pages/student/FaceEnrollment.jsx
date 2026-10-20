import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Camera, ChevronLeft, CircleAlert, RotateCcw, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api, { errorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

const captureSteps = [
  { title: 'Look straight at the camera', detail: 'Keep your head straight and look directly into the camera.' },
  { title: 'Turn your head slightly left', detail: 'Slowly turn your face a little to your left.' },
  { title: 'Turn your head slightly right', detail: 'Slowly turn your face a little to your right.' },
  { title: 'Tilt your face slightly up', detail: 'Raise your chin slightly while keeping your face in the frame.' },
  { title: 'Tilt your face slightly down', detail: 'Lower your chin slightly and hold still.' },
]

export default function FaceEnrollment() {
  const navigate = useNavigate()
  const { refresh, logout } = useAuth()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const checkTimerRef = useRef(null)
  const checkingRef = useRef(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [humanDetected, setHumanDetected] = useState(false)
  const [livenessReady, setLivenessReady] = useState(false)
  const [status, setStatus] = useState('Start the camera to begin.')
  const [samples, setSamples] = useState([])
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const currentStep = captureSteps[samples.length]

  useEffect(() => () => {
    if (checkTimerRef.current) window.clearTimeout(checkTimerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const scheduleCheck = (delay = 500) => {
    if (checkTimerRef.current) window.clearTimeout(checkTimerRef.current)
    checkTimerRef.current = window.setTimeout(checkFrame, delay)
  }

  const checkFrame = async () => {
    if (!streamRef.current || !videoRef.current || checkingRef.current) return
    if (videoRef.current.readyState < 2) {
      scheduleCheck(100)
      return
    }
    checkingRef.current = true
    const canvas = document.createElement('canvas')
    const video = videoRef.current
    const scale = Math.min(1, 480 / (video.videoWidth || 480))
    canvas.width = Math.round((video.videoWidth || 480) * scale)
    canvas.height = Math.round((video.videoHeight || 360) * scale)
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    canvas.toBlob(async (blob) => {
      try {
        if (!blob) return
        const formData = new FormData()
        formData.append('photo', blob, 'live-frame.jpg')
        const { data } = await api.post('/students/me/face-check', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setHumanDetected(data.human)
        setLivenessReady(data.liveness === true)
        setStatus(data.message)
      } catch (error) {
        setHumanDetected(false)
        setLivenessReady(false)
        setStatus(errorMessage(error, 'Live face verification is unavailable.'))
      } finally {
        checkingRef.current = false
        if (streamRef.current) scheduleCheck(500)
      }
    }, 'image/jpeg', 0.78)
  }

  const startCamera = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      videoRef.current.srcObject = streamRef.current
      await videoRef.current.play()
      setCameraActive(true)
      setStatus('Checking the live camera for a human face...')
      scheduleCheck(0)
    } catch {
      setStatus('Camera permission is required. Allow camera access and try again.')
    }
  }

  const stopCamera = () => {
    if (checkTimerRef.current) window.clearTimeout(checkTimerRef.current)
    checkTimerRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraActive(false)
    setHumanDetected(false)
    setLivenessReady(false)
    setStatus('Camera stopped.')
  }

  const capture = () => {
    if (!humanDetected || !livenessReady || !videoRef.current || samples.length >= captureSteps.length) {
      setStatus('Blink and slowly move your head before capturing. A still photo is not accepted.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      setSamples((current) => [...current, new File([blob], `face-view-${current.length + 1}.jpg`, { type: 'image/jpeg' })])
      setStatus(samples.length + 1 < captureSteps.length ? `Great. Next: ${captureSteps[samples.length + 1].title}.` : 'All five photos are captured. Review and complete enrollment.')
    }, 'image/jpeg', 0.92)
  }

  const submit = async () => {
    if (samples.length !== captureSteps.length) {
      setStatus('Complete all five guided face captures before enrollment.')
      return
    }
    setSaving(true)
    setSubmitError('')
    setStatus('Uploading and validating all five face photos. Please wait...')
    try {
      const formData = new FormData()
      samples.forEach((sample) => formData.append('photos', sample))
      await api.post('/students/me/face-samples', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      await refresh()
      navigate('/student', { replace: true })
    } catch (error) {
      const message = errorMessage(error, 'Face enrollment could not be completed.')
      setSubmitError(message)
      setStatus(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f5] px-5 py-8 text-stone-900 sm:px-8">
      <main className="mx-auto max-w-5xl">
        <button type="button" onClick={() => navigate('/student/setup')} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-stone-900">
          <ChevronLeft size={17} /> Back to academic details
        </button>
        <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-emerald-900 px-6 py-7 text-white sm:px-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200">Step 2 of 2 · Face enrollment</p>
            <h1 className="mt-2 font-display text-3xl font-bold">Register your face securely</h1>
            <p className="mt-2 max-w-2xl text-sm text-emerald-100">Follow each direction and capture one live photo at a time. Your previous attendance and class history remain unchanged.</p>
          </div>
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_0.8fr]">
            <div className="space-y-4">
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-stone-950 ring-4 ring-stone-100">
                <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${cameraActive ? '' : 'opacity-0'}`} />
                {!cameraActive && <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400"><Camera size={34} /><p className="mt-2 text-sm">Camera preview will appear here</p></div>}
                {cameraActive && <div className={`absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-bold text-white ${livenessReady ? 'bg-emerald-600' : 'bg-rose-600'}`}>{livenessReady ? 'Live human verified' : humanDetected ? 'Blink and move' : 'Face not detected'}</div>}
              </div>
              <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${humanDetected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                {livenessReady ? <CheckCircle2 className="mr-2 inline" size={17} /> : <CircleAlert className="mr-2 inline" size={17} />} {status}
              </div>
              <div className="flex flex-wrap gap-3">
                {!cameraActive ? <button type="button" onClick={startCamera} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"><Camera size={18} /> Start live camera</button> : <button type="button" onClick={capture} disabled={!livenessReady || samples.length >= captureSteps.length} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Camera size={18} /> Capture photo {Math.min(samples.length + 1, 5)} / 5</button>}
                {cameraActive && <button type="button" onClick={stopCamera} className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold text-stone-700"><RotateCcw size={17} /> Stop</button>}
              </div>
            </div>
            <aside className="space-y-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 font-bold text-emerald-900"><ShieldCheck size={20} /> Capture instructions</div>
                <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Photo {Math.min(samples.length + 1, 5)} of 5</p>
                <h2 className="mt-2 text-xl font-bold text-stone-900">{currentStep?.title ?? 'Enrollment complete'}</h2>
                <p className="mt-1 text-sm text-stone-700">{currentStep?.detail ?? 'You can now complete your face enrollment.'}</p>
                <p className="mt-4 text-xs text-stone-600">Remove sunglasses, mask, and cap. Keep your whole face inside the frame.</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">Progress</p>
                <p className="mt-2 text-3xl font-bold text-stone-900">{samples.length}<span className="text-base font-medium text-stone-500"> / 5 photos</span></p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${Math.min(100, (samples.length / 5) * 100)}%` }} /></div>
              </div>
              {submitError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{submitError}</div>}
              <button type="button" onClick={submit} disabled={saving || samples.length !== captureSteps.length} className="w-full rounded-xl bg-emerald-900 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Validating 5 photos...' : 'Complete face enrollment'}</button>
              <button type="button" onClick={() => { logout(); navigate('/login') }} className="w-full text-center text-sm font-semibold text-stone-500 hover:text-stone-900">Sign out</button>
            </aside>
          </div>
        </section>
      </main>
    </div>
  )
}
