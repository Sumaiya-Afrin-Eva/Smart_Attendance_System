import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  Eye,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

const severityColors = {
  High: 'bg-rose-50 text-rose-700 ring-rose-200',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  Low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export default function SecurityAlerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    async function loadAlerts() {
      try {
        const { data } = await api.get('/admin/security-alerts')
        setAlerts(data)
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load security alerts.'))
      } finally {
        setLoading(false)
      }
    }
    loadAlerts()
  }, [])

  const updateAlert = (id, nextStatus) => {
    setAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, status: nextStatus } : alert))
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Security operations</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">Security alerts</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
            <BellRing size={15} /> 3 live alerts
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Open alerts', value: alerts.filter((a) => a.status === 'Open').length, icon: ShieldAlert, tone: 'rose' },
          { label: 'Investigations', value: alerts.filter((a) => a.status === 'Investigating').length, icon: Eye, tone: 'amber' },
          { label: 'Resolved', value: alerts.filter((a) => a.status === 'Resolved').length, icon: ShieldCheck, tone: 'emerald' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-stone-900">{value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-${tone}-50 text-${tone}-700 ring-1 ring-${tone}-200`}>
                <Icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </section>

      {notice && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">{notice}</div>}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">Loading security alerts...</div>
        ) : alerts.map((alert) => (
          <div key={alert.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold text-stone-900">{alert.title}</h3>
                  <p className="mt-1 text-sm text-stone-500">{alert.location}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${severityColors[alert.severity]}`}>{alert.severity}</span>
                <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">{alert.status}</span>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-stone-600">{alert.note}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => updateAlert(alert.id, 'Investigating')} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100">
                <Eye size={14} /> Investigate
              </button>
              <button type="button" onClick={() => updateAlert(alert.id, 'Resolved')} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                <CheckCheck size={14} /> Resolve
              </button>
              <button type="button" onClick={() => updateAlert(alert.id, 'Open')} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                <TimerReset size={14} /> Reset
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
