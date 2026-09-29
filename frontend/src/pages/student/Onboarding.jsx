import { useState } from 'react'
import { Check, GraduationCap, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../lib/queries'
import ProfileForm from '../../components/student/ProfileForm'
import FaceCapture from '../../components/student/FaceCapture'
import CourseSelector from '../../components/student/CourseSelector'
import { Spinner } from '../../components/ui'

const STEPS = [
  { key: 'profile', title: 'Academic Details', text: 'Roll, department & semester' },
  { key: 'face', title: 'Face Photo Calibration', text: '5-angle face recognition setup' },
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
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-800 text-white shadow-xs">
              <GraduationCap size={22} />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-slate-900">Smart Attendance</p>
              <p className="text-[11px] font-medium text-slate-500">KUET Student Registration</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Title */}
        <div className="mb-6">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 border border-teal-100">
            <Sparkles size={13} className="text-teal-600" />
            <span>One-Time System Setup</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome to Smart Attendance
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Signed in as <strong className="text-slate-700">{user?.email}</strong>. Complete these 3 steps to configure your face recognition profile.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-700 to-teal-500 transition-all duration-500"
            style={{ width: `${(completedSteps / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Stepper Card Buttons */}
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
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
                  className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer ${
                    active
                      ? 'border-teal-600 bg-white ring-2 ring-teal-600/20 shadow-xs'
                      : done
                      ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/60'
                      : 'border-slate-200 bg-white opacity-70 hover:opacity-100 disabled:cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-colors ${
                      done
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : active
                        ? 'bg-teal-700 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {done ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-xs font-bold text-slate-900">{s.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">{s.text}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* Step Content Container */}
        <section className="mt-6 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs sm:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Step {step + 1} of 3</p>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {STEPS[step].title}
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-medium">
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
