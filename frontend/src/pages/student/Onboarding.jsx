import { GraduationCap, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../lib/queries'
import ProfileForm from '../../components/student/ProfileForm'
import { Spinner } from '../../components/ui'

export default function Onboarding() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: profile, isLoading } = useProfile()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#faf9f5]">
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
        <div className="mb-7">
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-stone-900">
            Complete Your Student Registration
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-stone-600">
            Signed in as <strong className="text-stone-900 font-semibold">{user?.email}</strong>. Enter your academic details to continue. Your admin-approved photo is used by the attendance kiosk.
          </p>
        </div>

        <section className="mt-7 rounded-2xl border border-stone-200/90 bg-white p-6 shadow-2xs sm:p-8">
          <div className="mb-6 border-b border-[#f0eee6] pb-4.5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Student registration</p>
              <h2 className="font-display text-xl font-bold text-stone-900">Academic Details</h2>
            </div>
          </div>

          {isLoading ? (
            <Spinner label="Loading step data…" />
          ) : (
            <ProfileForm
              profile={profile}
              onSaved={() => navigate('/student')}
              submitLabel="Save Details &amp; Enter Portal"
            />
          )}
        </section>
      </main>
    </div>
  )
}
