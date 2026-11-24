import { useEffect, useState, useMemo } from 'react'
import {
  Scan,
  Plus,
  Search,
  Building2,
  Shield,
  GraduationCap,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  AlertCircle,
  X,
  KeyRound,
  Mail,
  Lock,
  Tv,
  CheckCircle2,
  Cpu,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api, { errorMessage } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

export default function KioskManagement() {
  const { user, switchDashboard } = useAuth()
  const navigate = useNavigate()

  const [kiosks, setKiosks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeType, setNoticeType] = useState('success') // success | error

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [switchingRole, setSwitchingRole] = useState(null)

  // Delete modal state
  const [kioskToDelete, setKioskToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Form State
  const initialForm = {
    dept_name: '',
    dept_code: '',
    location: '',
    access_code: 'admin123',
    system_admin_name: '',
    system_admin_email: '',
    system_admin_password: '',
    student_admin_name: '',
    student_admin_email: '',
    student_admin_password: '',
    notes: '',
  }
  const [form, setForm] = useState(initialForm)

  const fetchKiosks = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/admin/kiosks')
      setKiosks(data || [])
    } catch (err) {
      setNotice(errorMessage(err, 'Failed to fetch department kiosks.'))
      setNoticeType('error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKiosks()
  }, [])

  // Auto-fill suggested names/emails when dept_code changes
  const handleDeptCodeChange = (rawCode) => {
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    const lower = code.toLowerCase()

    setForm((prev) => ({
      ...prev,
      dept_code: code,
      system_admin_name: prev.system_admin_name || (code ? `${code} System Admin` : ''),
      system_admin_email: prev.system_admin_email || (lower ? `${lower}_sysadmin@kuet.ac.bd` : ''),
      student_admin_name: prev.student_admin_name || (code ? `${code} Student Admin` : ''),
      student_admin_email: prev.student_admin_email || (lower ? `${lower}_admin@kuet.ac.bd` : ''),
    }))
  }

  const handleCreateKiosk = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setNotice('')

    try {
      const payload = {
        dept_name: form.dept_name.trim(),
        dept_code: form.dept_code.trim().toUpperCase(),
        location: form.location.trim() || undefined,
        access_code: form.access_code.trim() || 'admin123',
        system_admin_email: form.system_admin_email.trim(),
        system_admin_password: form.system_admin_password,
        system_admin_name: form.system_admin_name.trim() || undefined,
        student_admin_email: form.student_admin_email.trim(),
        student_admin_password: form.student_admin_password,
        student_admin_name: form.student_admin_name.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }

      await api.post('/admin/kiosks', payload)
      setNotice(`Department kiosk for ${payload.dept_name} (${payload.dept_code}) provisioned successfully! Independent admin dashboards are active.`)
      setNoticeType('success')
      setShowModal(false)
      setForm(initialForm)
      await fetchKiosks()
    } catch (err) {
      setNotice(errorMessage(err, 'Failed to provision department kiosk.'))
      setNoticeType('error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteKiosk = async () => {
    if (!kioskToDelete) return
    setDeleting(true)
    try {
      await api.delete(`/admin/kiosks/${kioskToDelete.dept_code}`)
      setNotice(`Department kiosk for ${kioskToDelete.dept_code} and its admin accounts removed successfully.`)
      setNoticeType('success')
      setKioskToDelete(null)
      await fetchKiosks()
    } catch (err) {
      setNotice(errorMessage(err, 'Failed to delete department kiosk.'))
      setNoticeType('error')
    } finally {
      setDeleting(false)
    }
  }

  const handleCopyLink = (kiosk) => {
    const fullUrl = `${window.location.origin}${kiosk.kiosk_url}`
    navigator.clipboard.writeText(fullUrl)
    setCopiedId(kiosk.id)
    setTimeout(() => setCopiedId(null), 2200)
  }

  const handleSwitchToAdmin = async (targetRole, dashboardPath) => {
    if (switchingRole) return
    setSwitchingRole(targetRole)
    try {
      if (switchDashboard) {
        await switchDashboard(targetRole)
      }
      navigate(dashboardPath)
    } catch (err) {
      console.error('Failed to switch dashboard view:', err)
      navigate(dashboardPath)
    } finally {
      setSwitchingRole(null)
    }
  }

  const filteredKiosks = useMemo(() => {
    if (!search.trim()) return kiosks
    const q = search.toLowerCase()
    return kiosks.filter(
      (k) =>
        k.dept_name?.toLowerCase().includes(q) ||
        k.dept_code?.toLowerCase().includes(q) ||
        k.location?.toLowerCase().includes(q) ||
        k.system_admin_email?.toLowerCase().includes(q) ||
        k.student_admin_email?.toLowerCase().includes(q)
    )
  }, [kiosks, search])

  const stats = useMemo(() => {
    const total = kiosks.length
    const active = kiosks.filter((k) => k.status === 'Active').length
    const dashboards = total * 2
    return { total, active, dashboards }
  }, [kiosks])

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-2xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <Scan size={13} className="text-emerald-700" />
                Department Infrastructure
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Kiosk Management
            </h2>
            <p className="text-sm text-stone-600 max-w-2xl">
              Configure attendance kiosks for academic departments. Provisioning a new department kiosk
              automatically sets up isolated System Admin and Student Admin dashboards with completely independent records.
            </p>
          </div>

          <button
            onClick={() => {
              setForm(initialForm)
              setShowModal(true)
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-2xs transition hover:bg-emerald-900 focus:ring-2 focus:ring-emerald-700/20 cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Plus size={16} />
            Provision New Dept Kiosk
          </button>
        </div>
      </section>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-sm font-medium shadow-2xs ${
            noticeType === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {noticeType === 'error' ? (
              <AlertCircle size={18} className="shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
            )}
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice('')}
            className="text-stone-400 hover:text-stone-600 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Quick Metrics */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Total Kiosks</p>
            <p className="mt-1 font-display text-3xl font-bold text-stone-900">{stats.total}</p>
            <p className="mt-0.5 text-xs text-stone-500">Configured departments</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
            <Scan size={22} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Active Stations</p>
            <p className="mt-1 font-display text-3xl font-bold text-stone-900">{stats.active}</p>
            <p className="mt-0.5 text-xs text-stone-500">Ready for scanning</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200">
            <Tv size={22} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Provisioned Dashboards</p>
            <p className="mt-1 font-display text-3xl font-bold text-stone-900">{stats.dashboards}</p>
            <p className="mt-0.5 text-xs text-stone-500">System & Student Admin views</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-700 ring-1 ring-purple-200">
            <Layers size={22} />
          </div>
        </div>
      </section>

      {/* Filter / Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search by department name, code, email, or room..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white pl-10 pr-4 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-2xs outline-none"
          />
        </div>
        <p className="text-xs text-stone-500">
          Showing <span className="font-semibold text-stone-800">{filteredKiosks.length}</span> department kiosks
        </p>
      </div>

      {/* Kiosks Grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-stone-200 bg-white">
          <div className="flex items-center gap-3 text-stone-500 text-sm font-medium">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
            Loading department kiosks...
          </div>
        </div>
      ) : filteredKiosks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <Building2 size={36} className="mx-auto text-stone-400" />
          <p className="mt-3 text-base font-semibold text-stone-800">No department kiosks found</p>
          <p className="mt-1 text-sm text-stone-500">
            {search ? 'Try clearing your search query.' : 'Click "Provision New Dept Kiosk" to create one.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredKiosks.map((kiosk) => {
            const isDefault = kiosk.dept_code === 'CSE' || kiosk.dept_code === 'EEE'
            const sysRole = kiosk.dept_code === 'CSE' ? 'system_admin' : `${kiosk.dept_code.toLowerCase()}_system_admin`
            const stuRole = kiosk.dept_code === 'CSE' ? 'admin' : `${kiosk.dept_code.toLowerCase()}_admin`

            return (
              <div
                key={kiosk.dept_code}
                className="group relative flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs transition hover:border-emerald-200 hover:shadow-sm"
              >
                {/* Card Header */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 font-bold font-display text-base border border-emerald-200/80 shadow-2xs">
                        {kiosk.dept_code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-lg font-bold text-stone-900 leading-tight">
                            {kiosk.dept_name}
                          </h3>
                          {isDefault && (
                            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-600">
                              System Default
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-stone-400" />
                            {kiosk.location || 'Campus Academic Area'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        {kiosk.status}
                      </span>
                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => setKioskToDelete(kiosk)}
                          title="Delete Department Kiosk & Accounts"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-stone-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Provisioned Dashboards Section */}
                  <div className="mt-5 space-y-2.5 border-t border-stone-100 pt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Provisioned Admin Dashboards
                    </p>

                    {/* System Admin Account Card */}
                    <div className="flex items-center justify-between rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 text-purple-800">
                          <Shield size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-800 truncate">
                            {kiosk.dept_code} System Admin
                          </p>
                          <p className="text-stone-500 truncate">{kiosk.system_admin_email}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSwitchToAdmin(sysRole, kiosk.system_admin_dashboard)}
                        disabled={Boolean(switchingRole)}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-semibold text-stone-700 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer disabled:opacity-50 shrink-0 ml-2"
                      >
                        <span>{switchingRole === sysRole ? 'Switching...' : 'Open View'}</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>

                    {/* Student Admin Account Card */}
                    <div className="flex items-center justify-between rounded-xl border border-stone-200/70 bg-stone-50/70 p-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                          <GraduationCap size={15} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-800 truncate">
                            {kiosk.dept_code} Student Admin
                          </p>
                          <p className="text-stone-500 truncate">{kiosk.student_admin_email}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSwitchToAdmin(stuRole, kiosk.student_admin_dashboard)}
                        disabled={Boolean(switchingRole)}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-semibold text-stone-700 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 cursor-pointer disabled:opacity-50 shrink-0 ml-2"
                      >
                        <span>{switchingRole === stuRole ? 'Switching...' : 'Open View'}</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Kiosk Station Deployment Section */}
                  <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-[#fbfaf8] p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-stone-700 flex items-center gap-1.5">
                        <Tv size={14} className="text-emerald-700" />
                        Station URL:{' '}
                        <code className="text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 font-mono">
                          {kiosk.kiosk_url}
                        </code>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(kiosk)}
                          className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600 transition hover:bg-stone-50 cursor-pointer"
                          title="Copy Full Station URL"
                        >
                          {copiedId === kiosk.id ? (
                            <>
                              <Check size={12} className="text-emerald-600" />
                              <span className="text-emerald-700 font-bold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        <a
                          href={kiosk.kiosk_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-800 px-2 py-1 text-[11px] font-semibold text-white shadow-2xs transition hover:bg-emerald-900 cursor-pointer"
                        >
                          <span>Launch Station</span>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] text-stone-500">
                      Physical device can be pointed to this URL on demand. Data saved at this station is strictly scoped to {kiosk.dept_code}.
                    </p>
                  </div>
                </div>

                {/* Footer notes */}
                {kiosk.notes && (
                  <p className="mt-3 text-[11px] text-stone-400 italic">
                    Note: {kiosk.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CREATE KIOSK MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-3xl border border-stone-200 bg-white p-6 shadow-xl my-8">
            <div className="flex items-start justify-between border-b border-stone-100 pb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  <Plus size={12} />
                  New Kiosk Provisioning
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-stone-900">
                  Create Department Kiosk & Admins
                </h3>
                <p className="text-xs text-stone-500">
                  Fill in the department details and initial admin credentials. Data across departments will be stored independently.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateKiosk} className="mt-5 space-y-4 text-xs">
              {/* Department Basics */}
              <div className="space-y-3 rounded-2xl border border-stone-200 bg-[#fbfaf8] p-4">
                <p className="font-bold text-stone-800 text-sm flex items-center gap-1.5">
                  <Building2 size={16} className="text-emerald-700" />
                  Department Information
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Department Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Mechanical Engineering"
                      value={form.dept_name}
                      onChange={(e) => setForm({ ...form, dept_name: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Department Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ME"
                      value={form.dept_code}
                      onChange={(e) => handleDeptCodeChange(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 font-mono uppercase text-stone-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Kiosk Device Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Academic Complex, 2nd Floor Lobby"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Admin Access Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="admin123"
                      value={form.access_code}
                      onChange={(e) => setForm({ ...form, access_code: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                    <p className="mt-1 text-[10px] text-stone-400">Used during faculty/admin portal logins</p>
                  </div>
                </div>
              </div>

              {/* System Admin Account Details */}
              <div className="space-y-3 rounded-2xl border border-purple-200/60 bg-purple-50/20 p-4">
                <p className="font-bold text-purple-950 text-sm flex items-center gap-1.5">
                  <Shield size={16} className="text-purple-700" />
                  System Administrator Account (Independent)
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. ME System Admin"
                      value={form.system_admin_name}
                      onChange={(e) => setForm({ ...form, system_admin_name: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Login Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="me_sysadmin@kuet.ac.bd"
                      value={form.system_admin_email}
                      onChange={(e) => setForm({ ...form, system_admin_email: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={form.system_admin_password}
                      onChange={(e) => setForm({ ...form, system_admin_password: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Student Admin Account Details */}
              <div className="space-y-3 rounded-2xl border border-sky-200/60 bg-sky-50/20 p-4">
                <p className="font-bold text-sky-950 text-sm flex items-center gap-1.5">
                  <GraduationCap size={16} className="text-sky-700" />
                  Student Administrator Account (Independent)
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. ME Student Admin"
                      value={form.student_admin_name}
                      onChange={(e) => setForm({ ...form, student_admin_name: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Login Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="me_admin@kuet.ac.bd"
                      value={form.student_admin_email}
                      onChange={(e) => setForm({ ...form, student_admin_email: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-stone-700 mb-1">
                      Password <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      placeholder="••••••••"
                      value={form.student_admin_password}
                      onChange={(e) => setForm({ ...form, student_admin_password: e.target.value })}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="Optional notes about this department kiosk deployment"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-800 outline-none focus:border-emerald-500"
                />
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-2 font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-5 py-2 font-semibold text-white shadow-2xs hover:bg-emerald-900 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Provisioning...' : 'Provision Kiosk & Admins'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {kioskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                <AlertCircle size={20} />
              </div>
              <h3 className="font-display text-lg font-bold text-stone-900">
                Delete {kioskToDelete.dept_code} Kiosk?
              </h3>
            </div>
            <p className="mt-3 text-xs text-stone-600">
              Are you sure you want to delete the kiosk for{' '}
              <span className="font-bold text-stone-800">{kioskToDelete.dept_name}</span>?
              This will remove the kiosk configuration and revoke access for both{' '}
              <span className="font-semibold">{kioskToDelete.system_admin_email}</span> and{' '}
              <span className="font-semibold">{kioskToDelete.student_admin_email}</span>.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setKioskToDelete(null)}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteKiosk}
                disabled={deleting}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
