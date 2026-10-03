import { useEffect, useState } from 'react'
import {
  BellRing,
  Lock,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Wrench,
} from 'lucide-react'
import api, { errorMessage } from '../../lib/api'

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    googleLogin: { enabled: true },
    facialVerification: { enabled: true },
    autoBackup: { enabled: true },
    emailAlerts: { enabled: false },
    roleLock: { enabled: true },
    instName: { value: 'Khulna University of Engineering & Technology' },
    deptName: { value: 'Department of Computer Science & Engineering' },
    instLogo: { value: '/kuet_logo.png' }
  })
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await api.get('/admin/settings')
        const nextSettings = {}
        for (const item of data) {
          nextSettings[item.key] = item
        }
        setSettings((current) => ({ ...current, ...nextSettings }))
      } catch (error) {
        setNotice(errorMessage(error, 'Failed to load system settings.'))
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const toggleSetting = async (key) => {
    const nextValue = !settings[key]?.enabled
    try {
      await api.put(`/admin/settings/${key}`, { enabled: nextValue })
      setSettings((current) => ({
        ...current,
        [key]: { ...current[key], enabled: nextValue }
      }))
    } catch (error) {
      setNotice(errorMessage(error, 'Setting could not be updated.'))
    }
  }

  const updateStringSetting = async (key, newValue) => {
    try {
      await api.put(`/admin/settings/${key}`, { value: newValue })
      setSettings((current) => ({
        ...current,
        [key]: { ...current[key], value: newValue }
      }))
      setNotice('Setting saved successfully.')
      setTimeout(() => setNotice(''), 3000)
    } catch (error) {
      setNotice(errorMessage(error, 'Setting could not be updated.'))
    }
  }

  const toggleRows = [
    { key: 'googleLogin', label: 'Google academic sign-in', description: 'Allow KUET Gmail and faculty accounts to sign in securely', icon: ShieldCheck },
    { key: 'facialVerification', label: 'Face biometrics verification', description: 'Require facial confirmation before attendance is accepted', icon: Lock },
    { key: 'autoBackup', label: 'Auto backup', description: 'Create scheduled backups of student and teacher records', icon: BellRing },
    { key: 'emailAlerts', label: 'Email notifications', description: 'Send alerts when attendance anomalies or spoofing events occur', icon: ToggleRight },
    { key: 'roleLock', label: 'Role-based access lock', description: 'Block unauthorized role changes and privilege escalation', icon: Wrench },
  ]
  
  const textRows = [
    { key: 'instName', label: 'Institution Name', description: 'The full name of the university or institute', icon: Wrench },
    { key: 'deptName', label: 'Department Name', description: 'The name of the department', icon: Wrench },
    { key: 'instLogo', label: 'Institution Logo URL', description: 'URL or path to the institution logo', icon: Wrench },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-[#f4f3f1] p-5 shadow-2xs">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">System controls</p>
            <h2 className="mt-2 font-display text-3xl font-bold text-stone-900">System settings</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <ShieldCheck size={15} /> policy synced
          </div>
        </div>
      </section>

      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500">Loading settings...</div>
        ) : (
          <>
            <h3 className="font-display text-xl font-bold text-stone-900 pt-2 px-1">Security & Features</h3>
            {toggleRows.map(({ key, label, description, icon: Icon }) => (
              <div key={key} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-stone-900">{label}</h3>
                      <p className="mt-1 text-sm text-stone-500">{description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleSetting(key)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold cursor-pointer ${settings[key]?.enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-stone-100 text-stone-700 ring-1 ring-stone-200'}`}
                  >
                    {settings[key]?.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    {settings[key]?.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            ))}
            
            <h3 className="font-display text-xl font-bold text-stone-900 pt-6 px-1">Customization</h3>
            {textRows.map(({ key, label, description, icon: Icon }) => (
              <StringSettingRow 
                key={key}
                settingKey={key}
                label={label}
                description={description}
                icon={Icon}
                settings={settings}
                updateStringSetting={updateStringSetting}
              />
            ))}
          </>
        )}
      </section>
    </div>
  )
}

function StringSettingRow({ settingKey, label, description, icon: Icon, settings, updateStringSetting }) {
  const [localValue, setLocalValue] = useState(settings[settingKey]?.value || '')
  
  useEffect(() => {
    setLocalValue(settings[settingKey]?.value || '')
  }, [settings[settingKey]?.value, settingKey])

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-50 text-stone-700 ring-1 ring-stone-200">
            <Icon size={18} />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-stone-900">{label}</h3>
            <p className="mt-1 text-sm text-stone-500">{description}</p>
          </div>
        </div>
        
        <div className="flex gap-3 pl-14">
          <input 
            type="text" 
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
          <button 
            onClick={() => updateStringSetting(settingKey, localValue)}
            disabled={localValue === settings[settingKey]?.value}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
              localValue === settings[settingKey]?.value 
                ? 'bg-emerald-600 disabled:opacity-100 cursor-default' 
                : 'bg-stone-900 hover:bg-stone-800 cursor-pointer'
            }`}
          >
            {localValue === settings[settingKey]?.value ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
