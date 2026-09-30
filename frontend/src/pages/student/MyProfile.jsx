import { ShieldCheck, UserRound } from 'lucide-react'
import { useProfile } from '../../lib/queries'
import { Card, Spinner } from '../../components/ui'
import ProfileForm from '../../components/student/ProfileForm'
import { useAuth } from '../../context/AuthContext'

export default function MyProfile() {
  const { user } = useAuth()
  const { data: profile, isLoading } = useProfile()
  if (isLoading) return <Spinner label="Loading student profile…" />

  const initials = user?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-stone-900">Academic Profile</h2>
        <p className="mt-0.5 text-xs text-stone-500 font-medium">
          Manage your verified KUET student identity and department placement.
        </p>
      </div>

      {/* Profile Overview Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200/90 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-4">
          {user.picture ? (
            <div className="relative">
              <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="h-13 w-13 rounded-2xl object-cover ring-2 ring-emerald-600/20 shadow-2xs"
              />
              <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-white">
                <CheckIcon size={11} strokeWidth={3} />
              </span>
            </div>
          ) : (
            <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-800 to-teal-700 font-display text-base font-bold text-white shadow-2xs">
              {initials}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-stone-900">{user.name}</h3>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                <ShieldCheck size={11} className="text-emerald-700" /> Verified Student
              </span>
            </div>
            <p className="text-xs text-stone-500 font-mono">{user.email}</p>
          </div>
        </div>

        {profile?.roll && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-center shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Student Roll</p>
              <p className="font-display text-sm font-bold text-stone-900 font-mono">{profile.roll}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2 text-center shadow-2xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Department</p>
              <p className="font-display text-sm font-bold text-emerald-900">{profile.department}</p>
            </div>
          </div>
        )}
      </div>

      {/* Profile Form Card */}
      <Card title="Student Academic Details" subtitle="Required for course registration and face recognition roster matching" icon={UserRound}>
        <div className="p-6">
          <ProfileForm profile={profile} />
        </div>
      </Card>
    </div>
  )
}

function CheckIcon({ size = 12, strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
