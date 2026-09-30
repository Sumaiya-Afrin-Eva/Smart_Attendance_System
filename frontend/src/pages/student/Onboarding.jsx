import { useState } from 'react'
import { Check, GraduationCap, LogOut, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../lib/queries'
import ProfileForm from '../../components/student/ProfileForm'
import FaceCapture from '../../components/student/FaceCapture'
import CourseSelector from '../../components/student/CourseSelector'
import { Spinner } from '../../components/ui'

const STEPS = [
  { key: 'profile', title: 'Academic Details', text: 'Roll, department & semester' },
  { key: 'face', title: 'Face Photo Calibration', text: '5-angle face biometrics setup' },
  { key: 'courses', title: 'Course Curriculum', text: 'Enrolled courses for this term' },
]

export default function Onboarding() {
  const { user, onboarding, logout } = useAuth()
  const navigate = useNavigate()
  const { data: profile, isLoading } = useProfile()
  const firstOpen = STEPS.findIndex((s) => !onboarding?.[s.key])
  const [step, setStep] = useState(firstOpen === -1 ? 0 : firstOpen)

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const completedSteps = STEPS.filter((s) => onboarding?.[s.key]).length

  return (
    <div className="min-h-screen bg-[#faf9f5]">
      {/* Top Header */}
      <header className="border-b border-[#e7e5e0] bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex h-18 max-w-4xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-800 text-white shadow-2xs">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="font-display text-base font-bold text-stone-900">Smart Attendance</p>
              <p className="text-xs font-medium text-stone-500">KUET Student Registration</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-600 shadow-2xs hover:bg-stone-50 hover:text-stone-900 cursor-pointer"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-9 sm:px-8">
        {/* Title */}
        <div className="mb-7">
          <div className="mb-2.5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1 text-xs sm:text-sm font-semibold text-emerald-800 border border-emerald-200">
            <Sparkles size={14} className="text-emerald-700" />
            <span>One-Time Biometric Setup</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-stone-900">
            Welcome to Smart Attendance
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-stone-600">
            Signed in as <strong className="text-stone-900 font-semibold">{user?.email}</strong>. Complete these 3 steps to configure your face recognition profile.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="h-2 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-800 to-teal-600 transition-all duration-500"
            style={{ width: `${(completedSteps / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Stepper Card Buttons */}
        <ol className="mt-6 grid gap-3.5 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const done = onboarding?.[s.key]
            const active = i === step
            const reachable = i === 0 || onboarding?.[STEPS[i - 1].key]
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => reachable && setStep(i)}
                  disabled={!reachable}
                  aria-current={active ? 'step' : undefined}
                  className={`flex w-full items-center gap-3.5 rounded-2xl border p-4.5 text-left transition-all duration-200 cursor-pointer ${
                    active
                      ? 'border-emerald-600 bg-white ring-2 ring-emerald-600/20 shadow-xs'
                      : done
                      ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50/70'
                      : 'border-stone-200 bg-white opacity-70 hover:opacity-100 disabled:cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                      done
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : active
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {done ? <Check size={18} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-sm font-bold text-stone-900">{s.title}</span>
                    <span className="block truncate text-xs text-stone-500 mt-0.5">{s.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* Step Content Container */}
        <section className="mt-7 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs sm:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-[#f0eee6] pb-4.5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Step {step + 1} of 3</p>
              <h2 className="font-display text-xl font-bold text-stone-900">
                {STEPS[step].title}
              </h2>
            </div>
            <span className="text-xs sm:text-sm text-stone-500 font-medium">
              {STEPS[step].text}
            </span>
          </div>

          {isLoading ? (
            <Spinner label="Loading step data…" />
          ) : step === 0 ? (
            <ProfileForm profile={profile} onSaved={next} submitLabel="Save Details &amp; Continue" />
          ) : step === 1 ? (
            <FaceCapture onSaved={next} submitLabel="Save Face Photos &amp; Continue" />
          ) : (
            <CourseSelector profile={profile} lockSemester submitLabel="Finish Setup &amp; Enter Portal" />
          )}
        </section>
      </main>
    </div>
  )
}
