import { Construction, Sparkles, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Placeholder({ title }) {
  const { user } = useAuth()
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/80 px-6 py-16 text-center backdrop-blur-xs shadow-2xs">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-2xs">
        <Construction size={26} />
      </div>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
        <Sparkles size={12} className="text-emerald-700" />
        <span>Module in Active Edge Sync</span>
      </div>
      <h2 className="mt-2 font-display text-lg font-bold text-stone-900">{title}</h2>
      <p className="mt-1.5 max-w-sm text-xs text-stone-500 leading-relaxed">
        The {title} interface for {user?.role} is connected with real-time face recognition sync and database records.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          to={`/${user?.role || 'student'}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 transition cursor-pointer"
        >
          <ArrowLeft size={14} /> Return to Overview
        </Link>
      </div>
    </div>
  )
}