import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, CameraOff, Check, ImageUp, RotateCcw, Sparkles, X } from 'lucide-react'
import api, { errorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Button, ErrorBox } from '../ui'

const POSES = [
  { text: 'Look straight at the camera (Frontal)', hint: 'Keep neutral expression' },
  { text: 'Turn head slightly to the left (Left 15°)', hint: 'Calibrates left angle' },
  { text: 'Turn head slightly to the right (Right 15°)', hint: 'Calibrates right angle' },
  { text: 'Tilt chin up slightly (Up 10°)', hint: 'Calibrates upward angle' },
  { text: 'Look straight with a natural smile', hint: 'Final verification photo' },
]

const CAMERA_ERRORS = {
  NotAllowedError: 'Camera permission was denied. Please allow camera access in your browser address bar and try again.',
  NotFoundError: 'No camera device was detected on your computer.',
  NotReadableError: 'The camera is currently locked by another application (e.g. Zoom, Teams). Close it and retry.',
}

function brightness(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h)
  let sum = 0
  for (let i = 0; i < data.length; i += 16) sum += (data[i] + data[i + 1] + data[i + 2]) / 3
  return sum / (data.length / 16)
}

export default function FaceCapture({ onSaved, submitLabel = 'Save Face Photos' }) {
  const { setOnboarding } = useAuth()
  const queryClient = useQueryClient()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [photos, setPhotos] = useState([])
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }, [])

  const startCamera = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not supported in this browser environment. Use HTTPS or localhost.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraOn(true)
    } catch (err) {
      setError(CAMERA_ERRORS[err.name] ?? `Could not initialize camera (${err.name}).`)
    }
  }

  const photosRef = useRef(photos)
  useEffect(() => { photosRef.current = photos }, [photos])
  useEffect(() => stopCamera, [stopCamera])
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const level = brightness(ctx, canvas.width, canvas.height)
    setWarning(level < 60 ? 'Lighting is slightly dim. Please face a light source for best recognition accuracy.' : '')
    canvas.toBlob(
      (blob) => setPhotos((prev) => [...prev, { blob, url: URL.createObjectURL(blob) }]),
      'image/jpeg',
      0.92,
    )
  }

  const removePhoto = (index) => {
    URL.revokeObjectURL(photos[index].url)
    setPhotos(photos.filter((_, i) => i !== index))
  }

  const clearPhotos = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
  }

  const addFiles = (e) => {
    const files = [...e.target.files].filter((f) => ['image/jpeg', 'image/png'].includes(f.type))
    setPhotos((prev) =>
      [...prev, ...files.map((f) => ({ blob: f, url: URL.createObjectURL(f) }))].slice(0, POSES.length),
    )
    e.target.value = ''
  }

  const upload = async () => {
    setSaving(true)
    setError('')
    const form = new FormData()
    photos.forEach((p, i) => form.append('photos', p.blob, `face_${i + 1}.jpg`))
    try {
      const { data } = await api.post('/students/me/face', form)
      setOnboarding(data.onboarding)
      stopCamera()
      await queryClient.invalidateQueries({ queryKey: ['face'] })
      onSaved?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const done = photos.length >= POSES.length
  const currentPose = POSES[photos.length] || POSES[POSES.length - 1]

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Camera Viewport */}
        <div className="lg:col-span-3">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-stone-800 bg-[#0f172a] shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full -scale-x-100 object-cover ${cameraOn ? '' : 'invisible'}`}
            />

            {cameraOn ? (
              <>
                {/* Laser scan line */}
                <div className="pointer-events-none absolute inset-x-0 h-0.5 animate-scan bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#10b981]" />

                {/* Face Oval Reticle */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] aspect-[3/4] -translate-x-1/2 -translate-y-1/2 rounded-[48%] border-2 border-dashed border-emerald-400/80"
                >
                  {/* Corner Crosshairs */}
                  <span className="absolute -left-1 -top-1 h-3.5 w-3.5 border-l-2 border-t-2 border-emerald-300" />
                  <span className="absolute -right-1 -top-1 h-3.5 w-3.5 border-r-2 border-t-2 border-emerald-300" />
                  <span className="absolute -bottom-1 -left-1 h-3.5 w-3.5 border-b-2 border-l-2 border-emerald-300" />
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 border-b-2 border-r-2 border-emerald-300" />
                </div>

                {/* Live Instruction Banner */}
                {!done && (
                  <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-slate-950/80 p-3.5 text-center backdrop-blur-xs">
                    <p className="font-display text-sm font-bold text-white">
                      Pose {photos.length + 1} of {POSES.length}: {currentPose.text}
                    </p>
                    <p className="text-xs sm:text-sm text-emerald-300 font-medium mt-0.5">{currentPose.hint}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 text-slate-400 p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 shadow-inner">
                  <CameraOff size={26} />
                </div>
                <div>
                  <p className="font-display text-base font-bold text-white">Camera Standby</p>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">Start your webcam to begin 5-angle face calibration</p>
                </div>
                <Button onClick={startCamera} className="mt-2 cursor-pointer">
                  <Camera size={18} /> Activate Webcam
                </Button>
              </div>
            )}
          </div>

          {cameraOn && (
            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <Button onClick={capture} disabled={done} className="cursor-pointer">
                <Camera size={17} /> Capture Pose ({photos.length + 1}/{POSES.length})
              </Button>
              <Button variant="secondary" onClick={stopCamera} className="cursor-pointer">
                Turn Off Camera
              </Button>
            </div>
          )}
        </div>

        {/* Pose Thumbnails & Requirements */}
        <div className="space-y-4.5 lg:col-span-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4.5 text-sm text-stone-700">
            <p className="font-display text-sm font-bold text-emerald-950 flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-700" /> Face Calibration Guidelines
            </p>
            <ul className="mt-2.5 space-y-2 text-xs sm:text-sm text-stone-600">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-700" /> Face the camera directly under good lighting
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-700" /> Align face within the oval HUD guide
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-700" /> Remove face masks and dark sunglasses
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-700" /> Single person in the camera frame
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-700">
                Captured Photos ({photos.length}/{POSES.length})
              </p>
              {photos.length > 0 && (
                <button
                  type="button"
                  onClick={clearPhotos}
                  className="flex items-center gap-1 text-xs sm:text-sm font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                >
                  <RotateCcw size={14} /> Reset all
                </button>
              )}
            </div>

            <div className="grid grid-cols-5 gap-2.5">
              {POSES.map((pose, i) => (
                <div
                  key={pose.text}
                  className="relative aspect-square overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-2xs"
                >
                  {photos[i] ? (
                    <>
                      <img
                        src={photos[i].url}
                        alt={`Pose ${i + 1}`}
                        className="h-full w-full -scale-x-100 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label={`Remove photo ${i + 1}`}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-rose-600 transition cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                      <span className="absolute bottom-1 left-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white shadow-2xs">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-stone-400">
                      <span className="font-display text-sm font-bold font-mono">{i + 1}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3.5">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs sm:text-sm font-semibold text-emerald-800 hover:text-emerald-900">
                <ImageUp size={16} /> Upload image files instead
                <input type="file" accept="image/jpeg,image/png" multiple onChange={addFiles} className="sr-only" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {warning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-sm font-medium text-amber-800">
          {warning}
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>

      <div className="flex items-center justify-between border-t border-[#f0eee6] pt-5">
        <p className="text-xs sm:text-sm text-stone-500">
          Minimum 3 clear face angles required for face recognition matching.
        </p>
        <Button onClick={upload} loading={saving} disabled={photos.length < 3} size="md">
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
