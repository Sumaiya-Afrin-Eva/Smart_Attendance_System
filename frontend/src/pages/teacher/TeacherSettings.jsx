import { BellRing, ShieldCheck, UserCircle2, LockKeyhole } from 'lucide-react'

export default function TeacherSettings() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Account</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-stone-900">Faculty settings</h2>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-3"><UserCircle2 className="text-emerald-700" size={20} /> <h3 className="font-semibold text-stone-900">Profile</h3></div>
          <div className="mt-4 space-y-3 text-sm text-stone-600">
            <p><span className="font-semibold text-stone-800">Name:</span> Prof. Rahman</p>
            <p><span className="font-semibold text-stone-800">Email:</span> teacher@kuet.ac.bd</p>
            <p><span className="font-semibold text-stone-800">Department:</span> Computer Science & Engineering</p>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-3"><LockKeyhole className="text-emerald-700" size={20} /> <h3 className="font-semibold text-stone-900">Security</h3></div>
          <div className="mt-4 space-y-3 text-sm text-stone-600">
            <p>Google account linked: active</p>
            <p>Two-step verification: enabled</p>
            <button className="mt-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 cursor-pointer">Change password</button>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs md:col-span-2">
          <div className="flex items-center gap-3"><BellRing className="text-emerald-700" size={20} /> <h3 className="font-semibold text-stone-900">Notifications</h3></div>
          <div className="mt-4 space-y-3 text-sm text-stone-600">
            <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
              <span>Low attendance alerts</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-emerald-700" />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
              <span>Class reminder emails</span>
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-emerald-700" />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
              <span>Weekly analytics summary</span>
              <input type="checkbox" className="h-4 w-4 accent-emerald-700" />
            </label>
          </div>
        </div>
      </section>
    </div>
  )
}
