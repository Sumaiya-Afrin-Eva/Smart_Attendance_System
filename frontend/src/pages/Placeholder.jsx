import { Hammer } from 'lucide-react'

// Temporary page shown until the real page is built
export default function Placeholder({ title }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Hammer size={22} />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-navy-900">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        This page is under construction and will be available soon.
      </p>
    </div>
  )
}